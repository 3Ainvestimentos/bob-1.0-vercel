# metrics_aggregator (Cloud Function Gen2)

Cloud Function HTTP que pré-agrega métricas mensais do report_analyzer e persiste em `metrics_summary/{YYYY-MM}` no Firestore. Destinada a ser invocada pelo Cloud Scheduler (cron diário).

## Requisitos

- Python 3.10+
- Firebase Admin SDK (acesso ao Firestore no mesmo projeto GCP)
- Variável de ambiente `SCHEDULER_SECRET` (opcional): se definida, a requisição deve enviar o header `X-Scheduler-Secret` com o mesmo valor.

## Deploy (gcloud)

A partir da raiz do repositório:

```bash
cd functions/metrics_aggregator
gcloud functions deploy metrics_aggregator \
  --gen2 \
  --runtime=python310 \
  --region=us-central1 \
  --source=. \
  --entry-point=metrics_aggregator \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars SCHEDULER_SECRET=seu_secret_aqui
```

Substitua `us-central1` e `SCHEDULER_SECRET` conforme o ambiente. Para produção, use `--no-allow-unauthenticated` e configure OIDC no Scheduler em vez de header.

## Cloud Scheduler

Crie um job que dispare a função diariamente (ex.: 01:00 UTC):

- **Cron:** `0 1 * * *`
- **Target:** URL da função (HTTP POST)
- **Auth:** Header `X-Scheduler-Secret` com o valor de `SCHEDULER_SECRET`, ou OIDC com a service account do Scheduler.

Passo a passo detalhado: `docs/DEPLOY_METRICS_AGGREGATOR.md`.

## Comportamento

- Toda execução: recalcula e escreve **apenas o mês atual** (dados até o dia da execução).
- No dia 1º do mês: além do mês atual, recalcula o **mês anterior** uma vez e persiste com `closed: true` (não será mais alterado).

## Testes

Recomendado usar um venv (o Python do sistema pode ser “externally managed”):

```bash
cd functions/metrics_aggregator
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
pytest tests/ -v
```

Ou, se `pytest` já estiver instalado no ambiente: `python3 -m pytest tests/ -v`.

## Estrutura

- `main.py`: handler HTTP; valida secret, determina mês atual e se deve fechar o anterior, chama o agregador.
- `aggregator.py`: lê `metrics/{date}/users`, `metrics/{date}/total/total` e `ultra_batch_jobs`; calcula MAU, volume, intensidade, qualidade e escala; escreve `metrics_summary/{YYYY-MM}`.
- `config.py`: constantes (TOTAL_ASSESSORS=213, nomes de coleções, timezone UTC).
