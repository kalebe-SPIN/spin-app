# Normas CELESC e Referências Técnicas

Base normativa para todos os diagramas gerados. Cite estas normas nas notas técnicas do desenho.

## Normas CELESC (SC)

### N-321.0001 — Fornecimento em Baixa Tensão (BT)
**Aplicável:** carga instalada + geração ≤ 75 kW
**Cobre:**
- Padrões de entrada BT (32A a 250A)
- Poste, bengala, caixa de medição
- Aterramento
- Cor de fase (R preto, S branco, T vermelho, N azul, PE verde)
- Placas de sinalização

**Última edição relevante:** dezembro/2025 (checar sempre a mais atual)

### N-321.0002 — Fornecimento em Média Tensão (MT)
**Aplicável:** carga > 75 kW ou tensão primária
**Cobre:**
- Padrões MT 13,8/23,1/34,5 kV
- Trafo abaixador (padrões preferenciais)
- TC/TP e medidor 4-quadrantes
- Chave fusível + chave seccionadora + disjuntor MT
- Malha de aterramento

### N-321.0003 — Uso Coletivo (Multifamiliar)
**Aplicável:** condomínios, prédios com múltiplas UC
**Cobre:**
- Medidor principal + medidores individualizados
- Padrão coletivo
- QGBT geral + QDC (quadros derivados)

### I-432.0004 — Conexão de Micro/Mini Geração Distribuída
**A NORMA CENTRAL** pra qualquer projeto FV com injeção na rede.
**Cobre:**
- Solicitação de acesso à CELESC
- Documentação obrigatória
- Requisitos técnicos:
  - Inversor certificado NBR IEC 62116
  - Anti-ilhamento (função ANSI 78)
  - Proteções de tensão/frequência (27/59/81)
  - Sincronismo (25 pra Grupo A)
- Prazos de análise (30 dias)
- Formulário de solicitação
- Protocolo e vistoria

**Sempre cite:** "Conexão de microgeração conforme I-432.0004 vigente."

### E-321.0031 — Dispositivo de Proteção contra Surtos (DPS)
**Aplicável:** todo padrão + QPCA
**Cobre:**
- Classe I (exposto a raios diretos)
- Classe II (padrão residencial/comercial)
- Corrente máxima descarga (kA)
- Tensão residual
- Aterramento do DPS
- Malha equipotencial

### E-321.0003/0004 — Barramento Blindado
**Aplicável:** medição Grupo A
**Cobre:** especificações do barramento na medição MT.

## Normas ABNT / IEC

### NBR IEC 62116 — Ensaios de Inversores Anti-ilhamento
**A norma que certifica o inversor pra GD.**
- Ensaios de anti-ilhamento (função 78)
- Tempo de desconexão ≤ 2s (típico ≤ 200ms)
- Tolerância de tensão e frequência

**Cite:** "Inversor certificado conforme NBR IEC 62116."

### NBR 5410 — Instalações Elétricas de Baixa Tensão
Base normativa de tudo em BT.
- Dimensionamento de condutores
- Proteção contra choques
- Aterramento
- Divisão de circuitos

### NBR 5419 — Proteção contra Descargas Atmosféricas (SPDA)
Se o local tem SPDA, aterramento FV deve ser interligado.

### NBR IEC 61643-31 — DPS pra sistemas FV
Padrões específicos de DPS pro lado CC e CA.

## Regulamentos ANEEL

### REN 1000/2021
Substituiu a REN 482/2012. Regras atuais de GD:
- Micro (≤ 75 kW) — sem cobrança de fio B em transição até 2029
- Mini (> 75 kW até 5 MW) — regras específicas
- Modalidades: local, autoconsumo remoto, geração compartilhada, EMUC

### Lei 14.300/2022
Marco legal da GD. Estabelece regras de transição pra cobrança de fio B.

## Referências pra normas

### Onde consultar
- **CELESC:** https://www.celesc.com.br/index.php/documentacao-tecnica (normas técnicas)
- **ANEEL:** https://www.aneel.gov.br (resoluções)
- **ABNT:** normas via ABNT Catálogo (pago)

### Versionamento
Sempre verificar a **versão vigente** no momento do projeto. Normas mudam:
- N-321.0001 teve edição em **dez/2025**
- I-432.0004 tem revisões anuais
- REN ANEEL pode mudar (política)

## Placas de sinalização obrigatórias

Conforme N-321.0001 + I-432.0004:

### Placa 1: Aviso no padrão de entrada
- **Texto:** "CUIDADO — RISCO DE CHOQUE ELÉTRICO — GERAÇÃO PRÓPRIA"
- **Dimensões:** 180 × 250 mm
- **Espessura:** 2 mm
- **Cor de fundo:** amarela epóxi
- **Letras:** pretas, tinta eletrostática em pó

### Placa 2: Aviso na tampa do QDG
- **Texto:** "CUIDADO — GERAÇÃO DISTRIBUÍDA NO CIRCUITO"
- **Dimensões:** 70 × 35 mm
- **Material:** alumínio ou polimérica

## Setpoints ANSI pra interconexão GD (I-432.0004)

| Função | Descrição | Ajuste | Tempo |
|--------|-----------|--------|-------|
| 27 | Subtensão | 0,80 p.u. | ≤ 0,2s |
| 59 | Sobretensão | 1,10 p.u. | ≤ 0,2s |
| 81U | Subfrequência | 59,5 Hz | ≤ 0,2s |
| 81O | Sobrefrequência | 60,5 Hz | ≤ 0,2s |
| 25 | Sincronismo | 10° / 10% / 0,3 Hz | — |
| 78 | Anti-ilhamento | — | ≤ 0,2s |

**Grupo A adicional:**
- 67 — Sobrecorrente direcional
- 32 — Potência direcional
- 50/51 — Sobrecorrente instantânea/temporizada

## NR-10 — Segurança Elétrica

- **Seccionamento visível:** obrigatório no ponto de conexão da GD
- **EPI:** botas isolantes, luvas classe adequada, capacete
- **Procedimentos:** SEP autorizado, análise de risco

Cite sempre: "Seccionamento visível conforme NR-10."

## Placas + notas técnicas obrigatórias no desenho

Baseando no padrão SPIN, todo unifilar deve ter:

### Notas mínimas (numeradas)
1. I-432.0004 + N-321.0001 (referência)
2. NBR IEC 62116 (certificação inversor)
3. Aterramento interligado
4. Identificar QGBT: "Cuidado — GD no Circuito"
5. Seccionamento visível NR-10
6. QPCA no ponto de conexão
7. CC direta ao inversor (padrão Spin)
8. Seções dimensionadas em campo
9. FCI e limites (opcional)
