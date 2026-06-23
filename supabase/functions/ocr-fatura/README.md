# Edge Function: ocr-fatura (v2)

> Extrai dados estruturados de faturas CELESC usando Google Vision API + regex.
> Substitui a v1 que só extraía valor e consumo médio.

## O que extrai

- UC (Unidade Consumidora)
- Razão social / Nome
- CPF/CNPJ
- Endereço (logradouro, bairro, cidade, UF, CEP)
- Grupo / Subgrupo tarifário (A/A4, B/B3, etc)
- Classe (Residencial, Comercial, Industrial, Rural...)
- Tipo de ligação (Mono / Bi / Trifásico)
- Modalidade tarifária (Convencional, Horosazonal Verde/Azul, Branca)
- Bandeira tarifária
- Tensão de fornecimento (kV — grupo A)
- Mês de referência + data de vencimento
- Valor total da fatura (R$)
- Consumo do mês (kWh)
- Demanda contratada / medida FP / medida Ponta (kW — grupo A)
- Histórico 12 meses (meses identificados)
- Detecção de geração própria (códigos 0J/0K/0I/0L)

## Como deployar

### Pré-requisitos

1. **Supabase CLI** instalado: https://supabase.com/docs/guides/cli
2. Logado no projeto: `supabase login`
3. Link com o projeto: `supabase link --project-ref <seu-ref>`

### Deploy

A partir da raiz do `spin-app/`:

```bash
supabase functions deploy ocr-fatura
```

### Configurar secret (chave Google Vision)

```bash
supabase secrets set GOOGLE_VISION_API_KEY=AIzaSy...
```

Pra obter a chave Google Vision:
- Console GCP → APIs & Services → Credentials
- Cria API Key OU usa Service Account
- Ativa **Cloud Vision API** no projeto

## Teste local (opcional)

```bash
supabase functions serve ocr-fatura --env-file .env.local
```

Em outro terminal:

```bash
curl -X POST http://localhost:54321/functions/v1/ocr-fatura \
  -H "Authorization: Bearer ANON_KEY" \
  -F "file=@/caminho/pra/fatura.pdf"
```

## Endpoint em produção

```
POST https://<seu-projeto>.supabase.co/functions/v1/ocr-fatura

Headers:
  Authorization: Bearer <SUPABASE_ANON_KEY>
  apikey: <SUPABASE_ANON_KEY>

Body (FormData):
  file: <PDF, JPG ou PNG da fatura CELESC>
```

## Resposta

```jsonc
{
  "sucesso": true,
  "dados": {
    "uc": "56260820",
    "razao_social": "BERKE COMERCIO DE VEICULOS LTDA",
    "cpf_cnpj": "22.007.073/0001-XX",
    "endereco": {
      "logradouro": "JOAO SAMPAIO DA SILVA S/N",
      "bairro": null,
      "cidade": "FLORIANOPOLIS",
      "uf": "SC",
      "cep": "88090-820"
    },
    "grupo": "B",
    "subgrupo": "B3",
    "classe": "COMERCIAL",
    "tipo_ligacao": "trifasico",
    "modalidade_tarifaria": "convencional",
    "bandeira_tarifaria": "verde",
    "tensao_fornecimento_kv": null,
    "mes_referencia": "02/2026",
    "data_vencimento": "2026-03-11",
    "valor_total_reais": 1994.77,
    "consumo_mes_kwh": 1949,
    "demanda_contratada_kw": null,
    "demanda_medida_fp_kw": null,
    "demanda_medida_ponta_kw": null,
    "historico_12_meses": [
      { "mes_ano": "JAN/26", "consumo_kwh": null },
      { "mes_ano": "DEZ/25", "consumo_kwh": null }
    ],
    "tem_geracao_propria": false
  },
  "meta": {
    "versao_edge_function": "v2",
    "tamanho_texto_extraido": 4523
  }
}
```

## Casos de erro

| Erro | Causa | Ação |
|---|---|---|
| 400 "Arquivo não enviado" | Sem campo `file` no FormData | Conferir nome do campo |
| 400 "Arquivo > 10MB" | Excede limite | Reduzir tamanho |
| 500 "GOOGLE_VISION_API_KEY não configurada" | Secret faltando | `supabase secrets set ...` |
| 500 "Google Vision XXX: ..." | API rejeitou | Verificar quota / chave válida |
| 200 sem dados | OCR não encontrou padrões | Fatura ilegível ou layout não-CELESC |

## Versão

**v2** — junho/2026 — extração completa de campos do cliente + dados técnicos.
