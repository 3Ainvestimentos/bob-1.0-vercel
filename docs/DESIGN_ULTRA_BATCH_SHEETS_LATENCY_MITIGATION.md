# DESIGN: Mitigação de latência – ultra-batch (Sheets + whitelist)

> Especificação técnica derivada de `docs/DEFINE_ULTRA_BATCH_SHEETS_LATENCY_MITIGATION.md`. Sem nova infraestrutura; alterações apenas no ai-service.

| Atributo | Valor |
|----------|--------|
| **Feature** | Mitigação de latência para ultra-batch (Sheets + whitelist) |
| **Fase** | 2 – Design |
| **Input** | docs/DEFINE_ULTRA_BATCH_SHEETS_LATENCY_MITIGATION.md |
| **Status** | ✅ Complete (Built) |
| **Próximo passo** | /ship — deploy e validação em produção |

---

## 1. Análise de requisitos (resumo)

| Elemento | Conteúdo |
|----------|----------|
| **Problema** | ai-service já tem latência alta nos picos; configure-sheets e is_digital síncronos podem piorar fila e “Execução do usuário”. |
| **Critérios de sucesso** | configure-sheets retorna em &lt; 15 s (p95); backfill em background; is_digital não bloqueia event loop; planilha sem duplicação (idempotência backfill vs incremental); opcional batch na escrita incremental e backfill_status "failed" + retry. |
| **Fora do escopo** | Nova infra (filas, workers); refatorar todo o ultra-batch; SLA rígido de backfill. |

---

## 2. Arquitetura – visão geral

**Estado atual (antes da mitigação):**

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│  FLUXO ATUAL (configure-sheets síncrono)                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Cliente          report.py                  google_sheets_service          │
│      │                 │                              │                      │
│      │  POST configure-sheets                         │                      │
│      │─────────────────▶│                              │                      │
│      │                 │ is_digital(uid)  [BLOQUEIA]   │                      │
│      │                 │   (Firestore síncrono)        │                      │
│      │                 │ create_spreadsheet_for_job   │                      │
│      │                 │─────────────────────────────▶│ Drive + Sheets + DB   │
│      │                 │◀─────────────────────────────│                      │
│      │                 │ await backfill_sheets_...    │                      │
│      │                 │─────────────────────────────▶│ Firestore read +     │
│      │                 │         [DEMORA]             │   batch write       │
│      │                 │◀─────────────────────────────│                      │
│      │  HTTP 200       │                              │                      │
│      │◀─────────────────│  backfilled_rows: N         │                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Estado alvo (após mitigação):**

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│  FLUXO ALVO: def + thread (BackgroundTasks / run_in_executor); nunca async  │
│              def com sync dentro no loop                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Cliente          report.py                  google_sheets_service          │
│      │                 │                              │                      │
│      │  POST configure-sheets                         │                      │
│      │─────────────────▶│                              │                      │
│      │                 │ run_in_executor(is_digital)  │ [NÃO BLOQUEIA]       │
│      │                 │ create_spreadsheet_for_job   │                      │
│      │                 │─────────────────────────────▶│ Drive + Sheets + DB   │
│      │                 │◀─────────────────────────────│                      │
│      │                 │ BackgroundTasks.add_task(    │                      │
│      │                 │   backfill_sheets_..._sync,  │  [função DEF sync]   │
│      │                 │   job_id)                    │                      │
│      │  HTTP 200       │   (roda em thread após 200)  │                      │
│      │◀─────────────────│  backfill_status: "pending"  │                      │
│      │                 │                              │                      │
│      │                 │   [thread pool] backfill_sync │ Firestore + Sheets  │
│      │                 │   (def, não async def)       │  (todo em thread)   │
│                                                                              │
│   check-whitelist: authorized = await run_in_executor(None, is_digital, uid)  │
│   ultra_batch (generator): run_in_executor(None, write_sync, ...) sem await │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Decisões de arquitetura

### Decisão 1: Backfill em background com BackgroundTasks + função sync (def)

| Atributo | Valor |
|----------|--------|
| **Status** | Aceita |
| **Data** | 2026-02-24 |

