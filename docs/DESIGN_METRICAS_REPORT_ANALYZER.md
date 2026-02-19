# DESIGN: Cloud Scheduler – Métricas report_analyzer

> Especificação técnica para pré-agregação mensal das métricas da funcionalidade report_analyzer, fornecendo dados prontos para o frontend.

| Atributo | Valor |
|----------|--------|
| **Feature** | Métricas agregadas (report_analyzer) |
| **Input** | `docs/DEFINE_METRICAS_REPORT_ANALYZER.md` |
| **Fase** | 2 – Design |
| **Status** | ✅ Complete (Built) |
| **Próximo passo** | /ship |

---

## 1. Análise dos Requisitos (DEFINE)

- **Problema:** Frontend precisa exibir 6 métricas (Adoção, Volume, Intensidade, Qualidade x2, Escala) sem custo/latência altos; dados hoje estão em `metrics/{date}/users`, `metrics/{date}/total/total` e `ultra_batch_jobs`.
- **Objetivo:** Job agendado pré-agrega por mês e persiste em documento(s) únicos; frontend (ou API) lê 1 doc por mês.
- **Métricas:** MAU/213, total análises/mês, análises por assessor, sucesso por arquivo ultra-batch, jobs ultra-batch concluídos, % volume ultra-batch.
- **Restrições:** Manter estrutura atual do Firestore; total assessores = 213.

---

## 2. Estrutura Atual do Firestore (referência)

```
metrics /
  {date} /                    # date = YYYY-MM-DD
    users /
      {userId}                 # automatica, personalized, ultra_batch_runs[], last_updated, date
    total /
      total                   # automatica, personalized, ultra_batch_total_files, last_updated, date

ultra_batch_jobs /
  {jobId}                     # user_id, batch_id, total_files, status, processedFiles, successCount, failureCount, created_at, completedAt, ...
  {jobId} / results /
    {fileIndex}               # fileName, success, final_message, error, processedAt
```

---

## 3. Arquitetura da Solução

### 3.1 Visão Geral

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                    FLUXO DE PRÉ-AGREGAÇÃO DE MÉTRICAS (report_analyzer)                 │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│  Cloud Scheduler (cron: ex. 01:00 UTC diário)                                           │
│       │                                                                                 │
│       ▼ HTTP POST (auth: header ou OIDC)                                                │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐     │
│  │  Cloud Function (Gen2) – metrics_aggregator                                     │     │
│  │  • Lê metrics/{date}/users e metrics/{date}/total/total para cada dia do mês   │     │
│  │  • Lê ultra_batch_jobs com created_at no mês                                    │     │
│  │  • Calcula: MAU, volume, intensidade, qualidade (2), escala                    │     │
│  │  • Escreve metrics_summary/{YYYY-MM}                                             │     │
│  └─────────────────────────────────────────────────────────────────────────────────┘     │
│       │                                                                                 │
│       ▼                                                                                 │
│  Firestore                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐     │
│  │  metrics_summary / {YYYY-MM}   # 1 doc por mês, pronto para leitura              │     │
│  └─────────────────────────────────────────────────────────────────────────────────┘     │
│                                                                                         │
│  Frontend (ou API)                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐     │
│  │  GET /api/report/metrics-summary?from=2024-06&to=2025-02                        │     │
│  │  → ai-service lê N docs (metrics_summary/monthly) e retorna JSON                 │     │
│  └─────────────────────────────────────────────────────────────────────────────────┘     │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Schema do Documento de Resumo Mensal

**Caminho:** coleção `metrics_summary`, document ID `{YYYY-MM}` (ex.: `metrics_summary/2025-01`)

```json
{
  "month": "2025-01",
  "closed": false,
  "adoption": {
    "mau": 64,
    "mau_percent": 30.04
  },
  "volume": {
    "total_analyses": 10000
  },
  "intensity": {
    "analyses_per_assessor_avg": 156.25
  },
  "quality": {
    "ultra_batch_success_rate_pct": 92.5,
    "ultra_batch_jobs_completed_rate_pct": 98.2
  },
  "scale": {
    "pct_volume_ultra_batch": 35.0
  },
  "updated_at": "<Firestore SERVER_TIMESTAMP>"
}
```

