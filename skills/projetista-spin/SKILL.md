---
name: projetista-spin
description: >-
  Gera diagramas e pranchas elétricas fotovoltaicas no padrão gráfico "Projeto Ideal"
  da SPIN Solar (A4 paisagem, carimbo SPIN, legenda de símbolos, placa de advertência,
  padrão de entrada representativo, fonte Bahnschrift/Barlow) e normas CELESC — cada
  projeto gera por padrão 3 folhas: 01 DIAGRAMA UNIFILAR, 02 DIAGRAMA TRIFILAR e
  03 PLANTA DE LOCALIZAÇÃO, nas variantes inversor string ou microinversores, além de
  híbrido BESS/EPS e pranchas de padrão de entrada sob demanda — entregando sempre
  PDF, DXF (AutoCAD, em camadas) e SVG. Use SEMPRE que o usuário pedir para montar,
  desenhar, refazer, gerar ou "fazer a prancha" de um unifilar, trifilar, diagrama
  elétrico FV, projeto de usina/geração distribuída ou padrão de entrada CELESC —
  mesmo sem dizer "skill" ou "diagrama". Dispara em "cria o unifilar dessa usina de X
  kWp", "monta as pranchas do projeto", "desenha o diagrama do sistema com
  microinversores". A ESTÉTICA É FIXA (calibrada em exemplos reais); só o conteúdo
  técnico muda. Regras SPIN: CC direto no inversor, sem quadro de proteção CC; Quadro
  de Proteção CA com disjuntor do sistema FV + DPS. Normas CELESC N-321.0001,
  I-432.0004, E-321.0031.
---

# Projetista SPIN — padrão "Projeto Ideal"

Skill para produzir **pranchas elétricas fotovoltaicas** com estética **idêntica** às
pranchas de referência da SPIN Solar (padrão "Projeto Ideal", calibrado em projetos
reais de 2025). O princípio central:

> **A estética é fixa. O conteúdo técnico se molda ao projeto.**
> Moldura, carimbo, legenda, símbolos, cores, fontes, espessuras e disposição NUNCA
> mudam. Potências, equipamentos, strings, bitolas, correntes e textos de spec mudam.

## Fluxo de trabalho

1. **Coletar os dados** do projeto (checklist abaixo). Se faltar algo essencial,
   perguntar objetivamente; com spec completa, prosseguir declarando premissas.
2. **Calcular** potência, corrente CA, disjuntores, arranjo de strings e oversizing —
   `references/calculos.md`.
3. **Escolher a variante**: inversor string ou microinversores; folhas a gerar —
   `references/topologias.md`. Padrão: folhas 01 (unifilar), 02 (trifilar),
   03 (localização).
4. **Aplicar as REGRAS FIXAS da SPIN** — `references/regras-spin.md` (ex.: NUNCA
   desenhar quadro de proteção CC).
5. **Desenhar por código** com `scripts/draw_svg.py`, seguindo o mapa estético
   OBRIGATÓRIO `references/estilo-prancha.md` e partindo de
   `scripts/exemplo_folha01.py` (exemplo calibrado e validado — copie e adapte).
6. **Validar visualmente** (OBRIGATÓRIO): renderizar PNG e passar no "Checklist de
   qualidade visual" de `references/topologias.md` — nada sobreposto, ligações
   fluidas e contínuas, proporções equilibradas, informação junto do que descreve,
   tudo dentro da moldura. Corrigir e re-renderizar até passar.
7. **Exportar**: PDF (`cairosvg.svg2pdf`) + DXF (`scripts/draw_dxf.py`, mesmas
   coordenadas, camadas, validar reabrindo com ezdxf) + SVG.
8. **Entregar** os três formatos de cada folha + observações técnicas obrigatórias
   (final deste arquivo).

## Dados a coletar (checklist)

- **Módulos**: marca, modelo, potência (Wp), quantidade, Vmp/Imp (e Voc se tiver).
- **Inversor(es) ou microinversores**: marca, modelo, potência CA, nº de MPPTs,
  tensões de entrada/saída, correntes; quantidade (micros).
