# DESIGN: Correção do Módulo de Métricas

> Especificação técnica para correção das falhas F1–F8 descritas em `docs/REPORTE_FALHAS_METRICAS.md`.  
> **Input:** REPORTE_FALHAS_METRICAS.md (equivalente a DEFINE para esta correção).  
> **Data:** 2025-02-13  
> **Status:** ✅ Complete (Built)  
> **Próximo passo:** /ship...

---

## 1. Análise de Requisitos

### 1.1 Problema

- **F1–F3 (Crítico):** Três endpoints de análise não registram métrica (`/analyze-personalized-from-data`, `/analyze-personalized-stream`, `/analyze-auto-stream`).
- **F4 (Erro):** `batch-analyze` registra 1 métrica para N arquivos, inconsistente com “1 análise = 1 registro”.
- **F5 (Erro):** `record_ultra_batch_complete` apenas loga; não persiste status no Firestore.
- **F6–F7 (Aviso):** `metric_type` não é validado; risco de poluir schema.
- **F8 (Info):** `/extract` não registra métrica (decisão de produto pendente).

### 1.2 Usuários / Critérios de Sucesso

- **Quem:** Equipe de produto/operações que consome métricas no Firestore.
- **Sucesso:** AT-M1 a AT-M4 do relatório atendidos (métricas contabilizadas, consistentes, ultra_batch com status persistido, `metric_type` validado).

### 1.3 Critérios de Aceitação (do Relatório)

| ID     | Critério |
|--------|----------|
| AT-M1  | Todo endpoint que realiza análise (auto ou personalized) registra métrica após sucesso |
| AT-M2  | Métricas consistentes entre endpoints equivalentes (1 análise = 1 registro ou definição explícita) |
| AT-M3  | `record_ultra_batch_complete` persiste status ou documenta que é apenas log |
| AT-M4  | `metric_type` é validado contra whitelist antes de persistir |

### 1.4 Fora do Escopo

- Nova métrica para `/extract` (F8): não implementar neste design; deixar como decisão de produto. Se for solicitado depois, adicionar tipo `extract` ou reutilizar existente.

---

## 2. Exploração do Codebase

### 2.1 Padrões Identificados

- **Métricas:** `record_metric_call(user_id, metric_type)` chamado após `result.get("error") is None` em `analyze_report_auto` e `analyze_report_personalized`; try/except com `logger.error` para não bloquear o fluxo.
- **Firestore:** `metrics/{date}/users/{userId}` com campos `automatica`, `personalized`, `ultra_batch_runs` (array de `{ jobId, file_count }`); `metrics/{date}/total/total` com totais do dia.
- **Streaming:** Endpoints stream usam `event_generator()` com `app.ainvoke(state)`; resultado disponível após o yield do evento final.

### 2.2 Pontos de Integração

| Arquivo | Função / Trecho | Uso |
|---------|------------------|-----|
| `ai-service/app/api/report.py` | Endpoints F1, F2, F3, F4 | Inserir/ajustar chamadas a `record_metric_call` |
| `ai-service/app/services/metrics.py` | `record_metric_call`, `record_ultra_batch_complete`, `_update_daily_total` | Validação + persistência de status |
| `ai-service/app/services/report_analyzer/ultra_batch_processing.py` | Chamada a `record_ultra_batch_complete` | Sem alteração de assinatura; comportamento da função muda |

---

## 3. Arquitetura da Solução

