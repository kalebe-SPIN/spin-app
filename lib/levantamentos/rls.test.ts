// Testes de RLS e do fluxo de status (migrations 162/163) num Postgres local
// (PGlite) com auth/storage simulados como no Supabase. Não toca no banco real.
// Cenários da especificação: dois consultores, técnico de campo, automação
// (nunca aprova), admin, inativo e candidato.
import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = (n: string) => readFileSync(resolve(process.cwd(), "supabase/migrations", n), "utf8");

const U = {
  admin: "00000000-0000-0000-0000-00000000000a", c1: "00000000-0000-0000-0000-0000000000c1",
  c2: "00000000-0000-0000-0000-0000000000c2", tec: "00000000-0000-0000-0000-0000000000f1",
  auto: "00000000-0000-0000-0000-0000000000a7", inativo: "00000000-0000-0000-0000-0000000000d0",
  cand: "00000000-0000-0000-0000-0000000000ca",
};
const P1 = "10000000-0000-0000-0000-000000000001";
const P2 = "10000000-0000-0000-0000-000000000002";

async function montarBanco() {
  const db = new PGlite();
  await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema storage;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid default auth.uid());
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable
  as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
create policy outro_ler on storage.objects for select to authenticated using (bucket_id = 'outro');
create type public.user_role as enum ('admin','representante','instalador','colaborador','vendedor_servicos','candidato','profissional_campo');
create table public.profiles (id uuid primary key references auth.users(id), nome_completo text default '',
  role public.user_role not null default 'colaborador', ativo boolean not null default true);
create table public.projetos (id uuid primary key default gen_random_uuid(), consultor_id uuid references public.profiles(id), cliente_razao_social text);
create table public.execucoes_servicos (id uuid primary key default gen_random_uuid(), projeto_id uuid references public.projetos(id),
  responsavel_tecnico uuid references auth.users(id));
`);
  // aplicar duas vezes: reaplicar tem que ser inofensivo
  for (let i = 0; i < 2; i++) {
    await db.exec(migration("162_levantamentos.sql"));
    await db.exec(migration("163_checklist_modelos.sql"));
  }
  await db.exec(`
grant usage on schema public, auth, storage to authenticated;
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;
grant all on storage.objects, storage.buckets to authenticated;
insert into auth.users (id, email) values
 ('${U.admin}','admin@x'),('${U.c1}','c1@x'),('${U.c2}','c2@x'),('${U.tec}','tec@x'),('${U.auto}','automacao@x'),('${U.inativo}','in@x'),('${U.cand}','cand@x');
insert into public.profiles (id, role, ativo) values
 ('${U.admin}','admin',true),('${U.c1}','representante',true),('${U.c2}','representante',true),
 ('${U.tec}','profissional_campo',true),('${U.auto}','automacao',true),('${U.inativo}','representante',false),('${U.cand}','candidato',true);