**Contexto:** O DEFINE exige que `POST /ultra-batch/configure-sheets` retorne em &lt; 15 s (p95). Hoje a resposta espera criação da planilha + backfill completo; o backfill pode levar dezenas de segundos ou minutos para jobs com muitos resultados. Além disso, a regra acordada é: **background task com I/O pesado ou sync = `def` + execução em thread**, nunca `async def` com sync dentro no event loop (a função atual `backfill_sheets_from_results` é async mas faz Firestore sync e stream no loop, bloqueando-o).

**Escolha:** (1) Implementar **função síncrona** `def backfill_sheets_from_results_sync(job_id: str) -> int` que faz todo o trabalho (leitura Firestore, montagem de linhas, batch write Sheets, opcional update do doc). (2) No handler `configure_sheets`, após criar a planilha e persistir a config, usar **BackgroundTasks.add_task(backfill_sheets_from_results_sync, job_id)** e retornar imediatamente com `backfill_status: "pending"`. O FastAPI executa a função sync no thread pool após enviar a resposta; o event loop nunca é bloqueado pelo backfill.

**Rationale:** Alinhado à regra do outro projeto (async def → def; create_task → BackgroundTasks para request handler). Elimina bloqueio do loop porque a função inteira roda em thread; evita “async def com sync dentro”.

**Alternativas rejeitadas:**
1. Manter backfill síncrono na resposta — rejeitada porque é a causa principal da latência alta do endpoint.
2. asyncio.create_task(backfill_async) — rejeitada porque backfill_async por dentro usa Firestore sync e stream, bloqueando o loop; a regra exige def + thread.
3. Cloud Tasks ou Pub/Sub — rejeitada por estar fora do escopo (sem nova infra).

**Consequências:** A resposta de configure-sheets deixa de incluir `backfilled_rows` no caso “nova planilha”; passa a incluir `backfill_status: "pending"`. O handler precisa receber `BackgroundTasks` (injeção do FastAPI). Opcional: ao terminar o backfill_sync, atualizar `google_sheets_config/{jobId}` com `backfill_status: "completed"` e `backfilled_rows` (COULD no DEFINE).

---

### Decisão 2: is_digital no event loop via run_in_executor

| Atributo | Valor |
|----------|--------|
| **Status** | Aceita |
| **Data** | 2026-02-24 |

**Contexto:** `is_digital(user_id)` é síncrono e faz até duas leituras no Firestore (config/digital_team, users/{uid}). Chamado diretamente em handlers async, bloqueia o event loop e atrasa outras requisições.

**Escolha:** Nos handlers que chamam `is_digital` (check_whitelist e configure_sheets), **não** chamar `is_digital(body.user_id)` no thread principal. Executar em thread do default executor: `authorized = await loop.run_in_executor(None, is_digital, body.user_id)`. O módulo `digital_whitelist` permanece inalterado (continua síncrono); apenas o ponto de chamada em `report.py` muda.

**Rationale:** Mínima invasão; não exige refatorar digital_whitelist para async nem novo cliente Firestore; atende MUST do DEFINE (“is_digital não bloquear o event loop”).

**Alternativas rejeitadas:**
1. Deixar is_digital síncrono no handler — rejeitada porque bloqueia o event loop.
2. Criar is_digital_async em digital_whitelist com cliente Firestore async — rejeitada por ser mudança maior e desnecessária para o objetivo; run_in_executor resolve com uma linha por handler.

**Consequências:** Pequeno uso adicional do default thread pool (já usado por create_spreadsheet e write row); impacto desprezível. Cache em memória da whitelist (TTL 300s) continua reduzindo chamadas Firestore.

---

### Decisão 3: Contrato da resposta de configure-sheets

| Atributo | Valor |
|----------|--------|
| **Status** | Aceita |
| **Data** | 2026-02-24 |

**Contexto:** Hoje a resposta inclui `backfilled_rows` quando a planilha é criada. Com backfill em background, não temos esse valor na hora da resposta.

**Escolha:** Para **nova** configuração (planilha criada nesta requisição): retornar `success`, `spreadsheet_id`, `spreadsheet_url`, `spreadsheet_name` e **`backfill_status: "pending"`**. Não incluir `backfilled_rows` na resposta quando backfill for assíncrono. Para **config já existente** (existing.get("enabled")): manter resposta atual, sem backfill_status. Opcional (COULD): GET /ultra-batch/sheets-config/{job_id} pode retornar `backfill_status` e `backfilled_rows` quando o documento google_sheets_config for atualizado pelo backfill ao terminar.

