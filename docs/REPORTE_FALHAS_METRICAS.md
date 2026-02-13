# Relatório de Falhas – Módulo de Métricas

## Identificação

| Atributo | Valor |
|----------|--------|
| **Escopo** | `app/services/metrics.py` + integrações em `app/api/report.py` e `ultra_batch_processing.py` |
| **Referência** | Define-agent – extração e validação de requisitos |
| **Data** | 2025-02-13 |
| **Status** | ✅ Correção implementada (ver `docs/DESIGN_CORRECAO_METRICAS.md` e `docs/BUILD_REPORT_CORRECAO_METRICAS.md`) |

---

## 1. Falhas Críticas (métricas não contabilizadas)

### F1 – Endpoint `/analyze-personalized-from-data` não registra métrica

| Campo | Valor |
|-------|--------|
| **Arquivo** | `app/api/report.py` linhas 592-630 |
| **Problema** | Fluxo principal de análise personalizada (extract → select fields → analyze from data) não chama `record_metric_call`. |
| **Impacto** | Maioria das análises personalizadas não são contabilizadas. |

---

### F2 – Endpoint `/analyze-personalized-stream` não registra métrica

| Campo | Valor |
|-------|--------|
| **Arquivo** | `app/api/report.py` linhas 549-583 |
| **Problema** | Análise personalizada via streaming não registra `record_metric_call("personalized")`. |
| **Impacto** | Uso via streaming não é contabilizado. |

---

### F3 – Endpoint `/analyze-auto-stream` não registra métrica

| Campo | Valor |
|-------|--------|
| **Arquivo** | `app/api/report.py` linhas 513-546 |
| **Problema** | Análise automática via streaming não chama `record_metric_call("automatica")`. |
| **Impacto** | Uso de análise automática via streaming não é contabilizado. |

---

## 2. Falhas de Consistência (semântica incorreta)

### F4 – `batch-analyze` registra 1 métrica para N arquivos

| Campo | Valor |
|-------|--------|
| **Arquivo** | `app/api/report.py` linhas 176-182 |
| **Problema** | Registra 1 chamada `"automatica"` independente de 2-5 arquivos processados com sucesso. |
| **Impacto** | Subestimação do uso; inconsistência com `analyze-auto` (1 chamada = 1 arquivo). |

---

### F5 – `record_ultra_batch_complete` não persiste status

| Campo | Valor |
|-------|--------|
| **Arquivo** | `app/services/metrics.py` linhas 220-244 |
| **Problema** | Função apenas loga; não atualiza Firestore com status de conclusão/erro do job. |
| **Impacto** | Impossível rastrear jobs ultra-batch concluídos vs. falhados. |

---

## 3. Falhas de Validação (qualidade)

### F6 – `record_metric_call` não valida `metric_type`

| Campo | Valor |
|-------|--------|
| **Arquivo** | `app/services/metrics.py` linhas 29-42 |
| **Problema** | Aceita qualquer string para `metric_type`; docstring diz `'automatica'` ou `'personalized'`. |
| **Impacto** | Risco de poluir schema Firestore com valores inválidos. |

---

### F7 – `_update_daily_total` não valida `metric_type` para ultra_batch

| Campo | Valor |
|-------|--------|
| **Arquivo** | `app/services/metrics.py` linhas 88-126 |
| **Problema** | `_update_daily_total` é chamada apenas com `automatica` ou `personalized`; `record_ultra_batch_start` atualiza `ultra_batch_total_files` em bloco separado. |
| **Impacto** | Inconsistência de fluxo; não há validação centralizada. |

---

## 4. Lacunas (endpoints sem métricas)

### F8 – `/extract` não registra métrica

| Campo | Valor |
|-------|--------|
| **Arquivo** | `app/api/report.py` linhas 125-156 |
| **Problema** | Endpoint de extração não registra uso. |
| **Impacto** | Pode ser intencional (auxiliar); se quiser rastrear extrações, está ausente. |

---

## 5. Resumo Consolidado

