# DEFINE: Mitigação de latência – ultra-batch (Sheets + whitelist)

> Requisitos extraídos a partir da análise de métricas do ai-service e do plano mínimo de mitigação: garantir que a feature whitelist digital + Google Sheets no Shared Drive não agrave a latência já elevada nos picos de uso.

| Atributo | Valor |
|----------|--------|
| **Feature** | Mitigação de latência para ultra-batch (Sheets + whitelist) |
| **Fase** | 1 – Define |
| **Input** | Análise de métricas (Cloud Run), revisão de código ai-service, plano mínimo discutido |
| **Status** | ✅ Complete (Built) |
| **Próximo passo** | /ship — deploy e validação em produção |

---

## 1. Problem Statement

O ai-service já apresenta latência elevada nos picos de uso (“Execução do usuário” como principal componente; p99 até ~100 min em dias intensos), com poucas requisições simultâneas (~10). A nova feature (whitelist digital, Google Sheets no Shared Drive, backfill) introduz trabalho síncrono do ponto de vista do cliente no endpoint `POST /ultra-batch/configure-sheets` (criação de planilha + backfill completo na mesma resposta) e chamadas síncronas à whitelist (`is_digital`) no event loop. Isso pode aumentar fila e latência percebida nos picos; é necessário um plano mínimo de mitigação sem nova infraestrutura.

---

## 2. Target Users

| User | Role | Pain Point |
|------|------|------------|
| Usuário final (digital) | Configura Sheets após ultra lote | Resposta lenta ao clicar “Configurar Sheets” quando o job tem muitos resultados; risco de timeout ou abandono |
| Operações / SRE | Estabilidade do ai-service | Latência já alta nos picos; nova feature não pode piorar “Execução do usuário” e tempo de fila |
| Equipe de produto | Experiência e adoção | Degradação em horário de pico afeta todos os usuários do report_analyzer, não só quem usa Sheets |

---

## 3. Goals (plano mínimo)

| Priority | Goal |
|----------|------|
| **MUST** | Endpoint `POST /ultra-batch/configure-sheets` retornar resposta HTTP em tempo aceitável (&lt; 15 s no p95), sem esperar o backfill; backfill executado em background via **função síncrona** em thread (ex.: `BackgroundTasks.add_task(backfill_sync, job_id)`), nunca `async def` com I/O sync dentro rodando no event loop |
| **MUST** | Verificação de whitelist (`is_digital`) nos handlers não bloquear o event loop: executar em thread (ex.: `run_in_executor(None, is_digital, uid)`) |
| **MUST** | **Regra de background tasks:** tarefa que faz I/O pesado ou chamadas sync = **`def`** + execução em thread (`BackgroundTasks` onde há request handler, ou `run_in_executor` sem await onde não há); **nunca** `async def` com sync dentro rodando no loop |
| **SHOULD** | Escrita incremental por resultado no Sheets: função **síncrona** (`def`) executada com `run_in_executor(..., write_sync, ...)` **sem await** no generator do ultra-batch; assim o event loop não é bloqueado |
| **SHOULD** | Escrita incremental em **batch/buffer** (ex.: acumular N linhas ou a cada T segundos e escrever em lote) para não saturar o thread pool em jobs grandes (até 100 resultados por job) |
| **MUST** | **Idempotência backfill vs incremental:** backfill não deve duplicar linhas já escritas pelo incremental. Usar `config.created_at` como cursor: backfill escreve apenas resultados com `processedAt < config.created_at`; incremental escreve apenas resultados com `processedAt >= config.created_at` |
| **COULD** | Expor status de backfill (“pending” / “completed” / “failed”) via `GET /ultra-batch/sheets-config/{job_id}`; reconfigurar (configure-sheets de novo) é idempotente e re-agenda backfill |
| **COULD** | Monitorar após deploy: “Execução do usuário”, p99/p50 de latência e concorrência nos horários de pico (12h–17h UTC-3) |

---