### 3.1 Visão Geral

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FLUXO DE MÉTRICAS (APÓS CORREÇÃO)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Endpoints de análise                                                        │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────┐  │
│  │ /analyze-auto-stream  │  │ /analyze-personalized-│  │ /analyze-persona-│  │
│  │ /analyze-personalized-│  │ stream                │  │ lized-from-data  │  │
│  │ stream (F3)           │  │ (F2)                  │  │ (F1)             │  │
│  └──────────┬───────────┘  └──────────┬────────────┘  └────────┬─────────┘  │
│             │                         │                        │            │
│             └─────────────────────────┼────────────────────────┘            │
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  record_metric_call(user_id, metric_type)  [F6: validação whitelist] │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                      │
│  /batch-analyze (F4) ────────────────┤                                      │
│  N sucessos → N chamadas             │                                      │
│                                      ▼                                      │
│  ┌─────────────────────┐     ┌──────────────────────────────────────────┐   │
│  │ _update_daily_total │     │ Firestore: metrics/{date}/users/{userId}  │   │
│  │ (total do dia)      │     │ + metrics/{date}/total/total             │   │
│  └─────────────────────┘     └──────────────────────────────────────────┘   │
│                                                                             │
│  Ultra-batch                                                                │
│  ┌─────────────────────────────────┐                                        │
│  │ record_ultra_batch_complete (F5) │ ──► Persistir status no doc do user   │
│  │ user_id, job_id, date           │     (ultra_batch_runs[i].status)       │
│  └─────────────────────────────────┘                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Decisões de Arquitetura

#### Decisão: Validação de metric_type na entrada

| Atributo | Valor |
|----------|--------|
| **Status** | Aceita |
| **Data**   | 2025-02-13 |

**Contexto:** `record_metric_call` aceita qualquer string; docstring restringe a `'automatica'` e `'personalized'`. Risco de poluir o schema no Firestore.

**Escolha:** Validar no início de `record_metric_call`: se `metric_type not in ('automatica', 'personalized')`, logar warning e retornar sem persistir.

**Rationale:** Um único ponto de validação (single source of truth); evita campos inválidos no Firestore sem alterar assinaturas dos endpoints.

**Alternativas rejeitadas:**  
1. Validar em cada endpoint — duplicação e risco de esquecimento.  
2. Enum no tipo — exigiria mudança em todos os chamadores; whitelist é suficiente.

**Consequências:** Chamadas com tipo inválido deixam de ser persistidas (comportamento desejado).

---

#### Decisão: Batch-analyze — 1 métrica por arquivo com sucesso

| Atributo | Valor |
|----------|--------|
| **Status** | Aceita |
| **Data**   | 2025-02-13 |

**Contexto:** Hoje `batch-analyze` registra 1 chamada para N arquivos; `/analyze-auto` registra 1 por arquivo. Inconsistência (AT-M2).

**Escolha:** Registrar uma chamada `record_metric_call(user_id, "automatica")` por arquivo processado com sucesso (dentro do loop ou em loop dedicado, `success_count` vezes).

**Rationale:** Alinhamento com “1 análise = 1 registro” e com o comportamento de `/analyze-auto`.

**Alternativas rejeitadas:**  
1. Manter 1 por batch — subestima uso e viola AT-M2.  
2. Novo tipo `batch` — aumenta complexidade do schema e dos relatórios.

**Consequências:** Aumento de writes no Firestore por request (até 5 por batch); transações já existentes por chamada; impacto aceitável.

---

#### Decisão: record_ultra_batch_complete persiste status no Firestore

| Atributo | Valor |
|----------|--------|
| **Status** | Aceita |
| **Data**   | 2025-02-13 |

**Contexto:** `record_ultra_batch_complete` só loga; não é possível distinguir jobs concluídos de falhados no documento de métricas (AT-M3).

**Escolha:** Persistir no documento do usuário em `metrics/{date}/users/{userId}`: localizar a entrada do array `ultra_batch_runs` com `jobId` igual a `job_id` e atualizar (ou acrescentar) os campos `status: "completed"` e `completedAt: SERVER_TIMESTAMP`. Se a entrada não existir, logar e não falhar.

**Rationale:** Reutiliza estrutura existente; permite relatórios por status; não exige nova coleção.

**Alternativas rejeitadas:**  
1. Manter só log — não atende AT-M3.  
2. Novo documento por job em outra coleção — mais complexidade e mais leituras para agregar.

**Consequências:** Escrita adicional no mesmo documento do usuário; atualização de um elemento do array em transação.

---

#### Decisão: Não implementar métrica para /extract (F8)

| Atributo | Valor |
|----------|--------|
| **Status** | Aceita |
| **Data**   | 2025-02-13 |

**Contexto:** Relatório classifica F8 como INFO; não está claro se extração deve ser contabilizada.

