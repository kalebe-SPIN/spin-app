/**
 * Carrega os arquivos da skill projetista-spin em memória.
 *
 * Runtime Node.js — lê arquivos do repo (skills/projetista-spin/) durante SSR.
 * Serve pra injetar como contexto no Claude a cada geração.
 */

import fs from 'node:fs'
import path from 'node:path'

const SKILL_DIR = path.join(process.cwd(), 'skills', 'projetista-spin')

type SkillContent = {
  instrucaoMestre: string             // SKILL.md
  regras: string                      // references/regras-spin.md
  estilo: string                      // references/estilo-casa.md
  normas: string                      // references/normas-celesc.md
  calculos: string                    // references/calculos.md
  topologias: string                  // references/topologias.md — folhas 01/02/03 + checklist
  // Legacy (podem estar em _arquivo/) — mantidos pra retrocompat, mas o
  // pipeline novo (Projeto Ideal) não depende de nenhum deles.
  simbolos: string                    // references/simbolos.md — retornará '' se movido
  templates: Record<string, string>   // templates/*.svg — retornará {} se movido
  exemplos: Record<string, string>    // exemplos/*.md — retornará {} se movido
  quadrantes: Record<string, string>  // quadrantes/*.svg — retornará {} se movido
}

let cache: SkillContent | null = null

/**
 * Lê toda a skill do disco. Cacheia em memória (invalidado só quando o processo reinicia).
 * Se algum arquivo faltar, retorna string vazia — nunca lança erro.
 */
export function carregarSkillProjetista(): SkillContent {
  if (cache) return cache

  const lerArq = (rel: string): string => {
    try {
      return fs.readFileSync(path.join(SKILL_DIR, rel), 'utf-8')
    } catch {
      return ''
    }
  }

  const lerDir = (subdir: string, ext: string): Record<string, string> => {
    try {
      const dir = path.join(SKILL_DIR, subdir)
      const files = fs.readdirSync(dir).filter(f => f.endsWith(ext))
      const out: Record<string, string> = {}
      for (const f of files) {
        const key = f.replace(new RegExp(`${ext.replace('.', '\\.')}$`), '')
        out[key] = fs.readFileSync(path.join(dir, f), 'utf-8')
      }
      return out
    } catch {
      return {}
    }
  }

  cache = {
    instrucaoMestre: lerArq('SKILL.md'),
    regras: lerArq('references/regras-spin.md'),
    estilo: lerArq('references/estilo-casa.md'),
    normas: lerArq('references/normas-celesc.md'),
    calculos: lerArq('references/calculos.md'),
    topologias: lerArq('references/topologias.md'),
    simbolos: lerArq('references/simbolos.md'),          // legacy — vazio se movido
    templates: lerDir('templates', '.svg'),              // legacy — {} se movido
    exemplos: lerDir('exemplos', '.md'),                 // legacy — {} se movido
    quadrantes: lerDir('quadrantes', '.svg'),            // legacy — {} se movido
  }

  return cache
}

/**
 * Retorna o template mais adequado pro tipo de projeto.
 * Se o específico não existir, cai em ongrid-mono como fallback.
 */
export function escolherTemplate(dados: {
  tipoDesenho: 'unifilar_ongrid' | 'unifilar_hibrido' | 'padrao_entrada' | 'layout_instalacao'
  fase?: 'mono' | 'bi' | 'tri'
  grupo?: 'A' | 'B'
}): { chave: string; svg: string } {
  const skill = carregarSkillProjetista()

  const preferencias: string[] = []
  if (dados.tipoDesenho === 'unifilar_hibrido') {
    preferencias.push('unifilar-hibrido-bess')
  } else if (dados.tipoDesenho === 'padrao_entrada') {
    if (dados.grupo === 'A') preferencias.push('padrao-entrada-grupo-a')
    else preferencias.push('padrao-entrada-grupo-b')
  } else if (dados.tipoDesenho === 'layout_instalacao') {
    preferencias.push('layout-instalacao')
  } else {
    // on-grid
    if (dados.fase === 'tri') preferencias.push('unifilar-ongrid-tri')
    // Prioridade: template CELESC micro-geração oficial (Kalebe validou 24/07/2026)
    // Fallback antigo unifilar-ongrid-mono só se micro-geração não existir
    preferencias.push('unifilar-microgeracao-mono')
    preferencias.push('unifilar-ongrid-mono')
  }

  for (const key of preferencias) {
    if (skill.templates[key]) {
      return { chave: key, svg: skill.templates[key] }
    }
  }

  // Se nenhum template existe, retorna vazio — agente vai gerar do zero
  return { chave: 'nenhum', svg: '' }
}
