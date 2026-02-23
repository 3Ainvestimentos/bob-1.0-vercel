# DEFINE: Digital – Google Sheets (ultra lote) + Métricas por setor

> Requisitos extraídos e validados a partir do brainstorm: botão Google Sheets apenas para ultra lote (usuários digital) e métricas segmentadas digital x resto para uso interno.

| Atributo | Valor |
|----------|--------|
| **Feature** | Digital – Google Sheets (ultra lote) + métricas por setor |
| **Fase** | 1 – Define |
| **Input** | docs/BRAINSTORM_DIGITAL_GOOGLE_SHEETS.md |
| **Status** | ✅ Complete (Built) |
| **Próximo passo** | /ship — validação e deploy |

---

## 1. Problem Statement

O setor digital tem carteira grande e usa automação de envio de mensagens via planilha; hoje não há forma integrada de levar o resultado da análise (ultra lote) para um Google Sheet com account number e texto final, nem métricas internas que diferenciem o volume de uso do digital em relação ao resto dos usuários.

---

## 2. Target Users

| User | Role | Pain Point |
|------|------|------------|
| Equipe digital | Assessores que usam ultra lote + automação via planilha | Precisam exportar resultados (account number + texto da análise) para Google Sheets para alimentar automação de mensagens; hoje dependem de copiar/colar ou fluxo manual |
| Produto / gestão | Relatórios e dashboards internos | Não conseguem segmentar volume de uso “digital” vs “resto” para métricas e planejamento |
| Admin / operações | Configuração e monitoramento | Precisam de uma lista (whitelist) para definir quem é “digital” (botão Sheets + métricas) sem alterar a UI do produto para usuário final |

---

## 3. Goals

| Priority | Goal |
|----------|------|
| **MUST** | Oferecer botão “Abrir no Google Sheets” no output do **ultra lote** apenas para usuários na whitelist digital, levando a uma planilha com colunas **account number** e **final_message** |
| **MUST** | Manter uma única lista de `user_ids` (whitelist digital) em Firestore ou código, usada para: (a) exibir o botão Sheets no ultra lote; (b) gravar `sector: "digital"` nas métricas |
| **MUST** | Ao registrar métricas (`record_metric_call`, `record_ultra_batch_start`, `record_ultra_batch_complete`), gravar campo **`sector: "digital"`** no documento do usuário em `metrics/{date}/users/{userId}` quando o `user_id` estiver na lista digital |
| **SHOULD** | Reutilizar/estender o plano existente de integração Google Sheets para ultra batch (configuração, criação de planilha por job, escrita incremental assíncrona) |
| **SHOULD** | Dashboard/admin interno capaz de agregar ou filtrar por `sector` para relatórios digital x resto (sem expor na UI do produto para usuário final) |
| **COULD** | Cache ou leitura eficiente da lista digital no backend para não impactar latência ao registrar métricas |

---

## 4. Success Criteria

- [ ] Usuário na whitelist digital vê o botão “Abrir no Google Sheets” no output do ultra lote; usuário fora da lista não vê o botão.
- [ ] Ao clicar, o usuário acessa uma planilha com colunas **account number** e **final_message** preenchidas com os resultados do job (uma linha por relatório processado).
- [ ] Todo registro de métrica (automatica, personalized, ultra_batch_start, ultra_batch_complete) para `user_id` na lista digital persiste **`sector: "digital"`** em `metrics/{date}/users/{userId}`.
- [ ] Relatórios/dashboard admin conseguem filtrar ou agregar por `sector` para comparar volume digital x resto (uso interno apenas).

---

## 4.1. Agregação em `metrics_summary` e regra de não duplicação

O job de agregação mensal (Cloud Function `metrics_aggregator`) escreve em `metrics_summary/{YYYY-MM}`. O volume **total** hoje é calculado a partir de `metrics/{date}/total/total` (soma por dia de `automatica + personalized + ultra_batch_total_files`). Esse total é **único**: cada análise é contada uma vez.

**Regra de negócio (não duplicar):**  
- **Total de análises** no mês continua sendo a mesma métrica: soma, sobre os dias do mês, de `(automatica + personalized + ultra_batch_total_files)` do documento **total** do dia. **Não** se soma “total + digital”; digital é um **subconjunto** desse total.  
- **Volume digital:** contagem de análises atribuídas a usuários com `sector: "digital"`. Deve ser calculada somando, por dia do mês e por usuário em `metrics/{date}/users/{userId}` onde `sector == "digital"`, o que esse usuário fez: `automatica + personalized + soma(file_count de cada entrada em ultra_batch_runs)`. Soma sobre todos os dias = **volume_digital** do mês.  
- **Volume resto:** `volume_rest = total_analyses - volume_digital` (ou, equivalentemente, soma dos usuários com `sector != "digital"` ou sem campo `sector`).  
- **Invariante:** `total_analyses === volume_digital + volume_rest` (para o mesmo mês). Ex.: 10k total e 5k digital → total = 10k, digital = 5k, resto = 5k (nunca 15k).

