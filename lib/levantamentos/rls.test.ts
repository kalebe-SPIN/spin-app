// Testes de RLS e do fluxo de status (migrations 162/163/164) num Postgres
// local (PGlite) com auth/storage simulados como no Supabase. Não toca no
// banco real. Kalebe 2026-10-27: só admin e setor campo (profissional_campo,
// instalador) mexem nos levantamentos; representante não acessa; arquivos
// gerados só para o admin; automação/servidor nunca aprovam.
import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = (n: string) => readFileSync(resolve(process.cwd(), "supabase/migrations", n), "utf8");

const U = {
  admin: "00000000-0000-0000-0000-00000000000a",
  tec: "00000000-0000-0000-0000-0000000000f1",     // profissional_campo (responsável da OS)
  tec2: "00000000-0000-0000-0000-0000000000f2",    // instalador (mesmo setor)
  rep: "00000000-0000-0000-0000-0000000000c1",     // representante dono do projeto P1
  rep2: "00000000-0000-0000-0000-0000000000c2",
  auto: "00000000-0000-0000-0000-0000000000a7",
  inativo: "00000000-0000-0000-0000-0000000000d0",
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
create policy "projetos_diagramas_read_all" on storage.objects for select using (bucket_id = 'projetos-diagramas');
create type public.user_role as enum ('admin','representante','instalador','colaborador','vendedor_servicos','candidato','profissional_campo');
create table public.profiles (id uuid primary key references auth.users(id), nome_completo text default '',
  role public.user_role not null default 'colaborador', ativo boolean not null default true);
create table public.projetos (id uuid primary key default gen_random_uuid(), consultor_id uuid references public.profiles(id), cliente_razao_social text);
create table public.execucoes_servicos (id uuid primary key default gen_random_uuid(), projeto_id uuid references public.projetos(id),
  responsavel_tecnico uuid references auth.users(id));
create table public.projetos_diagramas (id uuid primary key default gen_random_uuid(), projeto_id uuid references public.projetos(id),
  tipo_desenho text, status text default 'gerando');
`);
  // aplicar duas vezes: reaplicar tem que ser inofensivo
  for (let i = 0; i < 2; i++) {
    await db.exec(migration("162_levantamentos.sql"));
    await db.exec(migration("163_checklist_modelos.sql"));
    await db.exec(migration("164_levantamentos_campo_admin.sql"));
    await db.exec(migration("167_modelos_v2_cargas.sql"));
    await db.exec(migration("168_levantamentos_compartilhar.sql"));
    await db.exec(migration("169_modelos_v3_medicao_coletiva.sql"));
  }
  await db.exec(`
grant usage on schema public, auth, storage to authenticated;
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;
grant all on storage.objects, storage.buckets to authenticated;
insert into auth.users (id, email) values
 ('${U.admin}','admin@x'),('${U.tec}','tec@x'),('${U.tec2}','tec2@x'),('${U.rep}','rep@x'),('${U.rep2}','rep2@x'),
 ('${U.auto}','automacao@x'),('${U.inativo}','in@x'),('${U.cand}','cand@x');
insert into public.profiles (id, role, ativo) values
 ('${U.admin}','admin',true),('${U.tec}','profissional_campo',true),('${U.tec2}','instalador',true),
 ('${U.rep}','representante',true),('${U.rep2}','representante',true),('${U.auto}','automacao',true),
 ('${U.inativo}','profissional_campo',false),('${U.cand}','candidato',true);
insert into public.projetos (id, consultor_id, cliente_razao_social) values ('${P1}','${U.rep}','Cliente 1'),('${P2}','${U.rep2}','Cliente 2');
insert into public.execucoes_servicos (projeto_id, responsavel_tecnico) values ('${P1}','${U.tec}');
insert into storage.objects (bucket_id, name) values ('outro', 'abc/def.jpg'), ('outro', 'semPasta.jpg'),
  ('projetos-diagramas', '${P1}/x/unifilar_ongrid-v1.pdf');
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
      await q(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', '', false)`, [uid]);
      await db.exec("set role authenticated");
      try { return await fn(); } finally { await db.exec("reset role"); }
    }
    /** servidor do app / robô: chave service_role, sem usuário (ignora RLS, passa pelo gatilho) */
    async function comoServidor<T>(fn: () => Promise<T>): Promise<T> {
      await db.exec("reset role");
      await q(`select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '{"role":"service_role"}', false)`);
      try { return await fn(); } finally { await q(`select set_config('request.jwt.claims', '', false)`); }
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
    const conta = async (uid: string, sql: string, p: unknown[] = []) => (await como(uid, () => q(sql, p))).rows[0].n as number;

    const mFv = await modelo("fv"), mPn = await modelo("padrao_novo");
    ok(mFv && mPn && (await modelo("aumento_carga")), "seed criou os 3 modelos ativos");
    ok((await q(`select count(*)::int n from public.checklist_modelos`)).rows[0].n === 7, "reaplicar não duplicou os modelos (3 v1 + 2 v2 + 2 v3)");
    ok(mFv.versao === 1 && mPn.versao === 3 && (await modelo("aumento_carga")).versao === 3, "169: padrão novo e aumento de carga ativos no v3; FV segue no v1");
    const tipoColetiva = (await q(`select c->>'tipo' t from public.checklist_modelos m, jsonb_array_elements(m.definicao->'secoes') s, jsonb_array_elements(s->'campos') c
      where m.codigo = 'aumento_carga' and m.versao = 3 and c->>'id' = 'coletiva'`)).rows[0]?.t;
    ok(tipoColetiva === "coletiva", "v3: relógios da medição coletiva");
    ok((await q(`select count(*)::int n from public.checklist_modelos where ativo`)).rows[0].n === 3, "um modelo ativo por finalidade");
    const tipoCargas = (await q(`select c->>'tipo' t from public.checklist_modelos m, jsonb_array_elements(m.definicao->'secoes') s, jsonb_array_elements(s->'campos') c
      where m.codigo = 'padrao_novo' and m.versao = 2 and c->>'id' = 'cargas_esp'`)).rows[0]?.t;
    ok(tipoCargas === "cargas", "v2: cargas especiais é lista de equipamentos");

    const compartilhar = (quem: string, lev: string, com: string) => como(quem, () => tenta(() =>
      q(`insert into public.levantamento_compartilhamentos (levantamento_id, usuario_id) values ($1, $2)`, [lev, com])));

    // ── quem cria: só o admin
    let r = await criar(U.admin, "fv", mFv, P1); ok(!r.erro, `admin cria ligado ao projeto${r.erro ? " — " + r.erro : ""}`);
    const L1: string = r.r!.rows[0].id;
    r = await criar(U.admin, "padrao_novo", mPn, P2); ok(!r.erro, "admin cria ligado a qualquer projeto");
    const L2: string = r.r!.rows[0].id;
    ok((await criar(U.tec, "fv", mFv, P1)).erro, "campo NÃO cria (nem no projeto da OS dele)");
    ok((await criar(U.tec, "fv", mFv, null)).erro, "campo NÃO cria avulso");
    ok((await criar(U.rep, "fv", mFv, P1)).erro, "representante NÃO cria (nem no próprio projeto)");
    ok((await criar(U.inativo, "fv", mFv, null)).erro, "inativo não cria");
    ok((await criar(U.cand, "fv", mFv, null)).erro, "candidato não cria");
    ok((await criar(U.auto, "fv", mFv, null)).erro, "automação não cria");
    r = await como(U.admin, () => tenta(() => q(`insert into public.levantamentos (finalidade, modelo_id, modelo_versao, consultor_id, status) values ('fv', $1, 1, $2, 'enviado')`, [mFv.id, U.admin])));
    ok(/começa como rascunho/.test(r.erro || ""), "novo não nasce enviado");
    r = await como(U.admin, () => tenta(() => q(`insert into public.levantamentos (finalidade, modelo_id, modelo_versao, consultor_id) values ('fv', $1, 1, $2)`, [mFv.id, U.tec])));
    ok(r.erro, "ninguém cria em nome de outro");

    // ── compartilhamento: o campo só vê o que o admin concede
    ok(!(await ve(U.tec, L1)) && !(await ve(U.tec2, L1)), "antes de compartilhar o campo não vê");
    ok((await compartilhar(U.tec, L1, U.tec)).erro, "campo não se auto-compartilha");
    ok((await compartilhar(U.rep, L1, U.tec)).erro, "representante não compartilha");
    ok(/setor campo/.test((await compartilhar(U.admin, L1, U.rep)).erro || ""), "admin não compartilha com quem não é do campo");
    ok(/setor campo/.test((await compartilhar(U.admin, L1, U.inativo)).erro || ""), "admin não compartilha com inativo");
    ok(!(await compartilhar(U.admin, L1, U.tec)).erro, "admin compartilha com o técnico");
    ok(await ve(U.tec, L1), "técnico vê o que foi compartilhado com ele");
    ok(!(await ve(U.tec2, L1)), "outro do campo NÃO vê o que não foi compartilhado com ele");
    ok(!(await ve(U.tec, L2)), "técnico não vê os outros levantamentos");
    ok((await conta(U.tec2, `select count(*)::int n from public.levantamento_compartilhamentos where levantamento_id = $1`, [L1])) === 0,
      "outro do campo não vê os compartilhamentos alheios");
    ok(!(await ve(U.rep, L1)) && !(await ve(U.rep2, L1)), "representante (mesmo dono do projeto) NÃO vê o levantamento");
    ok((await ve(U.admin, L1)) && (await ve(U.auto, L1)), "admin e automação veem");
    ok((await como(U.rep, () => q(`update public.levantamentos set cliente_nome = 'hack' where id = $1`, [L1]))).affectedRows === 0, "representante não altera");
    ok((await como(U.tec2, () => q(`update public.levantamentos set cliente_nome = 'hack' where id = $1`, [L1]))).affectedRows === 0, "campo sem compartilhamento não altera");
    ok((await conta(U.rep, `select count(*)::int n from public.levantamento_eventos where levantamento_id = $1`, [L1])) === 0, "representante não vê o histórico");
    ok(!(await compartilhar(U.admin, L1, U.tec2)).erro && (await ve(U.tec2, L1)), "admin compartilha com mais de um técnico");

    // ── edição pelo campo
    r = await como(U.tec, () => tenta(() => q(`update public.levantamentos set status = 'aguardando_aprovacao' where id = $1`, [L1])));
    ok(/não permitida/.test(r.erro || ""), "campo não pula etapa");
    await como(U.tec2, () => q(`update public.levantamentos set respostas = '{"cliente":"Ana","consumo":350}',
      observacao_projetista = 'hack', finalidade = 'padrao_novo' where id = $1`, [L1]));
    let l = await linha(L1);
    ok(l.respostas.consumo === 350 && l.observacao_projetista === null && l.finalidade === "fv",
      "técnico compartilhado preenche; campo do projetista e finalidade não mudam");
    await como(U.admin, () => q(`delete from public.levantamento_compartilhamentos where levantamento_id = $1 and usuario_id = $2`, [L1, U.tec2]));
    ok(!(await ve(U.tec2, L1)), "admin tira o compartilhamento e o técnico perde o acesso");

    // ── arquivos e storage
    ok(!(await objeto(U.tec, `${L1}/fotos/fatura/a.jpg`)).erro, "campo envia foto");
    ok((await objeto(U.rep, `${L1}/fotos/fatura/b.jpg`)).erro, "representante não envia foto");
    ok((await objeto(U.tec, `${L1}/pranchas/v1/x.pdf`)).erro, "campo não grava prancha no bucket");
    ok((await objeto(U.tec, `nao-uuid/fotos/x.jpg`)).erro, "caminho fora do padrão é recusado");
    r = await como(U.tec, () => tenta(() => q(`insert into public.levantamento_arquivos (levantamento_id, tipo, storage_path, mime) values ($1, 'prancha_pdf', $2, 'application/pdf')`, [L1, `${L1}/pranchas/v1/x.pdf`])));
    ok(r.erro, "campo não anexa prancha");
    r = await como(U.tec, () => tenta(() => q(`insert into public.levantamento_arquivos (levantamento_id, tipo, slot, storage_path, mime) values ($1, 'foto', 'fatura', $2, 'image/jpeg')`, [L1, `${L1}/fotos/fatura/a.jpg`])));
    ok(!r.erro, "campo registra a foto do slot");
    ok(!(await como(U.tec, () => tenta(() => q(`select count(*) from storage.objects`)))).erro,
      "ler storage.objects com caminhos sem uuid de outros buckets não dá erro");
    ok((await conta(U.rep, `select count(*)::int n from storage.objects where bucket_id = 'levantamentos'`)) === 0, "representante não lê as fotos");

    // ── envio
    await como(U.tec, () => q(`update public.levantamentos set status = 'enviado' where id = $1`, [L1]));
    l = await linha(L1);
    ok(l.status === "enviado" && l.enviado_em, "campo envia (enviado_em gravado)");
    ok((await como(U.tec, () => q(`update public.levantamento_arquivos set deleted_at = now() where levantamento_id = $1`, [L1]))).affectedRows === 0,
      "depois de enviado o campo não remove fotos");

    // ── ciclo da automação (contrato)
    r = await como(U.auto, () => tenta(() => q(`select id from public.levantamentos where status = 'enviado' and deleted_at is null order by enviado_em limit 10`)));
    ok(r.r?.rows.some((x: { id: string }) => x.id === L1), "automação lista a fila");
    ok((await como(U.auto, () => q(`update public.levantamentos set status = 'em_projeto' where id = $1 and status = 'enviado'`, [L1]))).affectedRows === 1, "automação assume");
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
    ok(/não permitida/.test((await como(U.auto, () => tenta(() => q(`update public.levantamentos set status = 'aprovado' where id = $1`, [L1])))).erro || ""),
      "automação NÃO aprova");
    ok((await como(U.tec, () => q(`update public.levantamentos set status = 'aprovado' where id = $1`, [L1]))).affectedRows === 0, "campo NÃO aprova");

    // ── arquivos gerados: só a equipe
    const sqlPrancha = `select count(*)::int n from public.levantamento_arquivos where levantamento_id = $1 and tipo = 'prancha_pdf'`;
    const sqlObj = `select count(*)::int n from storage.objects where name = $1`;
    ok((await conta(U.tec, sqlPrancha, [L1])) === 0 && (await conta(U.admin, sqlPrancha, [L1])) === 1, "campo não vê a prancha registrada; admin vê");
    ok((await conta(U.tec, sqlObj, [`${L1}/pranchas/v1/UNIFILAR_ANA_FV.pdf`])) === 0 && (await conta(U.admin, sqlObj, [`${L1}/pranchas/v1/UNIFILAR_ANA_FV.pdf`])) === 1,
      "campo não baixa a prancha; admin baixa");
    ok((await conta(U.tec, sqlObj, [`${L1}/fotos/fatura/a.jpg`])) === 1, "campo continua vendo as fotos");
    ok((await conta(U.admin, `select count(*)::int n from storage.objects where bucket_id = 'projetos-diagramas'`)) === 0 &&
       (await conta(U.rep, `select count(*)::int n from storage.objects where bucket_id = 'projetos-diagramas'`)) === 0,
      "ninguém lista o bucket projetos-diagramas pelo app");

    await como(U.admin, () => q(`update public.levantamentos set status = 'aprovado' where id = $1`, [L1]));
    l = await linha(L1);
    ok(l.status === "aprovado" && l.aprovado_por === U.admin && l.aprovado_em, "admin aprova");
    const hist = (await como(U.tec, () => q(`select para_status from public.levantamento_eventos where levantamento_id = $1 and tipo = 'status'`, [L1]))).rows
      .map((x: { para_status: string }) => x.para_status);
    ok(["rascunho", "enviado", "em_projeto", "aguardando_aprovacao", "aprovado"].every((s) => hist.includes(s)), "histórico registra tudo");

    // ── servidor do app / robô (service_role) = automação
    r = await criar(U.admin, "fv", mFv, P1);
    const L4: string = r.r!.rows[0].id;
    await compartilhar(U.admin, L4, U.tec);
    await como(U.tec, () => q(`update public.levantamentos set status = 'enviado' where id = $1`, [L4]));
    await como(U.admin, () => q(`update public.levantamentos set status = 'em_projeto' where id = $1`, [L4]));
    r = await comoServidor(() => tenta(() => q(`update public.levantamentos set status = 'aguardando_aprovacao' where id = $1 and status = 'em_projeto'`, [L4])));
    ok(!r.erro && (await linha(L4)).status === "aguardando_aprovacao", `robô devolve para aprovação${r.erro ? " — " + r.erro : ""}`);
    ok(/não permitida/.test((await comoServidor(() => tenta(() => q(`update public.levantamentos set status = 'aprovado' where id = $1`, [L4])))).erro || ""),
      "robô NÃO aprova");
    ok((await q(`select autor_papel from public.levantamento_eventos where levantamento_id = $1 and para_status = 'aguardando_aprovacao'`, [L4])).rows[0]?.autor_papel === "automacao",
      "histórico registra o robô como automação");
    await como(U.admin, () => q(`update public.levantamentos set status = 'em_projeto' where id = $1`, [L4]));
    r = await comoServidor(() => tenta(() => q(`update public.levantamentos set status = 'enviado' where id = $1 and status = 'em_projeto'`, [L4])));
    ok(!r.erro && (await linha(L4)).status === "enviado", "robô com erro devolve para a fila (enviado)");

    // ── pendência (devolvida pelo admin, corrigida pelo campo)
    await compartilhar(U.admin, L2, U.tec);
    await como(U.tec, () => q(`update public.levantamentos set status = 'enviado' where id = $1`, [L2]));
    r = await como(U.admin, () => tenta(() => q(`update public.levantamentos set status = 'com_pendencia' where id = $1`, [L2])));
    ok(/não permitida/.test(r.erro || ""), "devolver exige assumir antes");
    await como(U.admin, () => q(`update public.levantamentos set status = 'em_projeto' where id = $1`, [L2]));
    await como(U.admin, () => q(`update public.levantamentos set status = 'com_pendencia', pendencias = '[{"campo":"foto:poste","mensagem":"Refazer de perto","origem":"projetista"}]' where id = $1`, [L2]));
    await como(U.tec, () => q(`update public.levantamentos set respostas = '{"num_poste":"123"}', pendencias = '[]' where id = $1`, [L2]));
    l = await linha(L2);
    ok(l.pendencias.length === 1 && l.respostas.num_poste === "123", "campo corrige; pendências só saem ao reenviar");
    ok(!(await objeto(U.tec, `${L2}/fotos/poste/n.jpg`)).erro, "com pendência o campo refaz a foto");
    ok((await objeto(U.tec2, `${L2}/fotos/poste/m.jpg`)).erro, "técnico sem compartilhamento não envia foto");
    await como(U.tec, () => q(`update public.levantamentos set status = 'enviado', pendencias = '[]' where id = $1`, [L2]));
    l = await linha(L2);
    ok(l.status === "enviado" && l.pendencias.length === 0, "campo reenvia e limpa as pendências");
    ok(!(await como(U.tec, () => tenta(() => q(`update public.levantamentos set status = 'rascunho' where id = $1`, [L2])))).erro, "campo desfaz o envio");
    await como(U.tec, () => q(`update public.levantamentos set status = 'enviado' where id = $1`, [L2]));

    // ── exclusão e remoção de arquivos
    ok(/Só dá para excluir/.test((await como(U.tec, () => tenta(() => q(`select public.excluir_levantamento($1)`, [L2])))).erro || ""), "não exclui o já enviado");
    r = await criar(U.admin, "fv", mFv, null);
    const L3: string = r.r!.rows[0].id;
    await compartilhar(U.admin, L3, U.tec);
    await objeto(U.tec, `${L3}/fotos/qd/q.jpg`);
    const A3: string = (await como(U.tec, () => q(`insert into public.levantamento_arquivos (levantamento_id, tipo, slot, storage_path, mime) values ($1, 'foto', 'qd', $2, 'image/jpeg') returning id`, [L3, `${L3}/fotos/qd/q.jpg`]))).rows[0].id;
    ok((await como(U.rep, () => tenta(() => q(`select public.remover_arquivo_levantamento($1)`, [A3])))).erro, "representante não remove foto");
    ok(!(await como(U.tec, () => tenta(() => q(`select public.remover_arquivo_levantamento($1)`, [A3])))).erro, "campo remove foto do rascunho");
    ok((await como(U.tec, () => tenta(() => q(`select public.remover_arquivo_levantamento($1)`, [PR])))).erro, "campo não remove prancha");
    ok((await como(U.tec, () => tenta(() => q(`select public.excluir_levantamento($1)`, [L3])))).erro, "campo não exclui levantamento (é do admin)");
    ok((await como(U.rep, () => tenta(() => q(`select public.excluir_levantamento($1)`, [L3])))).erro, "representante não exclui");
    ok(!(await como(U.admin, () => tenta(() => q(`select public.excluir_levantamento($1)`, [L3])))).erro, "admin exclui o rascunho");
    ok(!(await ve(U.tec, L3)) && !(await ve(U.admin, L3)), "excluído some para todos");
    ok(/não permitida/.test((await como(U.auto, () => tenta(() => q(`update public.levantamentos set status = 'cancelado' where id = $1`, [L2])))).erro || ""),
      "automação não cancela");
    ok(!(await como(U.admin, () => tenta(() => q(`update public.levantamentos set status = 'cancelado' where id = $1`, [L2])))).erro, "admin cancela");

    // ── modelos
    ok((await conta(U.tec, `select count(*)::int n from public.checklist_modelos where ativo`)) === 3, "campo lê os modelos");
    ok((await como(U.tec, () => tenta(() => q(`insert into public.checklist_modelos (codigo, versao, nome, definicao) values ('fv', 2, 'x', '{}')`)))).erro,
      "campo não cria modelo");
    ok((await como(U.auto, () => q(`update public.checklist_modelos set nome = 'x'`))).affectedRows === 0, "automação não altera modelo");

    await db.close();
    expect(falhas).toEqual([]);
  }, 120_000);
});
