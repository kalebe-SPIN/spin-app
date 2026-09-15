'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { verificarStatusSetupAction, type StatusCheckItem } from '@/app/admin/whatsapp/setup/actions'

export function StatusSetupClient() {
  const [itens, setItens] = useState<StatusCheckItem[]>([])
  const [resumo, setResumo] = useState<{ ok: number; total: number } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [rodando, startRodar] = useTransition()
  const [ultima, setUltima] = useState<Date | null>(null)

  function rodar() {
    setErro(null)
    startRodar(async () => {
      const r = await verificarStatusSetupAction()
      if ('erro' in r) { setErro(r.erro); return }
      setItens(r.itens); setResumo(r.resumo); setUltima(new Date())
    })
  }

  useEffect(() => { rodar() }, [])

  const okCount = resumo?.ok ?? 0
  const total = resumo?.total ?? 1
  const pct = Math.round((okCount / total) * 100)

  const barCor = pct === 100 ? 'bg-verde'
    : pct >= 70 ? 'bg-sol'
    : 'bg-coral'

  return (
    <div className="space-y-6">
      {/* Progresso geral */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-white">Progresso do cutover</h2>
          <button
            onClick={rodar}
            disabled={rodando}
            className="text-xs px-3 py-1.5 rounded bg-sol/20 border border-sol/40 text-sol font-bold disabled:opacity-40"
          >
            {rodando ? 'Verificando...' : '↻ Reverificar'}
          </button>
        </div>
        <div className="flex items-baseline gap-3 mb-2">
          <p className="text-4xl font-black text-white">{okCount}<span className="text-white/40 text-2xl">/{total}</span></p>
          <p className="text-lg font-black text-white/80">{pct}%</p>
        </div>
        <div className="h-2 rounded-full bg-white/5 overflow-hidden">
          <div className={`h-full ${barCor} transition-all duration-500`} style={{ width: `${pct}%` }} />
        </div>
        {ultima && (
          <p className="text-[10px] text-white/40 mt-2">
            Última verificação: {ultima.toLocaleTimeString('pt-BR')}
          </p>
        )}
        {erro && <p className="text-sm text-coral mt-3">{erro}</p>}
      </div>

      {/* Roteiro rápido — atalho pros passos */}
      {pct < 100 && (
        <div className="bg-sol/[0.06] border border-sol/30 rounded-xl p-5">
          <h3 className="text-xs uppercase tracking-wider font-bold text-sol mb-2">🚀 Próximos passos externos (fora do código)</h3>
          <ol className="space-y-2 text-sm text-white/80">
            <li><strong>1.</strong> Business Manager Meta → confirmar +55 48 3263-0182 numa WABA sua</li>
            <li><strong>2.</strong> App Meta → WhatsApp → API Setup → copiar <code className="text-sol font-mono text-xs">Phone Number ID</code></li>
            <li><strong>3.</strong> System Users → gerar token permanente com scopes <code className="text-sol font-mono text-xs">whatsapp_business_messaging</code> + <code className="text-sol font-mono text-xs">whatsapp_business_management</code></li>
            <li><strong>4.</strong> Vercel Settings → Environment Variables → adicionar as 4 envs → Redeploy</li>
            <li><strong>5.</strong> App Meta → WhatsApp → Configuration → Callback URL = <code className="text-sol font-mono text-xs">https://app.spinsolar.com.br/api/whatsapp/webhook</code>, Verify Token = mesmo do Vercel</li>
            <li><strong>6.</strong> Subscribe aos campos <code className="text-sol font-mono text-xs">messages</code> + <code className="text-sol font-mono text-xs">message_status</code></li>
            <li><strong>7.</strong> Mandar msg do celular pro +55 48 3263-0182 → deve aparecer no /inbox</li>
          </ol>
        </div>
      )}

      {/* Lista de checks */}
      <div className="space-y-2">
        {itens.map((it) => <LinhaCheck key={it.chave} it={it} />)}
      </div>
    </div>
  )
}

function LinhaCheck({ it }: { it: StatusCheckItem }) {
  const cor = it.status === 'ok' ? { borda: 'border-verde/30', bg: 'bg-verde/[0.04]', badge: 'bg-verde/20 text-verde', icon: '✅' }
    : it.status === 'aviso' ? { borda: 'border-sol/30', bg: 'bg-sol/[0.04]', badge: 'bg-sol/20 text-sol', icon: '⚠️' }
    : it.status === 'erro' ? { borda: 'border-coral/30', bg: 'bg-coral/[0.04]', badge: 'bg-coral/20 text-coral', icon: '❌' }
    : { borda: 'border-white/10', bg: 'bg-white/[0.02]', badge: 'bg-white/10 text-white/50', icon: '⏳' }

  return (
    <div className={`p-4 rounded-xl border ${cor.borda} ${cor.bg}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <span className="text-xl leading-none shrink-0">{cor.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">{it.rotulo}</p>
            <p className="text-xs text-white/70 mt-0.5 break-words">{it.detalhe}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${cor.badge}`}>
            {it.status === 'ok' ? 'OK' : it.status === 'aviso' ? 'AVISO' : it.status === 'erro' ? 'FALTA' : '...'}
          </span>
          {it.acao?.href && (
            <Link
              href={it.acao.href}
              target={it.acao.href.startsWith('http') ? '_blank' : undefined}
              className="text-[10px] px-2 py-1 rounded bg-white/[0.05] border border-white/10 text-white/70 hover:bg-white/10 uppercase tracking-wider font-bold"
            >
              {it.acao.texto} →
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