- **closed:** `true` para meses passados (não mais alterados); `false` para o mês atual.
- **updated_at:** última vez que o doc foi (re)calculado.

---

## 4. Decisões de Arquitetura

### Decisão 1: Onde rodar o job de agregação

| Atributo | Valor |
|----------|--------|
| **Status** | Aceita |
| **Data** | 2026-02-19 |

**Contexto:** É necessário um processo que rode em horário fixo, leia Firestore (muitos docs por mês) e escreva resumos. Opções: Cloud Function chamada pelo Scheduler, endpoint interno no ai-service chamado pelo Scheduler, ou Cloud Run Job.

**Escolha:** **Cloud Function (Gen2)** com trigger HTTP, invocada pelo Cloud Scheduler. A lógica de agregação fica em um deployable separado do ai-service.

**Rationale:** (1) Não sobrecarrega o ai-service (latência/cpu de agregação isolados). (2) Escala a zero quando não está rodando. (3) Mesmo projeto GCP → mesmo Firestore, sem nova infra de rede. (4) Scheduler + Function é padrão GCP para cron jobs.

**Alternativas rejeitadas:**  
1. **Endpoint no ai-service** (POST /internal/aggregate-metrics com secret) — mais simples para deploy, mas acopla agregação ao serviço de API e pode estourar timeout/memória em meses com muitos dias.  
2. **Cloud Run Job** — adequado para cargas muito grandes; para ~30 dias × ~213 users + jobs, Function é suficiente.

**Consequências:** Será necessário configurar e deployar uma Cloud Function (código em `functions/` ou similar) e um Cloud Scheduler job; documentar no README/deploy.

---

### Decisão 2: Frequência e escopo de cada execução

| Atributo | Valor |
|----------|--------|
| **Status** | Aceita |
| **Data** | 2026-02-19 |

**Contexto:** Quando o job roda, deve atualizar só o mês atual, ou também “fechar” o mês anterior?

**Escolha:**  
- **Toda execução (ex.: diária 01:00 UTC):** Recalcular e escrever **apenas o mês atual** (rolling: dados até o dia anterior ou até a hora da execução).  
- **Na primeira execução do mês (ex.: dia 1º às 01:00):** Tratar o **mês anterior** como fechado: recalcular o mês anterior uma vez, escrever com `closed: true` e não mais alterá-lo nas execuções seguintes.

**Rationale:** Meses passados ficam imutáveis (auditoria e consistência). Mês atual sempre reflete o que existir no Firestore até a última execução.

**Consequências:** A função precisa saber “hoje” (ou receber parâmetro) para decidir qual é o “mês atual” e qual é o “mês a fechar” (se for dia 1º).

---

### Decisão 3: Como o frontend obtém os dados

| Atributo | Valor |
|----------|--------|
| **Status** | Aceita |
| **Data** | 2026-02-19 |

**Contexto:** Os resumos estarão em `metrics_summary/monthly/{YYYY-MM}`. O frontend pode ler direto no Firestore (com regras) ou via API.

**Escolha:** **Endpoint no ai-service** `GET /api/report/metrics-summary?from=YYYY-MM&to=YYYY-MM` que lê os documentos `metrics_summary/monthly` no intervalo e retorna JSON. O frontend chama esse endpoint (com autenticação existente).

**Rationale:** (1) Um único lugar para controle de acesso e rate limit. (2) Não expõe estrutura do Firestore ao client. (3) Facilita cache (ex.: Cache-Control) e versionamento da API.

**Alternativas rejeitadas:**  
1. Frontend lê Firestore direto — exige regras de segurança e SDK Firestore no client para dados que são “admin/dashboard”.  
2. Nova API em outro serviço — desnecessário; ai-service já tem contexto de “report” e Firestore.

**Consequências:** Implementar um endpoint de leitura no ai-service; documentar query params e formato da resposta.

---

## 5. Lógica de Cálculo (algoritmo do agregador)