**Escolha:** Não adicionar `record_metric_call` em `/extract` neste escopo. Documentar como lacuna conhecida e decisão de produto pendente.

**Rationale:** Evita scope creep; quando houver decisão, pode-se adicionar tipo `extract` ou reutilizar existente.

---

## 4. Manifest de Arquivos

| # | Arquivo | Ação | Propósito | Dependências | Agente sugerido |
|---|---------|------|-----------|--------------|-----------------|
| 1 | `ai-service/app/services/metrics.py` | Alterar | F6: validação de `metric_type`; F5: persistência de status em `record_ultra_batch_complete` | Nenhuma | python-developer |
| 2 | `ai-service/app/api/report.py` | Alterar | F1: métrica em `analyze_personalized_from_data`; F2: métrica em `analyze_report_personalized_stream`; F3: métrica em `analyze_report_auto_stream`; F4: N chamadas em `batch_analyze_reports` | metrics | python-developer |
| 3 | `ai-service/app/services/report_analyzer/tests/test_metrics.py` (ou equivalente) | Criar | Testes unitários para `record_metric_call` (validação) e `record_ultra_batch_complete` (persistência) | metrics, pytest | test-generator |

**Nota:** `ultra_batch_processing.py` não entra no manifest; apenas consome `record_ultra_batch_complete` com a mesma assinatura.

---

## 5. Especificação por Falha

### F1 – `/analyze-personalized-from-data`

- **Onde:** `app/api/report.py`, após `result = await app.ainvoke(state)` e antes do `return`.
- **O quê:** Se `result.get("error") is None`, chamar `record_metric_call(request.user_id, "personalized")` dentro de try/except (padrão dos outros endpoints).

### F2 – `/analyze-personalized-stream`

- **Onde:** Dentro de `event_generator()`, após `result = await app.ainvoke(state)` e antes de `yield f"data: {json.dumps({'done': True, 'result': result})}\n\n"`.
- **O quê:** Se `result.get("error") is None`, chamar `record_metric_call(request.user_id, "personalized")` em try/except.

### F3 – `/analyze-auto-stream`

- **Onde:** Idem F2, no endpoint `analyze_report_auto_stream`.
- **O quê:** Se `result.get("error") is None`, chamar `record_metric_call(request.user_id, "automatica")` em try/except.

### F4 – `batch-analyze`

- **Onde:** `app/api/report.py`, bloco que hoje faz uma única `record_metric_call` após `success_count > 0`.
- **O quê:** Substituir por um loop: para cada um dos `success_count` sucessos, chamar `record_metric_call(request.user_id, "automatica")` (cada chamada em try/except para não falhar as demais).

### F5 – `record_ultra_batch_complete`

- **Onde:** `app/services/metrics.py`, corpo da função.
- **O quê:**  
  1. Obter `doc_ref = metrics/{date}/users/{userId}`.  
  2. Em transação: ler documento, localizar em `ultra_batch_runs` o item com `jobId == job_id`, atualizar esse elemento para incluir `status: "completed"` e `completedAt: firestore.SERVER_TIMESTAMP`. Se não encontrar, logar warning e sair.  
  3. Manter log de sucesso existente.

### F6 – Validação de `metric_type`

- **Onde:** Início de `record_metric_call` em `app/services/metrics.py`.
- **O quê:**  
  ```python
  ALLOWED_METRIC_TYPES = ("automatica", "personalized")
  if metric_type not in ALLOWED_METRIC_TYPES:
      logger.warning(f"metric_type inválido ignorado: {metric_type!r}. Esperado: {ALLOWED_METRIC_TYPES}")
      return
  ```

### F7

- **Onde:** Nenhuma alteração de código.
- **O quê:** Validação centralizada em F6 protege `_update_daily_total` (só chamada com tipos válidos). Documentar no código que `_update_daily_total` assume `metric_type` já validado.

---

## 6. Padrões de Código

### 6.1 Registro de métrica após sucesso (endpoints)

```python
# Padrão: após result = await app.ainvoke(state)
if result.get("error") is None:
    try:
        record_metric_call(request.user_id, "automatica")  # ou "personalized"
    except Exception as e:
        logger.error(f"Erro ao registrar métrica: {e}")
```

