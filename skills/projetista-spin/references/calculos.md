# Fórmulas de Cálculo — Projetista SPIN

Cálculos técnicos usados em cada diagrama. Sempre preencher na **Memória de Cálculo** do desenho.

## 1. Potência CC / CA / FCI

### Potência CC (kWp)
Soma da potência de todos os módulos.
```
Pcc (kWp) = qtd_módulos × potencia_módulo (Wp) / 1000
```
Exemplo: 12 × 620 Wp = 7,44 kWp

### Potência CA (kW)
Soma da potência nominal dos inversores.
```
Pca (kW) = qtd_inversores × potencia_inversor (kW)
```
Exemplo: 1 × 5 kW = 5 kW

### FCI — Fator de Carregamento do Inversor
```
FCI (%) = (Pcc / Pca) × 100
```
Exemplo: 7,44 / 5 = 148,8% → **ACIMA DO LIMITE**

**Interpretação:**
- **< 100%** — subdimensionado (inversor "sobra")
- **100-115%** — conservador
- **115-130%** — ideal (aproveita bem, sem clipping significativo)
- **130-145%** — limite superior aceitável (pouco clipping)
- **> 145%** — sobredimensionado (muito clipping, garantia inversor pode ser afetada)

**Ação:** se FCI > 130%, avisar no diagrama e sugerir revisar.

## 2. Corrente CA (Icc)

Corrente nominal máxima na saída do inversor.

### Monofásico
```
Icc (A) = Pca (kW) × 1000 / (Vsaída × cosφ)
```
- Vsaída: 220 ou 127V (padrão CELESC BT mono)
- cosφ: assumir 1 (inversor FV é resistivo puro)

Exemplo: 5000 / (220 × 1) = 22,7 A

### Trifásico
```
Icc (A) = Pca (kW) × 1000 / (√3 × Vsaída × cosφ)
```
- Vsaída: 380V (padrão CELESC BT tri) ou 220V linha-fase
- √3 ≈ 1,732

Exemplo trifásico 380V: 5000 / (1,732 × 380 × 1) = 7,6 A

## 3. Disjuntor CA do sistema FV

```
Idisjuntor = Icc × 1,25
```
Depois **arredondar pra cima** na amperagem comercial mais próxima:
- 6, 10, 13, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 400, 630...

Exemplo: Icc = 22,7 A → 22,7 × 1,25 = 28,4 A → **32 A comercial**

## 4. Bitola do cabo CA

### Método por corrente (capacidade de condução — NBR 5410)
Tabela simplificada pra PVC, temp ambiente 30°C, 2 condutores carregados:

| Bitola (mm²) | Ampacidade (A) — método B1 |
|--------------|----------------------------|
| 2,5 | 24 |
| 4 | 32 |
| 6 | 41 |
| 10 | 57 |
| 16 | 76 |
| 25 | 101 |
| 35 | 125 |
| 50 | 151 |

**Regra:** bitola ≥ corrente do disjuntor.

### Método por queda de tensão (máx 2%)
```
ΔV (V) = 2 × Icc × ρ × L / S
```
- ρ: resistividade cobre = 0,0172 Ω·mm²/m
- L: comprimento (m)
- S: seção (mm²)
- Fator 2: ida + volta (mono) OU 1,732 (tri)

```
ΔV% = (ΔV / Vnominal) × 100
```

**Regra:** ΔV% ≤ 2% (padrão CELESC pra ramal principal)

Exemplo: 22,7A × 30m × 0,0172 × 2 / 10mm² = 2,34V → 2,34/220 = 1,06% ✓

## 5. Strings do gerador FV

### Máximo de módulos por string (limite tensão CC do inversor)
```
Vmáx_string = Voc_módulo × 1,25 (fator temperatura)
qtd_max_serie = Vmáx_CC_inversor / Vmáx_string
```
Exemplo: Voc = 41V → 41 × 1,25 = 51,25V; Vmáx CC inversor = 500V → 500 / 51,25 = 9,7 → **9 módulos** máximo em série

### Mínimo de módulos por string (partida do MPPT)
```
Vmin_string = Vmp_módulo × 0,85 (fator temperatura)
qtd_min_serie = Vpartida_MPPT / Vmin_string
```
Exemplo: Vmp = 34V → 34 × 0,85 = 28,9V; Vpartida = 150V → 150 / 28,9 = 5,2 → **6 módulos** mínimo