- **MAU:** Para cada dia do mês em `metrics/{date}/users`, coletar todos os `userId` que tenham `automatica > 0` ou `personalized > 0` ou `ultra_batch_runs` não vazio. MAU = número de `userId` distintos no mês. `mau_percent = (MAU / 213) * 100`.
- **Volume:** Para cada dia do mês, ler `metrics/{date}/total/total` e somar `automatica + personalized + ultra_batch_total_files`. Total análises do mês = soma desses valores.
- **Intensidade:** `analyses_per_assessor_avg = total_analyses / MAU` (se MAU > 0); senão 0.
- **Qualidade (sucesso por arquivo ultra-batch):** Listar `ultra_batch_jobs` com `created_at` no intervalo do mês (usar filtro ou varrer e filtrar por data). Para cada job: `successCount`, `failureCount`. Taxa = soma(successCount) / (soma(successCount) + soma(failureCount)); se denominador 0, usar 0 ou N/A conforme definido.
- **Qualidade (jobs concluídos):** Mesmos jobs do mês. Concluídos = count(`status == 'completed'`); total final = count(`status in ('completed', 'failed')`). Taxa = concluídos / total_final; se total_final 0, 0 ou N/A.
- **Escala:** `pct_volume_ultra_batch = (soma mensal de ultra_batch_total_files) / total_analyses * 100`; se total_analyses 0, 0.

**Fuso:** Usar UTC para “dia” e “mês” (consistente com `metrics` que usam `date_str` em UTC).

---

## 6. File Manifest

| # | File | Action | Purpose | Dependencies | Agent |
|---|------|--------|---------|--------------|-------|
| 1 | `functions/metrics_aggregator/main.py` | Create | HTTP handler (Cloud Function Gen2); recebe request do Scheduler, chama agregador, retorna 200 | 2, 3 | @function-developer |
| 2 | `functions/metrics_aggregator/aggregator.py` | Create | Lógica: iterar dias do mês, ler metrics + ultra_batch_jobs, calcular 6 KPIs, escrever metrics_summary/{YYYY-MM} | 3 | @python-developer |
| 3 | `functions/metrics_aggregator/config.py` | Create | TOTAL_ASSESSORS=213, nomes de coleções (metrics, metrics_summary, ultra_batch_jobs), timezone | None | @python-developer |
| 4 | `functions/metrics_aggregator/requirements.txt` | Create | firebase-admin, flask (ou functions_framework para Gen2) | None | (general) |
| 5 | `ai-service/app/api/report.py` | Modify | Adicionar GET /metrics-summary que lê metrics_summary/{YYYY-MM} e retorna JSON | app.config.get_firestore_client | @code-reviewer / python-developer |
| 6 | `ai-service/app/models/requests.py` (ou responses) | Modify | Modelo de resposta para metrics-summary (lista de resumos mensais) se necessário | None | @python-developer |
| 7 | `functions/metrics_aggregator/README.md` | Create | Como fazer deploy da Function e configurar Cloud Scheduler (URL, cron, auth) | None | @code-documenter |
| 8 | `docs/DEPLOY_METRICS_AGGREGATOR.md` | Create | Passo a passo: deploy da Function, criação do Scheduler, variáveis (projeto, etc.) | None | @code-documenter |
| 9 | `functions/metrics_aggregator/tests/test_aggregator.py` | Create | Testes unitários: cálculo de MAU, volume, intensidade, qualidade, escala a partir de mocks de Firestore | 2, 3 | @test-generator |

**Observação:** O projeto pode não ter pasta `functions/` ainda; criar na raiz do repositório (ao lado de `ai-service/`, `src/`). Se a convenção for outra (ex.: `gcp-functions/`), ajustar caminhos.

---

## 7. Pontos de Integração com o Firestore Existente

- **Somente leitura:** `metrics/{date}/users`, `metrics/{date}/total/total`, `ultra_batch_jobs` (e opcionalmente subcoleção `results` se for preciso detalhe por arquivo).  
- **Escrita:** Apenas `metrics_summary/{YYYY-MM}`. Não alterar `metrics` nem `ultra_batch_jobs`.  
- **Índices:** Se a consulta a `ultra_batch_jobs` for por `created_at`, pode ser necessário índice composto. Para poucos jobs por mês, uma varredura da coleção com filtro em memória por `created_at` é aceitável; caso contrário, criar índice Firestore para `created_at`.

---

## 8. Configuração do Cloud Scheduler (recomendação)

- **Cron:** `0 1 * * *` (01:00 UTC todos os dias).  
- **Target:** HTTP POST para a URL da Cloud Function.  
- **Auth:** OIDC token com service account do Scheduler, e a Function valida que a requisição veio do Scheduler (ou header secreto configurado no Scheduler e validado na Function).  
- **Body (opcional):** `{}` ou `{"scope": "current_month"}`; no dia 1º a função pode ainda receber `{"close_previous_month": true}` ou inferir pela data.