### 6.2 Batch: N chamadas por N sucessos

```python
# Após results = await process_batch_reports(...)
success_count = sum(1 for r in results if r.get("success"))
for _ in range(success_count):
    try:
        record_metric_call(request.user_id, "automatica")
    except Exception as e:
        logger.error(f"Erro ao registrar métrica analise_automatica: {e}")
```

### 6.3 record_ultra_batch_complete — atualizar entrada no array

```python
# Dentro da transação, após doc = doc_ref.get(transaction=transaction)
runs = list(doc.get("ultra_batch_runs") or [])
for i, run in enumerate(runs):
    if run.get("jobId") == job_id:
        runs[i] = {**run, "status": "completed", "completedAt": firestore.SERVER_TIMESTAMP}
        transaction.update(doc_ref, {"ultra_batch_runs": runs, "last_updated": firestore.SERVER_TIMESTAMP, "date": date_str})
        return
logger.warning(f"Job {job_id} não encontrado em ultra_batch_runs para user {user_id}")
```

---

## 7. Estratégia de Testes

| Tipo | Escopo | Arquivos | Ferramentas |
|------|--------|----------|-------------|
| Unitário | `record_metric_call`: rejeição de `metric_type` inválido | `test_metrics.py` | pytest, mock de Firestore/get_firestore_client |
| Unitário | `record_ultra_batch_complete`: atualização do array quando job existe | `test_metrics.py` | pytest, mock de Firestore |
| Integração (opcional) | Endpoints F1–F3 retornam 200 e chamam métrica (mock) | `test_report_endpoints.py` ou existente | pytest, TestClient |

- **AT-M1:** Coberto por testes dos endpoints que passam a registrar métrica (F1–F3) e por revisão de código.  
- **AT-M2:** Coberto por teste de batch (F4) verificando N chamadas para N sucessos.  
- **AT-M3:** Coberto por teste unitário de `record_ultra_batch_complete` com assert de escrita no doc.  
- **AT-M4:** Coberto por teste unitário de `record_metric_call` com `metric_type` inválido (não persiste).

---

## 8. Checklist de Qualidade (Design Agent)

- [x] Diagrama ASCII de arquitetura
- [x] Pelo menos uma decisão com rationale completo (várias)
- [x] Manifest completo de arquivos
- [x] Padrões de código sintaticamente corretos
- [x] Estratégia de testes alinhada aos critérios de aceitação
- [x] Configuração: sem novos configs; whitelist de tipos pode ser constante no código

---

## 9. Resumo de Implementação (Ordem Sugerida)

1. **metrics.py:** Constante `ALLOWED_METRIC_TYPES` + validação em `record_metric_call` (F6).  
2. **metrics.py:** Persistência de status em `record_ultra_batch_complete` (F5).  
3. **report.py:** Inserir métrica em `analyze_personalized_from_data` (F1).  
4. **report.py:** Inserir métrica em `analyze_report_personalized_stream` (F2).  
5. **report.py:** Inserir métrica em `analyze_report_auto_stream` (F3).  
6. **report.py:** Alterar batch para N chamadas (F4).  
7. **Testes:** Criar/estender testes para métricas (validação e ultra_batch_complete).

---

## 10. Melhorias pós-correção e estrutura Firestore

### 10.1 Melhorias após a correção

| Área | Antes | Depois |
|------|--------|--------|
| **Cobertura** | Só `/analyze-auto` e `/analyze-personalized` (e 1x por batch) registravam métrica. | Todos os fluxos de análise registram: stream auto, stream personalized, analyze-from-data, batch (N por N arquivos), ultra-batch (start + complete). |
| **Consistência** | 1 métrica por batch independente de 2–5 arquivos. | 1 registro = 1 análise (batch gera N registros para N sucessos). |
| **Rastreabilidade** | Ultra-batch só iniciava; conclusão só em log. | Ultra-batch persiste status `completed` (e `completedAt`) no documento do usuário. |
| **Qualidade dos dados** | `metric_type` arbitrário podia poluir o schema. | Apenas `automatica` e `personalized` são persistidos; inválidos são ignorados com log. |