**Onde persistir no `metrics_summary`:**  
- Manter `volume.total_analyses` como hoje (fonte: `metrics/{date}/total/total`).  
- Adicionar em `volume` (ou em um objeto dedicado) os campos de segmento, por exemplo:  
  - `volume.digital_analyses` (opcional: `volume.by_sector.digital`)  
  - `volume.rest_analyses` (opcional: `volume.by_sector.rest`)  
  com a garantia de que `total_analyses === digital_analyses + rest_analyses` para o mês. O design da Cloud Function e do contrato da API/dashboard deve ser atualizado nesse sentido (fase Design).

---

## 5. Acceptance Tests

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| AT-DS-001 | Botão Sheets visível para digital | Usuário com `user_id` na whitelist digital, mensagem de ultra lote concluído no chat | Renderiza área do ultra lote | Botão “Abrir no Google Sheets” (ou equivalente) visível |
| AT-DS-002 | Botão Sheets oculto para não-digital | Usuário com `user_id` fora da whitelist digital, mensagem de ultra lote concluído | Renderiza área do ultra lote | Botão não é exibido |
| AT-DS-003 | Planilha com colunas corretas | Job ultra lote configurado para Sheets, resultados com `accountNumber` e `final_message` | Processamento grava no Sheets | Planilha contém colunas **account number** e **final_message**; cada linha = um resultado (account number + texto da análise) |
| AT-DS-004 | Métrica com sector digital | `user_id` na lista digital, chamada a `record_metric_call(user_id, "automatica")` | Registro de métrica | Documento em `metrics/{date}/users/{userId}` contém `sector: "digital"` |
| AT-DS-005 | Métrica sem sector para não-digital | `user_id` fora da lista digital, chamada a `record_metric_call(user_id, "automatica")` | Registro de métrica | Documento em `metrics/{date}/users/{userId}` não contém `sector` ou tem `sector: null` |
| AT-DS-006 | Ultra-batch start/complete com sector | `user_id` na lista digital, `record_ultra_batch_start` e depois `record_ultra_batch_complete` | Registro de métricas | Documento do usuário em `metrics/{date}/users/{userId}` contém `sector: "digital"` e dados de ultra_batch_runs corretos |
| AT-DS-007 | Lista digital única | Firestore (ex.: `config/digital_team` ou `config/google_sheets_whitelist`) com `user_ids: string[]` | Backend verifica “é digital?” e “pode ver botão Sheets?” | Mesma lista usada para ambas as decisões (uma fonte de verdade) |
| AT-DS-008 | Agregação sem duplicar volume | `metrics/{date}/total/total` e `metrics/{date}/users` com alguns usuários com `sector: "digital"` | Job de agregação mensal roda e escreve `metrics_summary/{YYYY-MM}` | `volume.total_analyses` = soma do total por dia (inalterado); `volume.digital_analyses` = soma apenas dos usuários com sector "digital"; `total_analyses === digital_analyses + rest_analyses` (ex.: 10k total e 5k digital → total 10k, digital 5k, resto 5k; nunca 15k) |

---

## 6. Out of Scope

- Botão Google Sheets em análise **automática** ou **personalizada** (apenas ultra lote; usuário usa copiar/colar ou outro fluxo).
- Exposição de métricas “digital” na **UI do produto** para usuário final (apenas uso interno: admin, dashboard, BigQuery, planilhas internas).
- Duas listas separadas (Sheets whitelist vs digital para métricas) no MVP; uma lista única para “digital” e para “quem vê botão Sheets”.
- Colunas extras na planilha além de **account number** e **final_message** (adicionar depois se necessário).
- BigQuery ou export específico para digital no escopo do MVP (agregação por `sector` no admin; BigQuery pode vir depois).

---

## 7. Constraints