**Rationale:** Compatível com DEFINE (contrato pode ganhar campo opcional; não remover campos atuais); cliente legado que ignora backfill_status continua funcionando; frontend pode mostrar “Planilha criada; preenchendo resultados…” quando vir backfill_status "pending".

**Consequências:** Frontend que hoje usa `backfilled_rows` da resposta para exibir “N linhas escritas” precisará usar backfill_status e, se quiser a contagem depois, GET sheets-config (se implementarmos atualização do doc ao terminar o backfill).

---

### Decisão 4: Regra “def + thread” para todas as background tasks

| Atributo | Valor |
|----------|--------|
| **Status** | Aceita |
| **Data** | 2026-02-24 |

**Contexto:** Tarefas em background que fazem I/O pesado ou chamadas síncronas (Firestore, Sheets, Drive) não devem ser `async def` com esse código rodando no event loop — bloqueiam polling e outras requisições (caso real em outro projeto: status preso em "na_fila").

**Escolha:** **Regra única:** background task que faz I/O pesado ou sync = **`def`** + execução em thread. (1) **Onde há request handler:** preferir **BackgroundTasks.add_task(sync_fn, *args)** (ex.: backfill no configure_sheets). (2) **Onde não há request handler** (ex.: generator do ultra-batch): **run_in_executor(None, sync_fn, *args)** **sem await** (fire-and-forget em thread) (ex.: escrita por resultado no Sheets). Nunca usar `async def` com sync dentro rodando no loop.

**Rationale:** Garante que o event loop nunca seja bloqueado por Firestore/Sheets/Drive; alinhado à solução validada no outro projeto (async def → def; create_task → BackgroundTasks para handlers).

**Alternativas rejeitadas:**
1. Manter async def e só colocar “parte pesada” em run_in_executor — rejeitada porque a função atual de backfill faz Firestore get + stream + loop no loop; apenas o batch write estava em executor. A regra exige que **toda** a lógica bloqueante rode em thread.
2. Migrar para cliente Firestore async — rejeitada por estar fora do escopo; def + thread resolve sem nova dependência.

**Consequências:** Backfill vira `backfill_sheets_from_results_sync` (def); escrita por resultado vira `write_ultra_batch_result_to_sheets_sync` (def) e no generator usa-se run_in_executor sem await. create_spreadsheet_for_job pode permanecer async com run_in_executor interno (um .set no Firestore após executor é rápido) ou, para consistência total, virar sync + executor no handler (opcional).

---

### Decisão 5: Idempotência backfill vs incremental (evitar duplicação)

| Atributo | Valor |
|----------|--------|
| **Status** | Aceita |
| **Data** | 2026-02-24 |

**Contexto:** Se o usuário configura Sheets **durante** o job, o incremental escreve cada resultado novo e o backfill (ao rodar) lê todos os results e escreve todos. Sem partição, os resultados já escritos pelo incremental seriam escritos de novo pelo backfill → linhas duplicadas na planilha. A config já tem `created_at` (SERVER_TIMESTAMP); cada result tem `processedAt`.

**Escolha:** Partição por **config.created_at**: (1) **backfill_sync:** ao iterar `results`, incluir na lista de linhas apenas documentos em que `processedAt < config.created_at` (resultados que existiam antes do usuário clicar em Configure). (2) **write_ultra_batch_result_to_sheets_sync (incremental):** receber ou ler `config.created_at`; escrever apenas se `processedAt >= config.created_at` (resultados que completaram depois da configuração). Assim backfill cobre o “passado”; incremental cobre o “futuro”; nenhuma linha é escrita duas vezes.

**Rationale:** Elimina duplicação sem “clear and rewrite” nem nova infra; usa campos já existentes (created_at na config, processedAt nos results).

**Consequências:** backfill_sync e write_sync precisam ter acesso a config.created_at. Results devem ter **processedAt** preenchido: no fluxo de sucesso do ultra_batch_processing, incluir `processedAt: firestore.SERVER_TIMESTAMP` em `result_data` antes de `result_ref.set(result_data)` (no fluxo de erro já existe).