insert into public.projetos (id, consultor_id, cliente_razao_social) values ('${P1}','${U.c1}','Cliente 1'),('${P2}','${U.c2}','Cliente 2');
insert into public.execucoes_servicos (projeto_id, responsavel_tecnico) values ('${P1}','${U.tec}');
insert into storage.objects (bucket_id, name) values ('outro', 'abc/def.jpg'), ('outro', 'semPasta.jpg');
`);
  return db;
}

describe("levantamentos — RLS e fluxo de status", () => {
  it("cumpre os cenários da especificação", async () => {
    const db = await montarBanco();
    const falhas: string[] = [];
    const ok = (cond: unknown, msg: string) => { if (!cond) falhas.push(msg); };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = (sql: string, p?: unknown[]) => db.query<any>(sql, p);
    async function como<T>(uid: string, fn: () => Promise<T>): Promise<T> {
      await db.exec("reset role");
      await q(`select set_config('request.jwt.claim.sub', $1, false)`, [uid]);
      await db.exec("set role authenticated");
      try { return await fn(); } finally { await db.exec("reset role"); }
    }
    async function tenta<T>(fn: () => Promise<T>): Promise<{ r?: T; erro?: string }> {
      try { return { r: await fn() }; } catch (e) { return { erro: (e as Error).message }; }
    }
    const modelo = async (cod: string) =>
      (await q(`select id, versao from public.checklist_modelos where codigo = $1 and ativo`, [cod])).rows[0];
    const criar = (uid: string, fin: string, m: { id: string; versao: number }, projeto: string | null) =>
      como(uid, () => tenta(() => q(
        `insert into public.levantamentos (finalidade, modelo_id, modelo_versao, projeto_id, consultor_id, cliente_nome)
         values ($1, $2, $3, $4, $5, 'X') returning id`, [fin, m.id, m.versao, projeto, uid])));
    const ve = async (uid: string, id: string) =>
      (await como(uid, () => q(`select count(*)::int n from public.levantamentos where id = $1`, [id]))).rows[0].n === 1;
    const objeto = (uid: string, nome: string) =>
      como(uid, () => tenta(() => q(`insert into storage.objects (bucket_id, name) values ('levantamentos', $1)`, [nome])));
    const linha = async (id: string) => (await q(`select * from public.levantamentos where id = $1`, [id])).rows[0];

    const mFv = await modelo("fv"), mPn = await modelo("padrao_novo");
    ok(mFv && mPn && (await modelo("aumento_carga")), "seed criou os 3 modelos ativos");
    ok((await q(`select count(*)::int n from public.checklist_modelos`)).rows[0].n === 3, "reaplicar não duplicou os modelos");

    // criação e vínculo com projeto
    let r = await criar(U.c1, "fv", mFv, P1); ok(!r.erro, "consultor 1 cria ligado ao próprio projeto");
    const L1: string = r.r!.rows[0].id;
    r = await criar(U.c1, "fv", mFv, P2); ok(/acesso a esse projeto/.test(r.erro || ""), "consultor 1 não liga ao projeto do consultor 2");
    r = await criar(U.tec, "padrao_novo", mPn, P1); ok(!r.erro, "técnico cria ligado ao projeto da OS dele");
    const L2: string = r.r!.rows[0].id;
    r = await criar(U.tec, "padrao_novo", mPn, P2); ok(r.erro, "técnico não liga ao projeto sem OS dele");
    r = await como(U.c1, () => tenta(() => q(`insert into public.levantamentos (finalidade, modelo_id, modelo_versao, consultor_id, status) values ('fv', $1, 1, $2, 'enviado')`, [mFv.id, U.c1])));
    ok(/começa como rascunho/.test(r.erro || ""), "novo não nasce enviado");
    ok((await criar(U.inativo, "fv", mFv, null)).erro, "inativo não cria");
    ok((await criar(U.cand, "fv", mFv, null)).erro, "candidato não cria");
    ok((await criar(U.auto, "fv", mFv, null)).erro, "automação não cria");
    r = await como(U.c1, () => tenta(() => q(`insert into public.levantamentos (finalidade, modelo_id, modelo_versao, consultor_id) values ('fv', $1, 1, $2)`, [mFv.id, U.c2])));
    ok(r.erro, "consultor não cria em nome de outro");

    // visibilidade
    ok(await ve(U.c1, L2), "dono do projeto vê o levantamento do técnico");
    ok(!(await ve(U.c2, L1)) && !(await ve(U.c2, L2)), "consultor 2 não vê os do consultor 1");
    ok((await ve(U.admin, L1)) && (await ve(U.auto, L1)), "admin e automação veem");
    ok((await como(U.c2, () => q(`update public.levantamentos set cliente_nome = 'hack' where id = $1`, [L1]))).affectedRows === 0,
      "consultor 2 não altera o do consultor 1");
    ok((await como(U.c2, () => q(`select count(*)::int n from public.levantamento_eventos where levantamento_id = $1`, [L1]))).rows[0].n === 0,
      "consultor 2 não vê o histórico do consultor 1");

    // edição do consultor
    r = await como(U.c1, () => tenta(() => q(`update public.levantamentos set status = 'aguardando_aprovacao' where id = $1`, [L1])));
    ok(/não permitida/.test(r.erro || ""), "consultor não pula etapa");
    await como(U.c1, () => q(`update public.levantamentos set respostas = '{"cliente":"Ana","consumo":350}',
      observacao_projetista = 'hack', finalidade = 'padrao_novo' where id = $1`, [L1]));
    let l = await linha(L1);
    ok(l.respostas.consumo === 350 && l.observacao_projetista === null && l.finalidade === "fv",
      "consultor salva respostas; campo do projetista e finalidade não mudam");

    // arquivos e storage
    ok(!(await objeto(U.c1, `${L1}/fotos/fatura/a.jpg`)).erro, "consultor envia foto no próprio levantamento");
    ok((await objeto(U.c2, `${L1}/fotos/fatura/b.jpg`)).erro, "consultor 2 não envia foto no do consultor 1");
    ok((await objeto(U.c1, `${L1}/pranchas/v1/x.pdf`)).erro, "consultor não grava prancha no bucket");
    ok((await objeto(U.c1, `nao-uuid/fotos/x.jpg`)).erro, "caminho fora do padrão é recusado");
    r = await como(U.c1, () => tenta(() => q(`insert into public.levantamento_arquivos (levantamento_id, tipo, storage_path, mime) values ($1, 'prancha_pdf', $2, 'application/pdf')`, [L1, `${L1}/pranchas/v1/x.pdf`])));
    ok(r.erro, "consultor não anexa prancha");
    r = await como(U.c1, () => tenta(() => q(`insert into public.levantamento_arquivos (levantamento_id, tipo, slot, storage_path, mime) values ($1, 'foto', 'fatura', $2, 'image/jpeg')`, [L1, `${L1}/fotos/fatura/a.jpg`])));
    ok(!r.erro, "consultor registra a foto do slot");
    ok(!(await como(U.c1, () => tenta(() => q(`select count(*) from storage.objects`)))).erro,
      "ler storage.objects com caminhos sem uuid de outros buckets não dá erro");
    ok((await como(U.c2, () => q(`select count(*)::int n from storage.objects where bucket_id = 'levantamentos'`))).rows[0].n === 0,
      "consultor 2 não lê as fotos do consultor 1");

    // envio
    await como(U.c1, () => q(`update public.levantamentos set status = 'enviado' where id = $1`, [L1]));
    l = await linha(L1);
    ok(l.status === "enviado" && l.enviado_em, "consultor envia (enviado_em gravado)");
    ok((await como(U.c1, () => q(`update public.levantamento_arquivos set deleted_at = now() where levantamento_id = $1`, [L1]))).affectedRows === 0,
      "depois de enviado o consultor não remove fotos");

    // ciclo da automação (docs do contrato)
    r = await como(U.auto, () => tenta(() => q(`select id from public.levantamentos where status = 'enviado' and deleted_at is null order by enviado_em limit 10`)));
    ok(r.r?.rows.some((x: { id: string }) => x.id === L1), "automação lista a fila");
    ok((await como(U.auto, () => q(`update public.levantamentos set status = 'em_projeto' where id = $1 and status = 'enviado'`, [L1]))).affectedRows === 1,
      "automação assume");
    ok((await como(U.auto, () => q(`update public.levantamentos set status = 'em_projeto' where id = $1 and status = 'enviado'`, [L1]))).affectedRows === 0,
      "segunda tentativa de assumir volta 0 linhas");
    ok((await linha(L1)).projetista_id === U.auto, "projetista_id = automação");
    ok(!(await objeto(U.auto, `${L1}/pranchas/v1/UNIFILAR_ANA_FV.pdf`)).erro, "automação grava prancha");
    r = await como(U.auto, () => tenta(() => q(`insert into public.levantamento_arquivos (levantamento_id, tipo, storage_path, mime, versao_prancha) values ($1, 'prancha_pdf', $2, 'application/pdf', 1) returning id`, [L1, `${L1}/pranchas/v1/UNIFILAR_ANA_FV.pdf`])));
    ok(!r.erro, "automação registra a prancha");
    const PR: string = r.r!.rows[0].id;
    await como(U.auto, () => q(`update public.levantamentos set status = 'aguardando_aprovacao',
      pendencias = '[{"campo":"num_poste","mensagem":"Plaqueta ilegível","origem":"projetista"}]', observacao_projetista = 'Unifilar gerado' where id = $1`, [L1]));
    l = await linha(L1);
    ok(l.status === "aguardando_aprovacao" && l.processado_em && l.observacao_projetista === "Unifilar gerado", "automação devolve para aprovação");
    r = await como(U.auto, () => tenta(() => q(`update public.levantamentos set status = 'aprovado' where id = $1`, [L1])));
    ok(/não permitida/.test(r.erro || ""), "automação NÃO aprova");
    ok((await como(U.c1, () => q(`update public.levantamentos set status = 'aprovado' where id = $1`, [L1]))).affectedRows === 0, "consultor NÃO aprova");
    await como(U.admin, () => q(`update public.levantamentos set status = 'aprovado' where id = $1`, [L1]));
    l = await linha(L1);
    ok(l.status === "aprovado" && l.aprovado_por === U.admin && l.aprovado_em, "admin aprova");
    const hist = (await como(U.c1, () => q(`select para_status from public.levantamento_eventos where levantamento_id = $1 and tipo = 'status'`, [L1]))).rows
      .map((x: { para_status: string }) => x.para_status);
    ok(["rascunho", "enviado", "em_projeto", "aguardando_aprovacao", "aprovado"].every((s) => hist.includes(s)), "histórico registra tudo");

    // pendência (técnico)
    await como(U.tec, () => q(`update public.levantamentos set status = 'enviado' where id = $1`, [L2]));
    r = await como(U.admin, () => tenta(() => q(`update public.levantamentos set status = 'com_pendencia' where id = $1`, [L2])));
    ok(/não permitida/.test(r.erro || ""), "devolver exige assumir antes");
    await como(U.admin, () => q(`update public.levantamentos set status = 'em_projeto' where id = $1`, [L2]));
    await como(U.admin, () => q(`update public.levantamentos set status = 'com_pendencia', pendencias = '[{"campo":"foto:poste","mensagem":"Refazer de perto","origem":"projetista"}]' where id = $1`, [L2]));
    await como(U.tec, () => q(`update public.levantamentos set respostas = '{"num_poste":"123"}', pendencias = '[]' where id = $1`, [L2]));
    l = await linha(L2);
    ok(l.pendencias.length === 1 && l.respostas.num_poste === "123", "técnico corrige; pendências só saem ao reenviar");
    ok(!(await objeto(U.tec, `${L2}/fotos/poste/n.jpg`)).erro, "com pendência o técnico refaz a foto");
    await como(U.tec, () => q(`update public.levantamentos set status = 'enviado', pendencias = '[]' where id = $1`, [L2]));
    l = await linha(L2);
    ok(l.status === "enviado" && l.pendencias.length === 0, "técnico reenvia e limpa as pendências");
    ok(!(await como(U.tec, () => tenta(() => q(`update public.levantamentos set status = 'rascunho' where id = $1`, [L2])))).erro, "desfaz o envio");
    await como(U.tec, () => q(`update public.levantamentos set status = 'enviado' where id = $1`, [L2]));

    // exclusão e remoção de arquivos
    r = await como(U.tec, () => tenta(() => q(`select public.excluir_levantamento($1)`, [L2])));
    ok(/Só dá para excluir/.test(r.erro || ""), "não exclui o já enviado");
    r = await criar(U.c1, "fv", mFv, null);
    const L3: string = r.r!.rows[0].id;
    await objeto(U.c1, `${L3}/fotos/qd/q.jpg`);
    const A3: string = (await como(U.c1, () => q(`insert into public.levantamento_arquivos (levantamento_id, tipo, slot, storage_path, mime) values ($1, 'foto', 'qd', $2, 'image/jpeg') returning id`, [L3, `${L3}/fotos/qd/q.jpg`]))).rows[0].id;
    ok((await como(U.c2, () => tenta(() => q(`select public.remover_arquivo_levantamento($1)`, [A3])))).erro, "consultor 2 não remove foto do 1");
    ok(!(await como(U.c1, () => tenta(() => q(`select public.remover_arquivo_levantamento($1)`, [A3])))).erro, "consultor remove foto do próprio rascunho");
    ok((await como(U.c1, () => tenta(() => q(`select public.remover_arquivo_levantamento($1)`, [PR])))).erro, "consultor não remove prancha");
    ok((await como(U.c2, () => tenta(() => q(`select public.excluir_levantamento($1)`, [L3])))).erro, "consultor 2 não exclui o do 1");
    ok(!(await como(U.c1, () => tenta(() => q(`select public.excluir_levantamento($1)`, [L3])))).erro, "consultor exclui o próprio rascunho");
    ok(!(await ve(U.c1, L3)) && !(await ve(U.admin, L3)), "excluído some para todos");
    ok(/não permitida/.test((await como(U.auto, () => tenta(() => q(`update public.levantamentos set status = 'cancelado' where id = $1`, [L2])))).erro || ""),
      "automação não cancela");
    ok(!(await como(U.admin, () => tenta(() => q(`update public.levantamentos set status = 'cancelado' where id = $1`, [L2])))).erro, "admin cancela");

    // modelos
    ok((await como(U.c1, () => q(`select count(*)::int n from public.checklist_modelos where ativo`))).rows[0].n === 3, "consultor lê os modelos");
    ok((await como(U.c1, () => tenta(() => q(`insert into public.checklist_modelos (codigo, versao, nome, definicao) values ('fv', 2, 'x', '{}')`)))).erro,
      "consultor não cria modelo");
    ok((await como(U.auto, () => q(`update public.checklist_modelos set nome = 'x'`))).affectedRows === 0, "automação não altera modelo");

    await db.close();
    expect(falhas).toEqual([]);
  }, 120_000);
});
