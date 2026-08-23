# Topologias e estrutura dos desenhos

Cada tipo tem uma estrutura-base. Aplique sempre as **regras fixas da SPIN** (`regras-spin.md`)
e o **padrão gráfico** (`estilo-casa.md`).

## 1. Unifilar on-grid (usina / gerador simples)

Cadeia vertical (rede no topo):

```
REDE CELESC (BT 380/220V) → PONTO DE CONEXÃO
  → MEDIDOR bidirecional
  → QGBT (ponto de conexão CA)
  → [QUADRO DE PROTEÇÃO CA: disjuntor do sistema FV (3P) + DPS CA Classe II]
  → INVERSOR (kW, trifásico, multi-MPPT)
  → (CC DIRETO, sem string box)
  → GERADOR FV (nº módulos × Wp, em N strings)
```

- Quadro tracejado "PROTEÇÃO ANSI (interconexão)" (27/59/81U/81O/25/78) ligado ao QGBT.
- Aterramento BEP à esquerda do QGBT.
- Bloco de dados do gerador (módulos, strings, Imp/string) e do inversor.
- Tabela "REQUISITOS DE PROTEÇÃO (GD)" quando fizer sentido.
- Placa de GD, legenda, notas, carimbo.

## 2. Unifilar híbrido (BESS + EPS)

Igual ao on-grid, e mais:

- **MM / multimedidor** (energy analyzer) com **RS485** ligado ao inversor.
- **Banco de baterias** conectado ao inversor via **chave/seccionadora "ISOLADO"** (CC).
- Saída de **CARGAS CRÍTICAS (EPS)** (backup na bateria), separada das **cargas comuns do QD**.
- Contator de transferência quando houver EPS.
- Bloco de dados das baterias (qtde, modelo, kWh) e "CENTRAL GERADORA (G)".
- Continua **sem quadro de proteção CC**.

## 3. Prancha de padrão de entrada / medição (CELESC N-321.0001)

Duas partes lado a lado:

- **Vista frontal do quadro de medição**: gabinete com janela do medidor + compartimento do
  disjuntor geral (após o medidor), abrigo/beiral, eletroduto de entrada, haste de aterramento;
  cota do eixo do medidor **1,50–1,60 m** do piso.
- **Detalhe de ligação**: ramal → medidor → disjuntor geral (após o medidor) → DPS → barramento
  → saída para o QDC; aterramento BEP; tabela de cores por fase.
- Placas (RISCO DE CHOQUE, DISJUNTOR APÓS O MEDIDOR 70×35 mm, GD 180×250 mm), plaqueta de
  identificação da UC, legenda, notas (N-321.0001, E-321.0031, I-432.0004), carimbo.
- Cotas em **cm**. Marcar valores como representativos (confirmar caixa homologada).

## 4. Layout de montagem (elevação + planta)

Prancha com duas vistas:

- **Elevação frontal da parede**: equipamentos fixados (QM/QGBT, inversor, banco de baterias,
  EMBOX) com **altura de montagem** em relação ao piso, **afastamentos ≥ 30 cm** (ventilação)
  em tracejado, eletrodutos (CC, CA, comunicação) e aterramento.
- **Planta baixa**: projeção da profundidade dos equipamentos, área livre para operação/
  manutenção (≥ 80–100 cm), trajeto do eletroduto no piso, caixa de passagem.
- Cotas em **cm**. Dimensões e afastamentos conforme **datasheet** do equipamento (marcar).
- Legenda, notas, placa, carimbo.

## Dicas de layout na tela

- Tela ~1580×1120 (A3 paisagem); coluna direita a partir de x≈1095.
- Deixe o eixo principal do diagrama à esquerda (x≈150–300).
- Rótulos de equipamento à direita do símbolo; ramais de DPS/aterramento à esquerda.
- Cuide para rótulos não caírem fora da moldura nem sobre outros blocos — **renderize e confira**.
