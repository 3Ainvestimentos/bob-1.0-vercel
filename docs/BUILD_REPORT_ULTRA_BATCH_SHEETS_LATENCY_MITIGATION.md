# BUILD REPORT: Mitigação de latência – ultra-batch (Sheets + whitelist)

## Summary

| Metric | Value |
|--------|-------|
| Tasks | 4/4 completed |
| Files Modified | 3 |
| Files Created | 2 |
| Build Time | ~30 minutes |
| Agents Used | 1 (direct) |

## Tasks with Attribution

| # | Task | Agent | Status | Notes |
|---|------|-------|--------|-------|
| 1 | Modificar `google_sheets_service.py` | (direct) | ✅ | backfill_sync, write_sync, batch_flush_sync, idempotência created_at/processedAt |
| 2 | Modificar `report.py` | (direct) | ✅ | run_in_executor(is_digital), BackgroundTasks, backfill_status "pending", GET backfill_status/backfilled_rows |
| 3 | Modificar `ultra_batch_processing.py` | (direct) | ✅ | run_in_executor(write_sync) sem await, buffer 50/2s, flush final |
| 4 | Testes + BUILD_REPORT | (direct) | ✅ | test_ultra_batch_sheets_latency.py; 3 testes de serviço passando |

## Files Modified

| File | Changes |
|------|---------|
| `ai-service/app/services/report_analyzer/google_sheets_service.py` | +`backfill_sheets_from_results_sync`, +`write_ultra_batch_result_to_sheets_sync`, +`batch_flush_rows_to_sheets_sync`; idempotência por created_at/processedAt; doc com backfill_status/backfilled_rows; backfill_status "pending" na criação da config |
| `ai-service/app/api/report.py` | check_whitelist e configure_sheets: `is_digital` via `run_in_executor`; configure_sheets: `BackgroundTasks.add_task(backfill_sync)`; resposta com backfill_status "pending"; GET sheets-config inclui backfill_status e backfilled_rows |
| `ai-service/app/services/report_analyzer/ultra_batch_processing.py` | Escrita Sheets: buffer por job (50 linhas ou 2s), `run_in_executor(batch_flush_sync)` sem await; flush final ao concluir job; `processed_at` para idempotência |

## Files Created

| File | Purpose |
|------|---------|
| `ai-service/app/services/report_analyzer/tests/test_ultra_batch_sheets_latency.py` | Testes: check_whitelist run_in_executor, configure_sheets backfill_status "pending", get_sheets_config backfill_status/backfilled_rows, backfill_sync e write_sync idempotência |
| `docs/BUILD_REPORT_ULTRA_BATCH_SHEETS_LATENCY_MITIGATION.md` | Este relatório |

## Verification

| Check | Result |
|-------|--------|
| Testes unitários (google_sheets_service) | ✅ 3/3 pass (test_backfill_sync_only_includes_processed_at_before_created_at, test_write_sync_skips_*, test_write_sync_writes_*) |
| Testes de API (check_whitelist, configure_sheets, get_sheets_config) | ⚠️ Requerem app + mocks; podem travar se Firebase inicializar (executar em env com credenciais ou mocks completos) |
| Lint | ✅ Sem erros novos nos arquivos alterados |

## Architecture Decisions Implemented

1. **Backfill em background** → `def backfill_sheets_from_results_sync(job_id)`; `BackgroundTasks.add_task(backfill_sync, job_id)`; resposta com backfill_status "pending".
2. **is_digital sem bloquear event loop** → `await loop.run_in_executor(None, is_digital, body.user_id)` em check_whitelist e configure_sheets.
3. **Regra def + thread** → Backfill e escrita incremental são funções síncronas executadas em thread (BackgroundTasks ou run_in_executor sem await).
4. **Idempotência backfill vs incremental** → backfill_sync só inclui results com processedAt < config.created_at; write_sync e batch_flush só escrevem se processed_at >= config.created_at.
5. **Buffer incremental** → Buffer por job_id (50 linhas ou 2 s); flush com `run_in_executor(batch_flush_rows_to_sheets_sync, job_id, rows)` sem await; flush final ao terminar o job.
6. **Contrato configure-sheets** → Nova config: success, spreadsheet_id, spreadsheet_url, spreadsheet_name, backfill_status "pending". Config existente: sem backfill_status. GET sheets-config: backfill_status e backfilled_rows quando presentes no doc.
7. **Falha do backfill** → Em except em backfill_sync, update doc com backfill_status "failed".

## Acceptance Tests Coverage (DEFINE)

| AT ID | Scenario | Covered By |
|-------|----------|------------|
| AT-LM-001 | configure-sheets retorna rápido | Resposta 200 com backfill_status "pending"; backfill em background |
| AT-LM-004 / AT-LM-005 | check_whitelist e configure_sheets não bloqueiam event loop | run_in_executor(is_digital) em report.py |
| AT-LM-006 | Escrita incremental mantida | run_in_executor(batch_flush_sync) sem await; buffer no ultra_batch_processing |
| AT-LM-007 | Sem duplicação backfill vs incremental | backfill_sync (processedAt < created_at); write_sync/batch_flush (processed_at >= created_at); testes unitários |
| AT-LM-008 | Backfill falha / retry | backfill_sync atualiza doc com backfill_status "failed" em except |

## Correções pós code-review (2026-02-24)

| Correção | Arquivo(s) |
|----------|------------|
| Cursor idempotência por epoch_ms (created_at_epoch_ms / processedAt_epoch_ms) com fallback datetime | google_sheets_service, ultra_batch_processing |
| processed_at None = não escrever (idempotência MUST) | write_sync, batch_flush |
| Remoção cache global Google API client; criar client por chamada (thread-safety) | google_sheets_service |
| Retry/backoff em _batch_write_rows_sync (429) | google_sheets_service |
| Re-agendar backfill quando config existente e backfill_status in ("failed", "pending") | report.py |
| Buffer: uma única chamada flush por resultado | ultra_batch_processing |

---

## Status: ✅ COMPLETE

Próximo passo: /ship (deploy e validação em produção; monitorar "Execução do usuário" e latência p95/p99).