- **Botão Sheets:** apenas no fluxo **ultra lote**; reutilizar/estender o plano existente (`.cursor/plans/integração_google_sheets_ultra_batch_121c3d47.plan.md`): whitelist, criação de planilha por job, escrita incremental, botão em `ChatMessageArea.tsx`.
- **Lista digital:** Firestore (ex.: `config/digital_team` ou `config/google_sheets_whitelist`) ou lista fixa no código; não introduzir novo sistema de departamentos/SSO.
- **Métricas:** não alterar o contrato existente de `record_metric_call` e `record_ultra_batch_*` além de adicionar o campo opcional `sector` no documento do usuário; dashboard/admin consome dados já existentes em `metrics/{date}/users/{userId}`.
- **Agregação (metrics_summary):** o volume **total** do mês continua vindo de `metrics/{date}/total/total`; digital e resto são **segmentos** desse mesmo total (soma apenas dos usuários com `sector: "digital"` para digital). Nunca somar "total + digital" (evitar duplicação: 10k total com 5k digital → total 10k, digital 5k, resto 5k).

---

## 8. Assumptions

| ID | Assumption | If Wrong, Impact | Validated? |
|----|------------|------------------|------------|
| A-DS-001 | Plano de integração Google Sheets ultra batch será implementado (ou já está); este define apenas escopo “digital” + métricas por setor | Botão Sheets depende da infra de Sheets (credenciais, endpoints, UI); sem isso, só métricas por setor entram no escopo | [ ] (depende do plano existente) |
| A-DS-002 | Lista digital (whitelist) será pequena/estável; leitura no backend ao registrar métrica ou ao verificar botão é aceitável | Se lista muito grande ou consulta lenta, precisar de cache ou estrutura alternativa | [ ] |
| A-DS-003 | Dashboard/admin já lê `metrics/{date}/users/{userId}`; adicionar filtro/agregação por `sector` é suficiente para “digital x resto” | Se precisar de agregados pré-calculados por setor, pode ser necessário job adicional (fora deste define) | [ ] |
| A-DS-004 | Coluna **final_message** na planilha atende ao uso do digital para automação de mensagens | Se precisar de outro formato ou campo, ajustar no design | [x] (confirmado no brainstorm) |

---

## 9. Technical Context (inferred from brainstorm)

| Pergunta | Resposta | Notas |
|----------|----------|--------|
| **Onde a feature vive?** | `ai-service/` (backend: report_analyzer, metrics, API report) e `src/` (frontend: ChatMessageArea, actions, hook whitelist) | Alinhado ao plano Google Sheets ultra batch |
| **Quais domínios de conhecimento?** | Firestore (config, metrics, ultra_batch_jobs); GCP (credenciais, Sheets API); padrões existentes em `metrics.py` e `report.py` | Sem novos domínios além dos já usados no plano |
| **Impacto em infraestrutura?** | Não – usa infra existente (Firestore, variável de ambiente para credenciais Sheets, Cloud Run). Nenhum recurso GCP novo obrigatório para este define | Plano Sheets pode já prever credenciais e APIs |

---

## 10. Clarity Score

| Element | Score | Criteria |
|---------|-------|----------|
| Problem | 3 | Clareza: digital precisa de Sheets (ultra lote) + métricas segmentadas; problema e motivação explícitos |
| Users | 3 | Digital, produto/gestão e admin identificados com dores claras |
| Goals | 3 | MUST/SHOULD/COULD definidos; whitelist única, botão só ultra lote, sector nas métricas |
| Success | 3 | Critérios mensuráveis (botão visível/oculto, planilha com colunas, sector persistido, admin consegue filtrar) |
| Scope | 3 | Out of scope e constraints explícitos (sem botão em automática/personalizada, sem UI de métricas para usuário) |

**Total: 15/15**

---

## 11. Referências

- **Brainstorm:** `docs/BRAINSTORM_DIGITAL_GOOGLE_SHEETS.md`
- **Plano Google Sheets ultra batch:** `.cursor/plans/integração_google_sheets_ultra_batch_121c3d47.plan.md`
- **Métricas atuais:** `ai-service/app/services/metrics.py`
- **API report / ultra batch:** `ai-service/app/api/report.py`, `ai-service/app/services/report_analyzer/ultra_batch_processing.py`
- **UI ultra lote:** `src/app/chat/ChatMessageArea.tsx`, `src/app/chat/ChatPage.tsx`
- **Agregador mensal:** `functions/metrics_aggregator/aggregator.py` (volume hoje em `_compute_volume_and_ultra_files` via `metrics/{date}/total/total`; extensão para sector em §4.1)

---

## 12. Revisão (Design)

- **2026-02-23:** Status atualizado para **Complete (Designed)** após conclusão da fase Design. Especificação técnica em `docs/DESIGN_DIGITAL_GOOGLE_SHEETS.md`. Próximo passo: /build.