---

### Decisão 6: Escrita incremental em batch/buffer (SHOULD)

| Atributo | Valor |
|----------|--------|
| **Status** | Aceita |
| **Data** | 2026-02-24 |

**Contexto:** Ultra-batch tem até 100 resultados por job. Disparar 100x `run_in_executor(write_sync, ...)` sem await enfileira até 100 tarefas no thread pool padrão, podendo saturá-lo e atrasar is_digital, backfill e criação de planilha em pico.

**Escolha:** **SHOULD:** implementar buffer por job: acumular linhas em memória (ex.: lista por job_id) e flush com `run_in_executor(_batch_write_rows_sync, ...)` a cada N linhas (ex.: 50) ou a cada T segundos (ex.: 2 s). Assim reduz-se o número de tarefas enfileiradas no executor. Implementação mínima: buffer em dict por job_id no generator; ao atingir tamanho ou timeout, uma única chamada run_in_executor(batch_write_sync, job_id, rows) sem await.

**Rationale:** Mitigação sem nova infra; evita “tempestade de threads” em jobs grandes (DEFINE SHOULD).

**Consequências:** Lógica de buffer no ultra_batch_processing ou em helper; flush final ao terminar o job para não perder linhas restantes.

---

### Nota: create_spreadsheet_for_job e sync no loop

**create_spreadsheet_for_job** executa Drive + Sheets dentro de `_create_spreadsheet_sync` no executor; no event loop só resta **um** `db.collection("google_sheets_config").document(job_id).set({...})` após o `await run_in_executor(...)`. Esse .set é rápido e aceitável; não é o gargalo. Opcional: mover o .set para dentro de `_create_spreadsheet_sync` para zerar sync no loop.

---

### Comportamento esperado: falha do backfill e retry

- **BackgroundTasks** não garante execução se o processo morrer (já documentado em A-LM-001).
- Se **backfill_sync** falhar (ex.: rate limit Sheets, rede): dentro da sync, em bloco except, opcionalmente atualizar `google_sheets_config/{job_id}` com `backfill_status: "failed"`. A resposta HTTP já foi enviada; o usuário pode chamar configure-sheets de novo (config já existente retorna sucesso com dados atuais; pode-se re-agendar backfill nesse caso ou expor endpoint “retry backfill” no futuro — COULD).
- **Reconfigurar (configure-sheets com config já existente)** é idempotente: hoje retorna os dados da config; pode-se documentar que reconfigurar re-agenda backfill se backfill_status for "failed" (implementação opcional).

---

## 4. Manifesto de arquivos

| # | Arquivo | Ação | Propósito | Dependências |
|---|---------|------|-----------|--------------|
| 1 | `ai-service/app/api/report.py` | Modificar | (1) check_whitelist: is_digital via run_in_executor. (2) configure_sheets: injetar BackgroundTasks; is_digital via run_in_executor; após create_spreadsheet_for_job, **BackgroundTasks.add_task(backfill_sheets_from_results_sync, body.job_id)**; retornar com backfill_status "pending". (3) get_sheets_config_endpoint: incluir backfill_status e backfilled_rows quando presentes no doc | Nenhuma |
| 2 | `ai-service/app/services/report_analyzer/google_sheets_service.py` | Modificar | (1) **def backfill_sheets_from_results_sync(job_id):** Firestore get config (com created_at); iterar results e incluir só onde **processedAt &lt; config.created_at**; _batch_write_rows_sync; update doc com backfill_status ("completed" ou "failed" em except) e backfilled_rows. (2) **def write_ultra_batch_result_to_sheets_sync(job_id, account_number, final_message, processed_at):** get config; só escrever se **processed_at >= config.created_at**; _write_row_sync (ou enfileirar em buffer para batch). (3) Opcional: batch/buffer no serviço ou no generator | Nenhuma |
| 3 | `ai-service/app/services/report_analyzer/ultra_batch_processing.py` | Modificar | (1) Em vez de create_task(write_...), usar **run_in_executor(None, write_sync, job_id, account, message, processed_at)** sem await; passar processed_at (ex.: result_data.get("processedAt") ou timestamp atual) para idempotência. (2) SHOULD: buffer por job (ex.: 50 linhas ou 2 s) e flush com run_in_executor(batch_write_sync, job_id, rows) sem await; flush final ao terminar o job | 2 |
| 4 | `ai-service/app/services/report_analyzer/tests/` ou `ai-service/app/api/` testes | Modificar/Criar | Testes: configure-sheets retorna rápido e backfill é agendado via BackgroundTasks; check_whitelist e configure_sheets usam run_in_executor para is_digital; escrita incremental usa run_in_executor sem await | 1, 2, 3 |