## 4. Success Criteria

- [ ] `POST /ultra-batch/configure-sheets` retorna em &lt; 15 s no p95 (apenas criação de planilha + persistência de config; backfill não incluído no tempo de resposta).
- [ ] Backfill de resultados já processados é executado em background; a planilha fica disponível imediatamente (com headers); dados retroativos aparecem em até alguns minutos conforme o backfill termina.
- [ ] Chamadas a `is_digital` nos endpoints `check-whitelist` e `configure-sheets` não bloqueiam o event loop (medição ou revisão de código confirma uso de executor ou equivalente).
- [ ] Comportamento funcional existente preservado: usuário na whitelist continua recebendo link da planilha e dados preenchidos (incremental durante o job + backfill após configurar).
- [ ] Planilha sem linhas duplicadas: backfill e incremental não escrevem o mesmo resultado (partição por config.created_at / processedAt).
- [ ] Em falha do backfill: doc pode ser atualizado com backfill_status "failed"; usuário pode reconfigurar para re-agendar.

---

## 5. Acceptance Tests

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| AT-LM-001 | configure-sheets retorna rápido | Job com N resultados já em `ultra_batch_jobs/{jobId}/results` | Cliente chama `POST /ultra-batch/configure-sheets` | Resposta HTTP 200 em &lt; 15 s com `spreadsheet_id`, `spreadsheet_url`; backfill pode ainda estar rodando em background |
| AT-LM-002 | Backfill em background | Config de Sheets salva, backfill enfileirado | Após resposta do configure-sheets | Em até X minutos (ex.: 2–5), a planilha contém as linhas correspondentes aos resultados já existentes no Firestore |
| AT-LM-003 | Planilha usável logo após resposta | configure-sheets retornou com sucesso | Usuário abre `spreadsheet_url` | Planilha existe, tem headers (account number, final_message); linhas de backfill podem aparecer progressivamente |
| AT-LM-004 | check-whitelist não bloqueia event loop | Servidor sob carga, cache da whitelist cold | Várias requisições simultâneas a `POST /ultra-batch/check-whitelist` | Respostas entregues sem bloquear outras requisições (event loop não bloqueado por Firestore síncrono; implementação usa executor ou async) |
| AT-LM-005 | configure-sheets com is_digital não bloqueia | Requisição a configure-sheets | Handler chama is_digital e depois create_spreadsheet + backfill em background | is_digital executada em executor ou equivalente; tempo de resposta dominado por criação de planilha, não por whitelist |
| AT-LM-006 | Escrita incremental mantida | Job em processamento com Sheets configurado | Cada resultado é gravado | Função **sync** de escrita é executada com `run_in_executor` **sem await** (ou em batch); novas linhas aparecem na planilha sem bloquear o stream SSE nem o event loop |
| AT-LM-007 | Sem duplicação backfill vs incremental | Usuário configurou Sheets durante o job; backfill e incremental escrevem | Backfill e incremental rodam | Planilha contém cada resultado no máximo uma vez (backfill só results com processedAt &lt; config.created_at; incremental só processedAt ≥ config.created_at) |
| AT-LM-008 | Backfill falha / retry | Backfill em background falhou (ex.: rate limit) ou processo morreu | Usuário chama configure-sheets de novo (config já existe) | Comportamento idempotente; backfill pode ser re-agendado; opcional backfill_status "failed" no doc |

---

## 6. Out of Scope

- Aumentar número de instâncias ou mudar configuração de auto-scaling do Cloud Run (mitigação apenas no código).
- Refatorar todo o fluxo ultra-batch para filas (Pub/Sub, Cloud Tasks); backfill e escrita em background via **funções sync em thread** (BackgroundTasks ou run_in_executor) no mesmo processo.
- Reduzir latência de “Execução do usuário” de fluxos já existentes (ex.: análise por relatório); foco é não adicionar carga síncrona nova.
- Migrar whitelist para cliente Firestore assíncrono ou outro serviço; suficiente executar `is_digital` em thread/executor.
- Garantir SLA absoluto de tempo de backfill (ex.: &lt; 1 min); “em até poucos minutos” é aceitável.