**Resumo:** Métricas passam a refletir o uso real (AT-M1, AT-M2), jobs ultra-batch ficam rastreáveis (AT-M3) e o schema permanece limpo (AT-M4).

### 10.2 Estrutura final do Firestore

A hierarquia e os campos permanecem os mesmos; apenas o conteúdo de `ultra_batch_runs` ganha campos opcionais.

**Coleção:** `metrics`  
**Documentos por dia:** `{date}` (formato `YYYY-MM-DD`, ex.: `2025-02-13`).

```
metrics (collection)
└── {date} (document, ex.: "2025-02-13")
    ├── users (subcollection)
    │   └── {userId} (document)
    │       ├── automatica: number          // análises automáticas no dia
    │       ├── personalized: number       // análises personalizadas no dia
    │       ├── ultra_batch_runs: array    // jobs ultra-batch do usuário no dia
    │       ├── last_updated: timestamp
    │       └── date: string (YYYY-MM-DD)
    │
    └── total (subcollection)
        └── total (document)
            ├── automatica: number         // total do dia (todos os usuários)
            ├── personalized: number
            ├── ultra_batch_total_files: number
            ├── last_updated: timestamp
            └── date: string (YYYY-MM-DD)
```

**Formato de cada elemento de `ultra_batch_runs` (após correção F5):**

```ts
{
  jobId: string,
  file_count: number,
  status?: "completed",           // presente após record_ultra_batch_complete
  completedAt?: Timestamp         // presente quando status === "completed"
}
```

- Entradas antigas podem ter só `jobId` e `file_count`.
- Novas conclusões passam a ter `status` e `completedAt`.

### 10.3 Compatibilidade com tela de métricas

A estrutura está **compatível para exibir uma tela de métricas** com as seguintes capacidades:

| O que exibir | Fonte | Observação |
|--------------|--------|------------|
| **Totais do dia (plataforma)** | `metrics/{date}/total/total` | Um documento: `automatica`, `personalized`, `ultra_batch_total_files`. Ideal para card "Hoje" ou resumo global. |
| **Uso por usuário no dia** | `metrics/{date}/users/{userId}` | Por usuário: `automatica`, `personalized`, quantidade de jobs em `ultra_batch_runs`. Suporta lista "Top usuários" ou detalhe por usuário. |
| **Histórico por período** | Múltiplos `metrics/{date}` | Um doc por dia; para gráfico de tendência (ex.: últimos 7/30 dias) é preciso ler N documentos. |
| **Jobs ultra-batch (concluídos)** | `ultra_batch_runs` com `status === "completed"` | Listar jobs concluídos por usuário/dia; opcionalmente filtrar por `completedAt`. |
| **Jobs ultra-batch (em andamento)** | Entradas em `ultra_batch_runs` sem `status` | "Em andamento" = existe entrada sem `status`. |

**Limitações atuais (não bloqueiam uma primeira tela):**

1. **Período arbitrário:** Não há documento agregado "mês" ou "semana"; para períodos customizados a app precisa somar os documentos dos dias (várias leituras).
2. **Status "failed" em métricas:** Jobs que falham são atualizados em `ultra_batch_jobs/{jobId}`, mas o doc em `metrics/.../users/{userId}` hoje só é atualizado com `completed`. Para mostrar "X jobs falharam" na tela seria necessário também atualizar `ultra_batch_runs` com `status: "failed"` (extensão futura) ou cruzar com `ultra_batch_jobs`.
3. **Extração (/extract):** Continua sem métrica (F8 fora do escopo); se no futuro quiser "extrações no dia", será preciso novo tipo ou campo.

**Conclusão:** Com a correção, a estrutura do Firestore está **compatível para uma tela de métricas** que mostre totais do dia, uso por usuário, tendência diária e lista de jobs ultra-batch concluídos. Para períodos longos ou "falhas" em métricas, pequenas extensões podem ser feitas depois sem quebrar o que existe.

---

**Próximo passo:** /ship... Implementação concluída. Ver `docs/BUILD_REPORT_CORRECAO_METRICAS.md`.