| Severidade | Quantidade | IDs |
|------------|------------|-----|
| **CRITICAL** | 3 | F1, F2, F3 (métricas não contabilizadas) |
| **ERROR** | 2 | F4, F5 (inconsistência e persistência incompleta) |
| **WARNING** | 2 | F6, F7 (validação e padronização) |
| **INFO** | 1 | F8 (lacuna potencial) |

---

## 6. Matriz de Cobertura de Métricas

| Endpoint / Fluxo | Modo | Registra métrica? | Tipo |
|------------------|------|-------------------|------|
| `POST /analyze-auto` | auto | Sim | `automatica` |
| `POST /analyze-personalized` | personalized | Sim | `personalized` |
| `POST /extract` | extract_only | Não | — |
| `POST /batch-analyze` | auto | Sim (1x para N arquivos) | `automatica` |
| `POST /ultra-batch-analyze` | auto | Sim (start) | `ultra_batch_start` |
| `POST /analyze-auto-stream` | auto | Não | — |
| `POST /analyze-personalized-stream` | personalized | Não | — |
| `POST /analyze-personalized-from-data` | personalized | Não | — |
| `ultra_batch_processing` (complete) | auto | Parcial (apenas log) | — |

---

## 7. Critérios de Aceitação Recomendados

| ID | Critério | Status |
|----|----------|--------|
| AT-M1 | Todo endpoint que realiza análise (auto ou personalized) registra métrica após sucesso | Violado por F1, F2, F3 |
| AT-M2 | Métricas são consistentes entre endpoints equivalentes (1 análise = 1 registro, ou definição explícita) | Violado por F4 |
| AT-M3 | `record_ultra_batch_complete` persiste status ou documenta que é apenas log | Violado por F5 |
| AT-M4 | `metric_type` é validado contra whitelist antes de persistir | Violado por F6 |

---

## 8. Próximos Passos Recomendados

1. **F1, F2, F3:** Adicionar `record_metric_call` nos três endpoints sem métricas.
2. **F4:** Decidir se batch registra N chamadas (1 por arquivo) ou 1 por batch; documentar e implementar.
3. **F5:** Implementar persistência de status em `record_ultra_batch_complete` ou documentar que é apenas log.
4. **F6:** Adicionar validação `metric_type in ('automatica', 'personalized')` em `record_metric_call`.
5. **F8:** Confirmar se `/extract` deve registrar métrica; se sim, criar tipo `extract` ou reutilizar existente.

---

## 9. Validação (code-reviewer)

| Atributo | Valor |
|----------|--------|
| **Revisor** | code-reviewer (agents/code-quality/code-reviewer.md) |
| **Data da validação** | 2025-02-13 |
| **Código confrontado** | `ai-service/app/api/report.py`, `ai-service/app/services/metrics.py`, `ai-service/app/services/report_analyzer/ultra_batch_processing.py` |

**Conclusão:** O relatório é **coerente** com o código. Todas as falhas F1–F8 estão corretamente descritas e localizadas; números de linha referem-se aos arquivos em `ai-service/` (ex.: `ai-service/app/api/report.py`). Nenhum falso positivo identificado.

**Resumo da checagem:**

| ID | Afirmação | Verificado |
|----|------------|------------|
| F1 | `/analyze-personalized-from-data` não chama `record_metric_call` | Confirmado |
| F2 | `/analyze-personalized-stream` não registra métrica | Confirmado |
| F3 | `/analyze-auto-stream` não registra métrica | Confirmado |
| F4 | `batch-analyze` registra 1 métrica para N arquivos | Confirmado (linhas 177–183) |
| F5 | `record_ultra_batch_complete` apenas loga | Confirmado (metrics.py 220–244) |
| F6 | `record_metric_call` não valida `metric_type` | Confirmado |
| F7 | `_update_daily_total` / ultra_batch em fluxo separado | Confirmado |
| F8 | `/extract` não registra métrica | Confirmado |

**Nota sobre caminhos:** Os caminhos citados nas seções 1–4 (ex.: `app/api/report.py`) correspondem a `ai-service/app/api/report.py` no repositório.