---

## 7. Constraints

- **Sem nova infraestrutura:** não introduzir filas, workers ou recursos GCP novos; reutilizar FastAPI, `BackgroundTasks`, `run_in_executor`.
- **Regra de background tasks:** tarefa que faz I/O pesado ou sync = **`def`** + execução em thread. Onde há request handler: preferir **BackgroundTasks.add_task(sync_fn)**. Onde não há (ex.: generator): **run_in_executor(None, sync_fn, ...)** sem await. Nunca `async def` com sync dentro rodando no event loop.
- **Contrato da API:** resposta de `POST /ultra-batch/configure-sheets` pode ganhar campo opcional (ex.: `backfill_status: "pending"` ou `backfilled_rows`) mas não remover campos atuais (`success`, `spreadsheet_id`, `spreadsheet_url`, `spreadsheet_name`); cliente que não conhece o novo campo continua funcionando.
- **Compatibilidade:** frontend que hoje espera `backfilled_rows` na resposta pode passar a tratar backfill em background (planilha pronta, dados preenchendo depois) ou consumir status via `GET /ultra-batch/sheets-config/{job_id}` se for adicionado.
- **Segurança e correção:** não expor dados de outros jobs; backfill apenas para o `job_id` do dono; whitelist e permissões de job permanecem iguais.

---

## 8. Assumptions

| ID | Assumption | If Wrong, Impact | Validated? |
|----|------------|------------------|------------|
| A-LM-001 | Backfill em processo (BackgroundTasks + função sync) é aceitável; não é obrigatório usar Cloud Tasks ou Pub/Sub | Se o processo morrer antes do backfill terminar, alguns resultados podem não ser escritos; usuário pode reconfigurar. Para MVP, aceitável | [ ] |
| A-LM-002 | Pool de threads padrão do asyncio (run_in_executor) é suficiente para is_digital + criação de planilha; não há necessidade de pool dedicado | Se muitas requisições simultâneas saturarem o pool, pode ser necessário ajustar tamanho ou usar pool dedicado (Design) | [ ] |
| A-LM-003 | Métricas atuais (Cloud Run: Execução do usuário, p99, concorrência) continuarão disponíveis para comparar antes/depois do deploy | Sem métricas fica difícil validar melhora | [x] (já existem) |
| A-LM-004 | Frontend pode exibir “Planilha criada; preenchendo resultados…” quando backfill for assíncrono, ou ignorar e apenas mostrar link | Se o frontend depender de “todos os dados já na planilha” na mesma resposta, precisará ser ajustado para polling ou status | [ ] |

---

## 9. Technical Context

| Pergunta | Resposta | Notas |
|----------|----------|--------|
| **Onde a feature vive?** | `ai-service/`: `app/api/report.py` (endpoints configure-sheets, check-whitelist, sheets-config), `app/services/report_analyzer/google_sheets_service.py` (create_spreadsheet_for_job, backfill_sheets_from_results), `app/services/digital_whitelist.py` (is_digital) | Alterações apenas no ai-service |
| **Quais domínios de conhecimento?** | FastAPI (BackgroundTasks, run_in_executor), Firestore (Admin SDK síncrono), Google Sheets/Drive API (já em uso); regra “def + thread” para background tasks | Sem novos domínios |
| **Impacto em infraestrutura?** | Não – nenhum recurso GCP novo; apenas mudança de fluxo no código (backfill em background, is_digital em executor) | Alinhado ao plano mínimo |

---

## 10. Clarity Score