### Faixa recomendada
Entre 6 e 9 módulos em série pra esse exemplo.

## 6. Aterramento

### Número de hastes por potência
| Potência FV | Nº hastes 5/8" × 2,4m |
|-------------|------------------------|
| ≤ 5 kWp | 1 |
| 5-15 kWp | 2 |
| 15-30 kWp | 3 |
| 30-75 kWp | 4-5 (interligadas) |
| > 75 kWp | Malha completa (E-321.0031) |

### Resistência de aterramento
- **Alvo:** ≤ 10 Ω (medida com terrômetro)
- Se solo seco/rochoso: pode chegar a 25 Ω com múltiplas hastes + tratamento com sal/bentonita

## 7. DPS (Dispositivo de Proteção contra Surtos)

### Classe
- **Classe II** — padrão residencial/comercial urbano (surtos indiretos)
- **Classe I** — exposto a raios diretos (rural, aberto, torres)
- **Classe I + II combinado** — proteção completa

### Corrente descarga (In)
- **Classe II:** 20 kA típico
- **Classe I:** 12,5 kA típico

### Tensão residual (Up)
- ≤ 1,5 kV pra circuitos 220V

## 8. Padrão de entrada

### Grupo B (BT) — amperagem por carga+geração

| Carga+Geração | Amperagem monofásica | Bifásica | Trifásica |
|---------------|----------------------|----------|-----------|
| ≤ 8 kW | 40A | 40A | 63A |
| 8-14 kW | 63A | 63A | 100A |
| 14-25 kW | 100A | 100A | 150A |
| 25-40 kW | — | 150A | 200A |
| 40-75 kW | — | 200A | 250A |

**Se ultrapassa 75 kW:** vai pra Grupo A (MT).

### Grupo A (MT) — transformador padrão
| Potência | Trafo (kVA) | Tensão primária | Corrente MT |
|----------|-------------|-----------------|-------------|
| 75-112,5 kVA | 112,5 | 13,8 kV | 4,7 A |
| 112,5-225 | 225 | 13,8 kV | 9,4 A |
| 225-500 | 500 | 13,8/23,1 kV | 20/12 A |
| 500-1000 | 1000 | 23,1/34,5 kV | 25/16 A |

## 9. Distância cabo CC (string → inversor)

- **Padrão residencial:** 5-20 m
- **Comercial médio:** 20-50 m
- **Industrial:** 50-150 m

**Se > 100m:** aumentar bitola pra reduzir queda tensão CC (típico 4-6mm² pra 60-100m, 10mm² pra > 100m).

## 10. Estimativa de geração

### Geração mensal aproximada (kWh/mês)
```
Ger_mensal = Pcc (kWp) × HSP × 30 × 0,80
```
- HSP: Horas de Sol Pleno (~4,5-5,5 pra SC)
- 0,80: eficiência do sistema (perdas cabo, sujidade, inversor)

Exemplo: 7,44 kWp × 5 HSP × 30 × 0,80 = **892 kWh/mês**

### Comparação com consumo (fatura)
- Ideal: geração ≥ consumo médio (compensa 100%)
- FCI baixo: geração < 80% do consumo (subdimensionado)
- FCI alto: geração > 130% do consumo (superdimensionado)

## 11. Retorno do investimento (não vai no diagrama, mas útil)

```
Payback (anos) = Investimento (R$) / (Economia_anual R$)
```
Economia anual ≈ geração_anual (kWh) × tarifa_energia (R$/kWh)

Exemplo típico: 3-5 anos pra sistema residencial bem dimensionado.

## Uso no diagrama

**No bloco "MEMÓRIA DE CÁLCULO" do lado direito:**
```
Pcc = 7,44 kWp / Pca = 5 kW
FCI = 148,8% ⚠️ ACIMA de 130%
Icc inversor = 22,7 A × 1,25 = 28,4 A
Disjuntor comercial = 32 A
Bitola CA = 10 mm² PVC
Queda tensão CA (30m) = 1,06% ✓
```

**No bloco AVISOS (se aplicável):**
- ⚠️ FCI 148% acima do recomendado — revisar
- ⚠️ Padrão atual 40A insuficiente pra 32A do FV — upgrade recomendado
- ⚠️ Hastes NÃO interligadas — corrigir conforme NBR 5410