- **Arranjo**: módulos por string, strings por MPPT.
- **Ligação**: mono/bi/trifásico e tensão (CELESC: 380/220V tri, 220V mono/bi).
- **Disjuntores** (geral e do FV) e **DPS** (Classe II padrão, In 10kA, Imax 20kA).
- **Bitolas**: ramal, medição→QD, QD→inversor, CC (padrão 4mm²).
- **Carimbo**: cliente (nome, CNPJ/CPF), endereço da obra + CEP, UC/conta contrato,
  ID do pedido, revisor, RT (nome + CREA/CFT), data, integrador.
  **PROJETISTA e RESPONSÁVEL TÉCNICO por padrão: "Kalebe Grün" (CPF 943.121.760-00)**
  — usar sempre, salvo o usuário indicar outro (já é o default de `draw_svg.carimbo`).
- **Localização**: print/imagem de satélite com pin (para a folha 03).
- **Baterias/EPS** (se híbrido): modelo, quantidade, kWh, cargas críticas.

## Regras fixas da SPIN (CRÍTICO)

- **NUNCA** desenhar "Quadro de Proteção CC"/string box: o CC vai **direto** dos
  módulos aos MPPTs do inversor (proteção interna). Remover se vier de desenho antigo.
- **SEMPRE** Quadro de Proteção CA próprio: disjuntor do sistema FV + DPS CA, ligado
  ao quadro de distribuição/QGBT.
- Carimbo com **logo SPIN** (usar `assets/logo-spin.*` se existir; senão o logo
  vetorial simplificado de `draw_svg.logo_spin`).
- Notas com texto FIXO (`draw_svg.notas`), incluindo a nota do CC direto (padrão SPIN).

## Qualidade visual (exigência do usuário — inegociável)

Apresentação humanizada e equilibrada: dimensões proporcionais entre elementos,
ligações fluidas e contínuas (leque suave para os MPPTs, nós com ponto), informações
bem localizadas (spec à direita do símbolo, cabo junto ao trecho) e **nenhuma
sobreposição**. A etapa 6 do fluxo nunca pode ser pulada.

## Normas CELESC (referência)

`references/normas-celesc.md` — N-321.0001 (padrão de entrada BT), I-432.0004
(conexão micro/minigeração), E-321.0031 (DPS) e demais. Conferir edição vigente.

## Acervo de desenhos oficiais CELESC

O Kalebe mantém um acervo CELESC: 4 pacotes zip de desenhos oficiais (DWG da
N-321.0002, kits poste de padrão de entrada, caixas de medição de alumínio) e 9
guias/normas em PDF (I-432.0004, I-313.0011 símbolos oficiais, Zero Grid/SCPI,
anti-ilhamento, Agência Web, padrão de entrada, fatura GD, declaração de carga) — o
catálogo completo, com quando usar cada um, está em `references/acervo-celesc.md`.
Ao precisar de um desenho oficial numa prancha, **pedir o arquivo ao Kalebe pelo
nome do catálogo** (não estão embutidos na skill por tamanho).

## Observações técnicas obrigatórias na entrega

Todo desenho é **base representativa**; alertar o usuário para confirmar no projeto real:

- Seções de cabo, disjuntores e DPS dimensionados pela corrente real e método de
  instalação.
- Arranjo de strings validado por Voc/temperatura e nº de MPPTs.
- Oversizing CC/CA (FDI) — sinalizar clipping quando > ~1,35.
- Enquadramento micro/mini (BT/MT) conforme potência e I-432.0004 vigente.
- Imagem de localização: nunca inventada; usar a fornecida pelo usuário.

## Arquivos da skill

- `references/estilo-prancha.md` — **mapa estético obrigatório** (ler SEMPRE antes de desenhar).
- `references/topologias.md` — estrutura das folhas 01/02/03 + checklist de qualidade visual.
- `references/regras-spin.md` — regras fixas da SPIN.
- `references/calculos.md` — fórmulas de dimensionamento.
- `references/normas-celesc.md` — mapa das normas CELESC.
- `references/acervo-celesc.md` — catálogo dos desenhos oficiais CELESC do Kalebe
  (pedir arquivo quando precisar).
- `scripts/draw_svg.py` — motor de desenho (primitivas + símbolos + blocos fixos + carimbo).
- `scripts/draw_dxf.py` — espelho DXF/AutoCAD (camadas, Y invertido).
- `scripts/exemplo_folha01.py` — folha 01 (unifilar FV) completa, calibrada e validada.
- `scripts/exemplo_padrao_entrada.py` — prancha PADRÃO DE ENTRADA (poste kit CELESC,
  elevação + detalhe da medição) calibrada e validada — adaptar amperagem pela tabela
  de `references/topologias.md`.
- `scripts/exemplo_padrao_entrada_dxf.py` — espelho DXF da prancha de padrão de entrada.
- `scripts/README.md` — API e fluxo de exportação.