| Element | Score | Criteria |
|---------|-------|----------|
| Problem | 3 | Clareza: latência já alta; nova feature síncrona pode piorar; mitigação sem nova infra |
| Users | 3 | Usuário final, operações e produto identificados com dores (latência, estabilidade, experiência) |
| Goals | 3 | MUST/SHOULD/COULD definidos; configure-sheets rápido + backfill em background; is_digital sem bloquear loop |
| Success | 3 | Critérios mensuráveis (tempo de resposta &lt; 15 s, backfill em background, event loop não bloqueado) |
| Scope | 3 | Out of scope explícito (sem nova infra, sem refatorar todo o ultra-batch) |

**Total: 15/15**

---

## 11. Referências

- **Análise de métricas e plano mínimo:** conversa anterior (prints Cloud Run: latência, Execução do usuário, contagem de instâncias, CPU/memória, bytes e solicitações simultâneas).
- **DEFINE feature principal:** `docs/DEFINE_DIGITAL_GOOGLE_SHEETS.md`
- **Código:** `ai-service/app/api/report.py`, `ai-service/app/services/report_analyzer/google_sheets_service.py`, `ai-service/app/services/digital_whitelist.py`, `ai-service/app/services/report_analyzer/ultra_batch_processing.py`
- **Workflow:** `agents/workflow/define-agent.md`

---

## Revisão (Design)

- **2026-02-24:** Status atualizado para **Complete (Built)** após conclusão da fase Build. Relatório em `docs/BUILD_REPORT_ULTRA_BATCH_SHEETS_LATENCY_MITIGATION.md`. Próximo passo: /ship.
- **2026-02-24:** Status atualizado para **Complete (Designed)** após conclusão da fase Design. Especificação técnica em `docs/DESIGN_ULTRA_BATCH_SHEETS_LATENCY_MITIGATION.md`. Próximo passo: /build.
- **2026-02-24:** Adotada regra de background tasks alinhada a outro projeto: tarefa com I/O pesado ou sync = **`def`** + execução em thread (BackgroundTasks em handler, run_in_executor sem await fora). Nunca `async def` com sync dentro no event loop. DEFINE e DESIGN atualizados (Goals, Constraints, Decisão 4, manifesto, padrões de código).
- **2026-02-24:** Incluídas considerações de revisão: (A) SHOULD escrita incremental em batch/buffer; (B) COULD backfill_status "failed" e retry ao reconfigurar; (D) MUST idempotência backfill vs incremental (created_at/processedAt). Novos AT-LM-007 e AT-LM-008; Success Criteria e Resumo atualizados.

---

## 12. Resumo do plano mínimo (para Design)

1. **configure-sheets:** criar planilha + salvar config no Firestore; retornar imediatamente com `spreadsheet_id`, `spreadsheet_url`, etc.; agendar backfill com **BackgroundTasks.add_task(backfill_sheets_from_results_sync, job_id)** (função **sync** `def`, não `async def`). Opcional: `backfill_status: "pending"` na resposta; opcional: atualizar doc quando backfill terminar.
2. **is_digital:** nos handlers, executar em `run_in_executor(None, is_digital, body.user_id)` para não bloquear o event loop.
3. **Escrita por resultado:** função **sync** `write_ultra_batch_result_to_sheets_sync`; no ultra_batch_processing usar **run_in_executor(None, write_sync, job_id, account, message)** **sem await** (fire-and-forget em thread). Não usar `async def` com sync dentro.
4. **Regra geral:** background task com I/O pesado ou sync = `def` + BackgroundTasks (em handler) ou run_in_executor sem await (fora de handler). Nunca async def com sync dentro no loop.
5. **Idempotência:** backfill_sync só inclui results com processedAt < config.created_at; write_sync (incremental) só escreve se processedAt >= config.created_at. Planilha sem duplicação.
6. **Escrita incremental:** preferir batch/buffer (ex.: a cada 50 linhas ou 2 s) para não enfileirar até 100 run_in_executor por job (SHOULD).
7. **Falha do backfill:** opcional backfill_status "failed" no doc; reconfigurar re-agenda backfill (COULD).
8. **Monitoramento:** após deploy, comparar “Execução do usuário” e latência p99/p50 nos horários de pico.