---

## 9. Padrão de Código – Handler da Function

```python
# functions/metrics_aggregator/main.py (exemplo Gen2 HTTP)
import functions_framework
from aggregator import run_monthly_aggregation

@functions_framework.http
def metrics_aggregator(request):
    # 1. Validar origem (ex.: header X-Scheduler-Secret ou OIDC)
    if request.headers.get("X-Scheduler-Secret") != os.environ.get("SCHEDULER_SECRET"):
        return ("Unauthorized", 401)
    # 2. Determinar mês atual e se deve fechar o anterior
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    current_month = now.strftime("%Y-%m")
    close_previous = now.day == 1
    # 3. Executar agregação
    try:
        run_monthly_aggregation(current_month=current_month, close_previous_month=close_previous)
        return ("OK", 200)
    except Exception as e:
        # log e retornar 500 para Scheduler retry
        return (str(e), 500)
```

---

## 10. Padrão de Código – Leitura do resumo no ai-service

```python
# ai-service: GET /api/report/metrics-summary?from=2024-06&to=2025-02
from fastapi import APIRouter, Query
router = APIRouter()

@router.get("/metrics-summary")
async def get_metrics_summary(
    from_month: str = Query(..., description="YYYY-MM"),
    to_month: str = Query(..., description="YYYY-MM"),
):
    db = get_firestore_client()
    # Validar from_month <= to_month; limitar ex.: 24 meses
    summaries = []
    for month in month_range(from_month, to_month):
        ref = db.collection("metrics_summary").document(month)
        doc = ref.get()
        if doc.exists:
            summaries.append({ "month": month, **doc.to_dict() })
    return {"summaries": summaries}
```

---

## 11. Estrutura Final do Firestore para Resumos

- **Coleção:** `metrics_summary`
- **Document ID:** `{YYYY-MM}` (ex.: `2025-01`)
- **Campos:** conforme schema do § 3.2 (month, closed, adoption, volume, intensity, quality, scale, updated_at).

A Function escreve: `db.collection("metrics_summary").document(month_key).set(data)`. O ai-service lê: `db.collection("metrics_summary").document(month_key).get()` para cada mês no intervalo.

---

## 12. Estratégia de Testes

| Tipo | Escopo | Arquivos | Ferramentas |
|------|--------|----------|-------------|
| Unit | Cálculo de MAU, volume, intensidade, qualidade, escala a partir de estruturas em memória (mock de docs) | `functions/metrics_aggregator/tests/test_aggregator.py` | pytest |
| Unit | Handler: rejeita request sem secret; retorna 200 quando agregação ok | `functions/metrics_aggregator/tests/test_main.py` | pytest |
| Integration | Opcional: Function local + Firestore emulador, rodar agregação para um mês de teste | `functions/metrics_aggregator/tests/test_integration.py` | pytest + emulador |
| API | GET /metrics-summary retorna lista de resumos quando há docs em metrics_summary | ai-service testes de API existentes | pytest |

---

## 13. Checklist de Qualidade

- [ ] Diagrama de arquitetura (§ 3.1) descreve o fluxo Scheduler → Function → Firestore e consumo pela API.
- [ ] Decisões documentadas (Function vs ai-service, frequência, entrega ao frontend).
- [ ] File manifest com todos os arquivos e responsável sugerido (agent).
- [ ] Schema do documento de resumo e caminho Firestore definidos (§ 3.2 e § 11).
- [ ] Configuração do Scheduler e segurança (auth) descritas (§ 8).
- [ ] Estratégia de testes cobre agregação e endpoint de leitura.

---

## 14. Referências

- DEFINE: `docs/DEFINE_METRICAS_REPORT_ANALYZER.md`
- Firestore atual: `ai-service/app/services/metrics.py`, `ai-service/app/api/report.py`, `ai-service/app/services/report_analyzer/ultra_batch_processing.py`
- Design anterior (métricas): `docs/DESIGN_CORRECAO_METRICAS.md`
- Build: `docs/BUILD_REPORT_METRICAS_REPORT_ANALYZER.md`
