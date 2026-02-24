# Code Review Report – Mitigação de latência ultra-batch (Sheets + whitelist)

**Reviewer:** code-reviewer  
**Arquivos:** 4 arquivos (3 .py modificados, 1 .py novo)  
**Confidence:** 0.92  

---

## Summary

| Severity  | Count |
|-----------|-------|
| CRITICAL  | 0     |
| ERROR     | 0     |
| WARNING   | 2     |
| INFO      | 4     |

---

## Scope

- **Modificados:** `ai-service/app/api/report.py`, `ai-service/app/services/report_analyzer/google_sheets_service.py`, `ai-service/app/services/report_analyzer/ultra_batch_processing.py`
- **Novo:** `ai-service/app/services/report_analyzer/tests/test_ultra_batch_sheets_latency.py`
- **Padrões conferidos:** Tratamento de erro (try/except específico, retry 429), tipagem (Optional, list), uso de constantes (SHEETS_BUFFER_*), sem segredos em log

---

## Critical Issues

*Nenhum.*

---

## Errors

*Nenhum.*

---

## Warnings

### [W1] Docstring de `batch_flush_rows_to_sheets_sync` imprecisa

**Arquivo:** `google_sheets_service.py` (docstring da função, ~L264–266)

**Problema:** A docstring diz “fallback datetime se epoch ausente” e “Se created_at existe e epoch é None, não inclui a linha”. Na prática, quando `created_at_epoch_ms` é `None` (config antiga), **todas** as linhas do buffer são incluídas (não há comparação por datetime). O comportamento está correto para compatibilidade com configs antigas; apenas a descrição está enganosa.

**Sugestão:** Ajustar a docstring para refletir o comportamento real.

```python
"""
Escreve um lote de linhas (account, message, processed_at_epoch_ms) na planilha do job.
Filtra por processed_at_epoch_ms >= config.created_at_epoch_ms quando created_at_epoch_ms existe.
Quando created_at_epoch_ms é None (config antiga), inclui todas as linhas do buffer.
"""
```

---

### [W2] Acesso direto a `config["spreadsheet_id"]` pode gerar KeyError

**Arquivo:** `google_sheets_service.py` (várias funções)

**Problema:** Uso de `config["spreadsheet_id"]` e `config["spreadsheet_id"]` em `write_ultra_batch_result_to_sheets_sync`, `batch_flush_rows_to_sheets_sync` e `backfill_sheets_from_results_sync`. Se o documento no Firestore estiver corrompido ou incompleto, isso gera `KeyError` em vez de falha controlada.

**Impacto:** Baixo (config é escrita pelo próprio serviço e sempre inclui esses campos).

**Sugestão (opcional):** Tratar ausência de campo e sair cedo.

```python
spreadsheet_id = config.get("spreadsheet_id")
if not spreadsheet_id:
    return
```

---

## Info (opcionais)

### [I1] Constante para backoff de retry

**Arquivo:** `google_sheets_service.py`

**Sugestão:** Extrair o backoff para constante ou função para evitar repetição (ex.: `wait = 2 ** (attempt + 1)` em 3 pontos). Ex.: `RETRY_BACKOFF_BASE = 2` e `wait = RETRY_BACKOFF_BASE ** (attempt + 1)`.

---

### [I2] Teste com `asyncio.coroutine` deprecated

**Arquivo:** `test_ultra_batch_sheets_latency.py` (L84)

**Código:** `loop.run_in_executor = MagicMock(return_value=asyncio.coroutine(lambda: True)())`

**Sugestão:** Em Python 3.11+, `asyncio.coroutine` está deprecated. Preferir `fut = asyncio.Future(); fut.set_result(True)` (como nos outros testes do mesmo arquivo) para consistência e para evitar deprecation warnings.

---

### [I3] Defensive check em `config_doc.to_dict()`

**Arquivo:** `google_sheets_service.py` (todas as funções que fazem `config = config_doc.to_dict()`)

**Sugestão:** Se em algum edge case `to_dict()` retornar `None`, `config.get(...)` quebra. Para maior robustez: `config = config_doc.to_dict() or {}` (ou `if not config: return` após atribuição).

---

### [I4] Cobertura de testes para epoch_ms

**Arquivo:** `test_ultra_batch_sheets_latency.py`

**Observação:** Os testes atuais cobrem o fallback por datetime (config sem `created_at_epoch_ms`). Não há teste explícito do caminho com `created_at_epoch_ms` / `processedAt_epoch_ms`. Opcional: adicionar um teste que use mocks com `created_at_epoch_ms` e `processedAt_epoch_ms` para validar o caminho principal (epoch) e o critério de idempotência.

---

## Positive Observations

- **Segurança:** Nenhum segredo em log; `job_id` e identificadores internos são aceitáveis.
- **Idempotência:** Uso de `created_at_epoch_ms` / `processedAt_epoch_ms` com fallback para datetime está consistente e evita clock skew.
- **Thread-safety:** Remoção do cache global e criação do client Google por chamada eliminam risco de compartilhar instância entre threads.
- **Retry:** `_write_row_sync` e `_batch_write_rows_sync` com retry em 429 e backoff exponencial.
- **Tratamento de falha:** Backfill atualiza `backfill_status: "failed"` em `except`; re-agendamento quando config existente tem status `failed`/`pending`.
- **Single responsibility:** Funções de escrita e de idempotência bem separadas; buffer com uma única chamada de flush por resultado.
- **Testes:** Cenários de idempotência (backfill e write_sync) cobertos com mocks; imports e path para `main` ajustados para execução a partir do ai-service.

---

## Checklist de qualidade (code-reviewer)

| Item                         | Status |
|-----------------------------|--------|
| Arquivos modificados lidos  | Sim    |
| Contexto completo (não só diff) | Sim |
| Severidade correta          | Sim    |
| Toda issue com correção sugerida | Sim |
| Tom construtivo             | Sim    |
| Boas práticas destacadas    | Sim    |

---

## Decision

**Confidence 0.92 >= 0.90** → Relatório executado. Nenhum bloqueio para merge; W1 e W2 são melhorias recomendadas; itens INFO são opcionais.

---

## Ações aplicadas pós-review

- **[W1]** Docstring de `batch_flush_rows_to_sheets_sync` ajustada para descrever o comportamento real (config antiga = incluir todas as linhas).
- **[I2]** Teste `test_configure_sheets_existing_config_returns_without_backfill_status` atualizado para usar `asyncio.Future()` em vez de `asyncio.coroutine` (deprecated).
