import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getConviteAtual } from '@/lib/convite'
import { UploadDocumento } from '@/components/vaga/UploadDocumento'
import { ConcluirEnvioBtn } from '@/components/vaga/ConcluirEnvioBtn'

/** Documentos exigidos do candidato (representante autônomo PJ). */
const DOCS = [
  { tipo: 'rg_cpf', titulo: 'RG e CPF (ou CNH)', descricao: 'Documento de identidade do titular. PDF ou foto legível.', obrigatorio: true },
  { tipo: 'comprovante_endereco', titulo: 'Comprovante de endereço', descricao: 'Conta de luz, água ou telefone recente (últimos 90 dias).', obrigatorio: true },
  { tipo: 'cnpj', titulo: 'CNPJ (Cartão CNPJ / Contrato social ou MEI)', descricao: 'Necessário para a representação comercial. Se ainda não tem, podemos orientar.', obrigatorio: true },
  { tipo: 'dados_bancarios', titulo: 'Dados bancários / PIX', descricao: 'Conta para repasse das comissões (print ou comprovante).', obrigatorio: true },
] as const

export default async function DocumentosPage() {
  const convite = await getConviteAtual()
  if (!convite) redirect('/vaga/login')

  // Precisa ter assinado o contrato antes
  if (['enviado', 'proposta_aceita'].includes(convite.status)) redirect('/vaga/contrato')
  if (convite.status === 'recusado') redirect('/vaga/proposta')

  const concluido = ['docs_enviados', 'concluido'].includes(convite.status)

  // Busca documentos já enviados (RLS: só os do próprio convite)
  const supabase = createClient()
  const { data: enviados } = await supabase
    .from('documentos_candidato')
    .select('tipo, nome_arquivo, enviado_em')
    .eq('convite_id', convite.id)
    .order('enviado_em', { ascending: false })

  // Mapa tipo → último arquivo enviado
  const porTipo = new Map<string, string>()
  for (const d of enviados || []) {
    if (!porTipo.has(d.tipo)) porTipo.set(d.tipo, d.nome_arquivo)
  }

  const obrigatoriosOk = DOCS.filter((d) => d.obrigatorio).every((d) => porTipo.has(d.tipo))

  return (
    <main className="max-w-3xl mx-auto px-6 py-10 md:py-14">
      <header className="mb-8">
        <h1 className="text-3xl md:text-4xl font-black text-white mb-2">Seus documentos</h1>
        <p className="text-white/60">
          Última etapa. Envie os documentos abaixo — a Spin recebe e finaliza o seu cadastro.
        </p>
      </header>

      {concluido && (
        <div className="mb-8 p-6 bg-verde/[0.06] border border-verde/25 rounded-2xl">
          <p className="text-verde font-bold mb-1">✓ Documentos enviados</p>
          <p className="text-white/65 text-sm">
            Recebemos tudo. A equipe da Spin vai revisar e entrar em contato para os próximos passos.
            Você pode trocar um arquivo se precisar.
          </p>
        </div>
      )}

      <div className="grid gap-3 mb-8">
        {DOCS.map((d) => (
          <UploadDocumento
            key={d.tipo}
            tipo={d.tipo}
            titulo={d.titulo}
            descricao={d.descricao}
            enviado={porTipo.has(d.tipo)}
            nomeArquivo={porTipo.get(d.tipo)}
          />
        ))}
      </div>

      {!concluido && (
        <>
          <p className="text-xs text-white/40 mb-4">
            Seus documentos ficam em ambiente privado e são acessados só pela equipe da Spin.
          </p>
          <ConcluirEnvioBtn habilitado={obrigatoriosOk} />
        </>
      )}
    </main>
  )
}
