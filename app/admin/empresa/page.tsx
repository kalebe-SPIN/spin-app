import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { EmpresaForm } from '@/components/EmpresaForm'
import { getModoVisualizacao } from '@/lib/modo-visualizacao'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function AdminEmpresaPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const { modo: modoAtivo } = await getModoVisualizacao()

  if (perfil?.role !== 'admin' || modoAtivo !== 'admin') {
    return (
      <main className="min-h-screen p-8 md:p-12">
        <div className="max-w-3xl mx-auto bg-coral/10 border border-coral/30 rounded-xl p-6">
          <h1 className="text-xl font-bold text-coral">Acesso restrito</h1>
          <p className="text-white/60 text-sm mt-2">
            {modoAtivo === 'consultor' && perfil?.role === 'admin'
              ? 'Você está no modo Consultor. Alterne pra modo Admin no botão do header.'
              : 'Só administradores podem configurar dados da empresa.'}
          </p>
        </div>
      </main>
    )
  }

  const { data: config } = await supabase
    .from('configuracoes_empresa')
    .select('*')
    .eq('singleton', true)
    .single()

  return (
    <main className="min-h-screen p-8 md:p-12">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <Link href="/admin" className="text-xs text-white/40 hover:text-white/60 mb-2 inline-block">
            ← Voltar ao admin
          </Link>
          <h1 className="text-3xl md:text-4xl font-black text-white">
            Configurações da empresa
          </h1>
          <p className="text-white/60 mt-1 text-sm">
            Esses dados aparecem no <strong className="text-white">selo</strong> de todo diagrama gerado.
            Cadastre uma única vez.
          </p>
        </header>

        <div className="bg-weg-azul/10 border border-weg-azul/30 rounded-xl p-4 mb-6 text-sm text-white/80">
          <p className="mb-2">
            <strong>Uso em diagramas:</strong> ao gerar um unifilar para CELESC, o sistema estampa
            automaticamente:
          </p>
          <ul className="list-disc list-inside space-y-1 text-white/70 ml-2">
            <li>Logo da empresa (canto superior esquerdo do selo)</li>
            <li>Nome + CNPJ + endereço da empresa</li>
            <li>Nome + título + CREA + assinatura do responsável técnico</li>
          </ul>
        </div>

        <div className="bg-white/[0.03] border border-white/10 rounded-xl p-6 md:p-8">
          <EmpresaForm configSalva={config} />
        </div>
      </div>
    </main>
  )
}