**Não alterar:**
- `ai-service/app/services/digital_whitelist.py` — permanece como está; apenas o chamador (report.py) usa run_in_executor para is_digital.

---

## 5. Padrões de código

### 5.1 Helper: is_digital sem bloquear o event loop

Em `report.py`, para qualquer handler que precise de `is_digital(user_id)`:

```python
import asyncio

def _is_digital_sync(user_id: str) -> bool:
    """Wrapper para passar ao run_in_executor (is_digital é síncrono)."""
    return is_digital(user_id)

# No handler async:
loop = asyncio.get_running_loop()
authorized = await loop.run_in_executor(None, _is_digital_sync, body.user_id)
```

Ou diretamente (is_digital aceita um argumento):

```python
authorized = await loop.run_in_executor(None, is_digital, body.user_id)
```

### 5.2 configure_sheets: BackgroundTasks + função sync (def)

No handler, injetar `BackgroundTasks` e agendar a função **síncrona** (não async):

```python
from fastapi import BackgroundTasks

@router.post("/ultra-batch/configure-sheets")
async def configure_sheets(body: ConfigureSheetsRequest, background_tasks: BackgroundTasks):
    # ... is_digital via run_in_executor; validações ...
    result = await create_spreadsheet_for_job(body.job_id, body.user_id, body.custom_name)
    # Backfill: função DEF (sync), roda em thread após enviar a resposta.
    background_tasks.add_task(backfill_sheets_from_results_sync, body.job_id)
    return {
        "success": True,
        "spreadsheet_id": result["spreadsheet_id"],
        "spreadsheet_url": result["spreadsheet_url"],
        "spreadsheet_name": result["spreadsheet_name"],
        "backfill_status": "pending",
    }
```

Tratamento de erro: se `backfill_sheets_from_results_sync` falhar (ex.: rate limit Sheets), o FastAPI loga a exceção no thread; opcionalmente dentro da sync pode-se atualizar o doc com backfill_status: "failed". A resposta HTTP já foi enviada.

### 5.3 backfill_sheets_from_results_sync (def) + idempotência

Função **síncrona**; incluir apenas resultados com **processedAt < config.created_at** (evitar duplicar o que o incremental já escreveu):

```python
def backfill_sheets_from_results_sync(job_id: str) -> int:
    """Lê resultados do Firestore (apenas processedAt < config.created_at) e escreve na planilha. Chamar via BackgroundTasks."""
    db = get_firestore_client()
    config_doc = db.collection("google_sheets_config").document(job_id).get()
    if not config_doc.exists or not config_doc.to_dict().get("enabled"):
        return 0
    config = config_doc.to_dict()
    created_at = config.get("created_at")  # datetime do Firestore
    spreadsheet_id = config["spreadsheet_id"]
    sheet_name = config.get("sheet_name", "Resultados")
    results_ref = db.collection("ultra_batch_jobs").document(job_id).collection("results")
    rows = []
    for doc in results_ref.order_by("__name__").stream():
        data = doc.to_dict()
        if not data.get("success"):
            continue
        processed_at = data.get("processedAt")
        if created_at and processed_at and processed_at >= created_at:
            continue
        account = data.get("accountNumber", "")
        message = data.get("final_message", "")
        if account and message:
            rows.append([account, _limpar_resposta_para_sheets(message)])
    if not rows:
        return 0
    try:
        _batch_write_rows_sync(spreadsheet_id, sheet_name, rows)
        db.collection("google_sheets_config").document(job_id).update({
            "backfill_status": "completed",
            "backfilled_rows": len(rows),
        })
    except Exception as e:
        logger.exception("Backfill falhou para job %s: %s", job_id, e)
        db.collection("google_sheets_config").document(job_id).update({"backfill_status": "failed"})
    return len(rows)
```

