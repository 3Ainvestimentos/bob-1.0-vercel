# Deploy: Metrics Aggregator (Cloud Function + Scheduler)

Passo a passo para publicar a Cloud Function de agregação mensal de métricas do report_analyzer e configurar o Cloud Scheduler.

## Pré-requisitos

- Projeto GCP com Firestore e métricas já sendo escritas em `metrics/{date}` e `ultra_batch_jobs`.
- `gcloud` configurado com o projeto e permissões para Cloud Functions (Gen2) e Cloud Scheduler.

## 1. Deploy da Cloud Function

Na raiz do repositório:

```bash
cd functions/metrics_aggregator
```

Crie um arquivo `.env.yaml` (ou use variáveis inline) com o secret usado pelo Scheduler:

```yaml
SCHEDULER_SECRET: "valor_secreto_aleatorio"
```

Deploy:

```bash
gcloud functions deploy metrics_aggregator \
  --gen2 \
  --runtime=python310 \
  --region=us-central1 \
  --source=. \
  --entry-point=metrics_aggregator \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars "SCHEDULER_SECRET=valor_secreto_aleatorio"
```

Anote a **URL do trigger** exibida ao final (ex.: `https://us-central1-PROJECT_ID.cloudfunctions.net/metrics_aggregator`).

Para produção com menos superfície de ataque:

- Use `--no-allow-unauthenticated` e configure o Scheduler com OIDC (service account que invoca a função).
- Ou mantenha `allow-unauthenticated` e dependa apenas do header `X-Scheduler-Secret` (menos seguro que OIDC).

## 2. Cloud Scheduler

Crie o job (substitua `FUNCTION_URL` e `SCHEDULER_SECRET`):

```bash
gcloud scheduler jobs create http metrics-aggregator-daily \
  --location=us-central1 \
  --schedule="0 1 * * *" \
  --uri="FUNCTION_URL" \
  --http-method=POST \
  --headers="X-Scheduler-Secret=SCHEDULER_SECRET" \
  --attempt-deadline=540s
```

- **Cron:** `0 1 * * *` = 01:00 UTC todos os dias.
- **attempt-deadline:** 540s (9 min) para dar tempo da agregação em meses com muitos dias.

Se a função for “private” (--no-allow-unauthenticated), use OIDC em vez de header:

```bash
gcloud scheduler jobs create http metrics-aggregator-daily \
  --location=us-central1 \
  --schedule="0 1 * * *" \
  --uri="FUNCTION_URL" \
  --http-method=POST \
  --oidc-service-account-email=SERVICE_ACCOUNT_EMAIL \
  --attempt-deadline=540s
```

## 3. Índice Firestore (se necessário)

Se a consulta a `ultra_batch_jobs` por `created_at` retornar erro de índice ausente, crie um índice composto:

- Coleção: `ultra_batch_jobs`
- Campos: `created_at` (Ascending)

Ou use o link do erro no console do Firestore para criar o índice sugerido.

## 4. Testar a função (simular o Scheduler)

Para validar que os dados são escritos corretamente no Firestore, você pode disparar a função de duas formas.

### Opção A: Rodar a função localmente e disparar com curl

Útil para testar sem fazer deploy. A função usa o **mesmo Firestore** do projeto (credenciais padrão do GCP).

1. **Credenciais:** no mesmo projeto GCP, use Application Default Credentials:
   ```bash
   gcloud auth application-default login
   ```
   Ou defina `GOOGLE_APPLICATION_CREDENTIALS` apontando para a service account JSON do projeto.

2. **Subir a função localmente** (no diretório `functions/metrics_aggregator`, com o venv ativo). Use o executável do venv para evitar o Python do sistema (ex.: 3.13 exige `functions-framework>=3.8.2`):
   ```bash
   cd functions/metrics_aggregator
   source .venv/bin/activate
   pip install -r requirements.txt
   python -m functions_framework --target=metrics_aggregator --debug --port=8080
   ```

3. **Disparar (simulando o Scheduler)** em outro terminal:
   ```bash
   curl -X POST http://localhost:8080 \
     -H "X-Scheduler-Secret: valor_secreto_aleatorio"
   ```
   Se você **não** definiu `SCHEDULER_SECRET` na function, pode omitir o header. Resposta esperada: `OK` com status 200.

4. **Conferir no Firestore:** coleção `metrics_summary`, documento `{YYYY-MM}` do mês atual (ex.: `2025-02`). Deve ter os campos `adoption`, `volume`, `intensity`, `quality`, `scale`, `closed`, `updated_at`.

**Nota:** Para ver números não zerados, é preciso já existir dados em `metrics/{date}/users`, `metrics/{date}/total/total` e/ou `ultra_batch_jobs` no mês atual. Caso contrário, o doc será criado com zeros.

**Backfill (meses anteriores):** para agregar meses passados (ex.: novembro, dezembro, janeiro), envie um JSON no body com a lista de meses no formato `YYYY-MM`. Cada mês é escrito com `closed: true`:

```bash
curl -X POST http://127.0.0.1:8080 \
  -H "Content-Type: application/json" \
  -d '{"backfill_months": ["2025-11", "2025-12", "2026-01"]}'
```

### Opção B: Deploy + disparo manual (Run now ou curl)

1. Faça o **deploy** da função (passo 1 acima) e anote a **URL do trigger**.

2. **Disparar manualmente:**
   - **Pelo Console GCP:** Cloud Scheduler > job `metrics-aggregator-daily` > “Run now”.
   - **Ou com curl:**
     ```bash
     curl -X POST "URL_DA_FUNCAO" \
       -H "X-Scheduler-Secret: valor_secreto_aleatorio"
     ```

3. **Logs:** Cloud Console > Cloud Functions > metrics_aggregator > Logs.  
4. **Firestore:** confira `metrics_summary/{YYYY-MM}` como na opção A.

## 5. Validação pós-teste

- Resposta da função: corpo `OK`, status 200.
- Firestore: documento `metrics_summary/{YYYY-MM}` existe com `adoption`, `volume`, `intensity`, `quality`, `scale`, `closed`, `updated_at`.
- API do ai-service: `GET /api/report/metrics-summary?from_month=YYYY-MM&to_month=YYYY-MM` retorna esse mês na lista `summaries`.

## 6. Consumo pelo frontend

O ai-service expõe `GET /api/report/metrics-summary?from_month=YYYY-MM&to_month=YYYY-MM`, que lê os documentos `metrics_summary` no intervalo e retorna JSON. O frontend deve chamar esse endpoint (com a autenticação já usada no report).

## Referências

- DEFINE: `docs/DEFINE_METRICAS_REPORT_ANALYZER.md`
- DESIGN: `docs/DESIGN_METRICAS_REPORT_ANALYZER.md`
