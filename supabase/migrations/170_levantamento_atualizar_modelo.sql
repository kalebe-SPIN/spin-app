-- =====================================================================
-- Migration 170 — Admin atualiza um levantamento aberto pra versão nova do checklist
-- Kalebe 2026-10-27: levantamentos abertos antes das versões novas (lista
-- de cargas v2, relógios da medição coletiva v3) ficavam presos na versão
-- antiga. Agora o admin pode trazer o levantamento pra versão ativa da
-- mesma finalidade, mantendo número, respostas, fotos, acessos e histórico.
-- Só em rascunho ou com pendência. O gatilho continua impedindo qualquer
-- outra troca de modelo (só passa dentro desta função).
-- Rodar depois da 169. Pode rodar de novo sem problema.
-- =====================================================================

BEGIN;

create or replace function public.levantamentos_antes_gravar()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  papel text := public.papel_atual();
  equipe boolean := papel in ('admin', 'projetista', 'automacao');
  ok boolean;
begin
  new.updated_at := now();
  new.updated_by := auth.uid();

  if new.projeto_id is not null
     and (tg_op = 'INSERT' or new.projeto_id is distinct from old.projeto_id)
     and not public.pode_vincular_projeto(new.projeto_id) then
    raise exception 'Você não tem acesso a esse projeto para ligar o levantamento.';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'rascunho' then
      raise exception 'Um levantamento novo começa como rascunho.';
    end if;
    return new;
  end if;

  -- a finalidade fica a do momento da criação; o modelo só muda pela função
  -- atualizar_modelo_levantamento (admin, versão ativa da mesma finalidade)
  new.finalidade    := old.finalidade;
  if not (papel = 'admin' and coalesce(current_setting('lev.trocar_modelo', true), '') = 'sim') then
    new.modelo_id     := old.modelo_id;
    new.modelo_versao := old.modelo_versao;
  end if;
  new.consultor_id  := old.consultor_id;
  new.created_at    := old.created_at;
  new.created_by    := old.created_by;

  -- exclusão (soft delete): admin sempre; o autor só em rascunho ou com pendência
  if new.deleted_at is distinct from old.deleted_at and papel <> 'admin' then
    if papel = 'automacao' or old.consultor_id is distinct from auth.uid()
       or old.status not in ('rascunho', 'com_pendencia') or new.deleted_at is null then
      raise exception 'Só dá para excluir um levantamento seu em rascunho ou com pendência.';
    end if;
  end if;

  -- consultor não mexe em campos da equipe de projeto
  if not equipe then
    if new.pendencias is distinct from old.pendencias and new.status <> 'enviado' then
      -- consultor só pode limpar pendências ao reenviar
      new.pendencias := old.pendencias;
    end if;
    new.projetista_id         := old.projetista_id;
    new.observacao_projetista := old.observacao_projetista;
    new.aprovado_em           := old.aprovado_em;
    new.aprovado_por          := old.aprovado_por;
    new.processado_em         := old.processado_em;
  end if;

  if new.status is distinct from old.status then
    ok := case
      when old.status = 'rascunho'      and new.status = 'enviado'      then true
      when old.status = 'com_pendencia' and new.status = 'enviado'      then true
      when old.status = 'enviado'       and new.status = 'rascunho'     then not equipe or papel = 'admin'
      when old.status = 'enviado'       and new.status = 'em_projeto'   then equipe
      when old.status = 'em_projeto'    and new.status in ('aguardando_aprovacao', 'com_pendencia', 'enviado') then equipe
      when old.status = 'aguardando_aprovacao' and new.status in ('aprovado', 'com_pendencia', 'em_projeto')
                                                                         then papel in ('admin', 'projetista')
      when new.status = 'cancelado'                                      then papel = 'admin'
      else false
    end;
    if not ok then
      raise exception 'Mudança de status não permitida: % → % (papel %).', old.status, new.status, papel;
    end if;

    if new.status = 'enviado'              then new.enviado_em := now(); end if;
    if new.status = 'em_projeto'           then new.projetista_id := coalesce(new.projetista_id, auth.uid()); end if;
    if new.status in ('aguardando_aprovacao', 'com_pendencia') and equipe then new.processado_em := now(); end if;
    if new.status = 'aprovado'             then new.aprovado_em := now(); new.aprovado_por := auth.uid(); end if;
  end if;
  return new;
end $$;

-- Leva o levantamento pra versão ativa do checklist da mesma finalidade.
-- Devolve a versão em que o levantamento ficou.
create or replace function public.atualizar_modelo_levantamento(p_id uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  l public.levantamentos;
  m public.checklist_modelos;
begin
  if public.papel_atual() <> 'admin' then
    raise exception 'Só o admin atualiza a versão do checklist.';
  end if;
  select * into l from public.levantamentos where id = p_id and deleted_at is null;
  if l.id is null then raise exception 'Levantamento não encontrado.'; end if;
  if l.status not in ('rascunho', 'com_pendencia') then
    raise exception 'Só dá para atualizar a versão do checklist em rascunho ou com pendência.';
  end if;
  select * into m from public.checklist_modelos where codigo = l.finalidade and ativo;
  if m.id is null or m.versao <= l.modelo_versao then return l.modelo_versao; end if;

  perform set_config('lev.trocar_modelo', 'sim', true);
  update public.levantamentos set modelo_id = m.id, modelo_versao = m.versao where id = p_id;
  perform set_config('lev.trocar_modelo', '', true);

  insert into public.levantamento_eventos (levantamento_id, tipo, mensagem)
  values (p_id, 'comentario', format('Checklist atualizado da versão %s para a %s (respostas mantidas)', l.modelo_versao, m.versao));
  return m.versao;
end $$;

revoke all on function public.atualizar_modelo_levantamento(uuid) from public, anon;
grant execute on function public.atualizar_modelo_levantamento(uuid) to authenticated;

COMMIT;
