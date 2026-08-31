/**
 * Ficha do cliente em modo visualização — CPF/CNPJ e telefones formatados,
 * email/WhatsApp/telefone como superlinks pra acesso rápido.
 *
 * Usado no /crm/clientes/[id] (perfil) e pode ser reaproveitado em
 * /projetos/[id] pra unificar o visual dos dados cadastrais.
 * Kalebe 2026-08-31.
 */
import { formatarCpfCnpj, formatarTelefone, formatarCep } from '@/lib/formatters'

type ClienteFicha = {
  razao_social?: string | null
  nome_fantasia?: string | null
  cpf_cnpj?: string | null
  tipo?: 'pf' | 'pj' | null
  email?: string | null
  telefone?: string | null
  whatsapp?: string | null
  endereco?: any                    // jsonb { cep, logradouro, numero, bairro, cidade, uf, complemento }
}

type Props = {
  cliente: ClienteFicha
  // Opcional — dados da proposta pra enriquecer a ficha (UC geradora, beneficiárias)
  ucGeradora?: string | null
  beneficiarias?: Array<{ uc: string; titular?: string | null }> | null
  contaContrato?: string | null
  className?: string
}

export function FichaClienteCard({
  cliente, ucGeradora, beneficiarias, contaContrato, className,
}: Props) {
  const cpfFmt = cliente.cpf_cnpj ? formatarCpfCnpj(cliente.cpf_cnpj) : null
  const telFmt = cliente.telefone ? formatarTelefone(cliente.telefone) : null
  const whatsFmt = cliente.whatsapp ? formatarTelefone(cliente.whatsapp) : null

  // Superlinks (limpa não-dígitos, prefixa DDI 55 se faltar)
  function telHref(v: string | null | undefined): string | null {
    if (!v) return null
    const d = v.replace(/\D/g, '')
    return d ? `tel:+${d.startsWith('55') ? d : '55' + d}` : null
  }
  function waHref(v: string | null | undefined): string | null {
    if (!v) return null
    const d = v.replace(/\D/g, '')
    return d ? `https://wa.me/${d.startsWith('55') ? d : '55' + d}` : null
  }
  function mailHref(v: string | null | undefined): string | null {
    if (!v) return null
    return v.includes('@') ? `mailto:${v.trim()}` : null
  }

  const end = cliente.endereco || {}
  const linhaEnd = [end.logradouro, end.numero && `Nº ${end.numero}`, end.complemento]
    .filter(Boolean).join(', ')
  const linhaBairroCidade = [end.bairro, end.cidade && `${end.cidade}${end.uf ? `/${end.uf}` : ''}`]
    .filter(Boolean).join(' · ')

  return (
    <section className={`p-5 bg-white/[0.03] border border-white/10 rounded-xl ${className || ''}`}>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">{cliente.tipo === 'pj' ? '🏢' : '👤'}</span>
        <h3 className="text-xs uppercase tracking-wider font-bold text-sol">Ficha do cliente</h3>
      </div>

      <div className="space-y-2 text-sm">
        <Linha rotulo="Razão social" valor={cliente.razao_social || '—'} destaque />
        {cliente.nome_fantasia && <Linha rotulo="Nome fantasia" valor={cliente.nome_fantasia} />}
        <Linha rotulo={cliente.tipo === 'pj' ? 'CNPJ' : 'CPF'} valor={cpfFmt || '—'} mono />

        {/* Email como mailto: */}
        <Linha rotulo="Email" valor={
          mailHref(cliente.email) ? (
            <a href={mailHref(cliente.email)!} className="text-sol hover:underline">
              📧 {cliente.email}
            </a>
          ) : '—'
        } />

        {/* WhatsApp como wa.me */}
        <Linha rotulo="WhatsApp" valor={
          waHref(cliente.whatsapp) ? (
            <a href={waHref(cliente.whatsapp)!} target="_blank" rel="noreferrer" className="text-verde hover:underline">
              💬 {whatsFmt}
            </a>
          ) : (whatsFmt || '—')
        } />

        {/* Telefone como tel: */}
        {telFmt && telFmt !== whatsFmt && (
          <Linha rotulo="Telefone" valor={
            telHref(cliente.telefone) ? (
              <a href={telHref(cliente.telefone)!} className="text-white hover:underline">
                📞 {telFmt}
              </a>
            ) : telFmt
          } />
        )}

        {/* Endereço */}
        {(linhaEnd || linhaBairroCidade || end.cep) && (
          <div className="pt-3 mt-3 border-t border-white/5">
            <p className="text-[10px] uppercase tracking-wider text-white/40 mb-1">Endereço</p>
            {linhaEnd && <p className="text-sm text-white">{linhaEnd}</p>}
            {linhaBairroCidade && <p className="text-xs text-white/60">{linhaBairroCidade}</p>}
            {end.cep && <p className="text-xs text-white/50 mt-1">CEP {formatarCep(end.cep)}</p>}
          </div>
        )}

        {/* UC / beneficiárias / conta contrato — opcional */}
        {(ucGeradora || (beneficiarias && beneficiarias.length > 0) || contaContrato) && (
          <div className="pt-3 mt-3 border-t border-white/5">
            <p className="text-[10px] uppercase tracking-wider text-white/40 mb-2">Unidades consumidoras</p>
            {ucGeradora && <Linha rotulo="UC geradora" valor={ucGeradora} mono />}
            {contaContrato && <Linha rotulo="Conta contrato" valor={contaContrato} mono />}
            {beneficiarias && beneficiarias.length > 0 && (
              <div className="mt-2">
                <p className="text-[10px] text-white/40 mb-1">Beneficiárias ({beneficiarias.length})</p>
                <ul className="space-y-0.5">
                  {beneficiarias.map((b, i) => (
                    <li key={i} className="text-xs text-white/70">
                      · <span className="font-mono">{b.uc}</span>
                      {b.titular && <span className="text-white/50"> — {b.titular}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function Linha({
  rotulo, valor, destaque, mono,
}: {
  rotulo: string
  valor: React.ReactNode
  destaque?: boolean
  mono?: boolean
}) {
  return (
    <div className="flex flex-wrap justify-between gap-2 items-baseline">
      <span className="text-[11px] uppercase tracking-wider text-white/40 shrink-0">{rotulo}</span>
      <span className={`text-right ${destaque ? 'font-bold text-white' : 'text-white/80'} ${mono ? 'font-mono' : ''}`}>
        {valor}
      </span>
    </div>
  )
}