### 5.4 Escrita incremental: idempotência + run_in_executor (ou buffer)

**Incremental deve escrever só resultados com processedAt >= config.created_at.** No generator, ao persistir o result no Firestore use `processedAt: firestore.SERVER_TIMESTAMP`; ao chamar write_sync, passe esse timestamp (ou o valor lido do doc após set). write_sync lê config e só chama _write_row_sync se `processed_at >= config.created_at`.

```python
# Exemplo: passar processed_at (ex.: datetime.utcnow() no momento do set, ou ler do doc)
loop = asyncio.get_running_loop()
processed_at = result_data.get("processedAt")  # ou timestamp usado no result_ref.set
loop.run_in_executor(
    None,
    write_ultra_batch_result_to_sheets_sync,
    job_id,
    account_number,
    result_data["final_message"],
    processed_at,
)
# Não await: fire-and-forget em thread.
```

**SHOULD – Batch/buffer:** em vez de 1 run_in_executor por resultado, acumular linhas em um buffer por job_id e fazer flush (run_in_executor(batch_write_sync, job_id, rows)) a cada 50 linhas ou a cada 2 s; flush final ao terminar o job.

---

## 6. Estratégia de testes

| Tipo | Escopo | Arquivos | Ferramentas |
|------|--------|----------|-------------|
| Unit | Handlers: check_whitelist e configure_sheets usam run_in_executor para is_digital; configure_sheets usa BackgroundTasks.add_task(backfill_sync) e retorna backfill_status "pending" | `ai-service/app/api/` ou `app/services/report_analyzer/tests/` | pytest, unittest.mock (patch BackgroundTasks.add_task, run_in_executor) |
| Unit | google_sheets_service: backfill_sheets_from_results_sync e write_ultra_batch_result_to_sheets_sync (mock Firestore e Sheets); opcional: update do doc ao terminar backfill | `ai-service/app/services/report_analyzer/tests/` | pytest, mock |
| Integração | POST configure-sheets: resposta 200 em &lt; 15 s com job que tem muitos results (backfill em background); GET sheets-config retorna backfill_status quando implementado | Teste manual ou E2E | requests, cronômetro ou assert de timeout |

Cobertura dos ATs do DEFINE:
- AT-LM-001: teste unitário que configure_sheets retorna em &lt; 15 s (mock de create_spreadsheet e backfill); ou teste de integração com job pequeno.
- AT-LM-004, AT-LM-005: teste unitário com mock de run_in_executor verifica que is_digital é chamada no executor.
- AT-LM-006: ultra_batch_processing usa run_in_executor(write_sync) sem await (ou buffer+batch); teste que escrita incremental não bloqueia o stream.
- AT-LM-007: teste que backfill só inclui results com processedAt < config.created_at e que incremental só escreve quando processedAt >= config.created_at; planilha sem duplicação.
- AT-LM-008: teste que em falha do backfill o doc pode ter backfill_status "failed"; reconfigurar é idempotente.

---

## 7. Configuração

- Nenhuma variável de ambiente nova.
- Nenhum recurso GCP novo.
- Firestore: documento `google_sheets_config/{jobId}` já tem `created_at`; pode ganhar `backfill_status` ("pending" | "completed" | "failed") e `backfilled_rows` (number). Results em `ultra_batch_jobs/{jobId}/results` devem ter `processedAt` (já usado no set atual).

---

## Revisão (Build)

- **2026-02-24:** Status atualizado para **Complete (Built)** após implementação. Relatório em `docs/BUILD_REPORT_ULTRA_BATCH_SHEETS_LATENCY_MITIGATION.md`. Próximo passo: /ship.

---

## 8. Referências

- **DEFINE:** `docs/DEFINE_ULTRA_BATCH_SHEETS_LATENCY_MITIGATION.md`
- **Código:** `ai-service/app/api/report.py`, `ai-service/app/services/report_analyzer/google_sheets_service.py`, `ai-service/app/services/digital_whitelist.py`
- **Workflow:** `agents/workflow/design-agent.md`
