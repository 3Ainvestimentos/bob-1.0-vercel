# BRAINSTORM: Digital – Google Sheets + Métricas por setor

## Ideia inicial

No report_analyzer (`ai-service/app/services/report_analyzer/`), usuários do setor **digital** precisam de:

1. **Output com botão para Google Sheets**  
   No resultado da análise ultra lote, um botão que leve a uma planilha Google com duas colunas: **"account number"** e **"final_message"** (texto final da análise).

2. **Métricas para diferenciar volume Digital x resto**  
   Poder segmentar uso por setor; ideia inicial: usar **IDs únicos dos integrantes do digital**.

**Motivação:** O digital tem carteira grande e usa automação para envio de mensagens via planilha; a planilha precisa de account number + texto da análise.

---

## Contexto explorado

### O que já existe

| Área | Situação |
|------|----------|
| **Google Sheets + ultra batch** | Plano em `.cursor/plans/integração_google_sheets_ultra_batch_121c3d47.plan.md`: whitelist por `user_ids`/roles, botão em `ChatMessageArea`, planilha com `accountNumber` + `final_message`, escrita assíncrona. |
| **Tipos de análise** | Três fluxos: **ultra batch**, **automática**, **personalizada**. Output em todos usa `final_message` (schema/código). |
| **Métricas** | `metrics.py`: `record_metric_call(user_id, "automatica"|"personalized")`, `record_ultra_batch_start`/`record_ultra_batch_complete`. Documentos em `metrics/{date}/users/{userId}` com `automatica`, `personalized`, `ultra_batch_runs`, etc. **Não há hoje** conceito de setor (digital vs resto). |
| **UI do output** | Ultra batch: `ChatMessageArea.tsx` (bloco de progresso + lotes). Automática/personalizada: mensagens no chat com `content` = texto da análise (`final_message`). |

### Onde entra “digital”

- **Digital** = setor específico; você quer restringir a feat de Sheets e as métricas “digital” a esse grupo.
- **Identificação:** você citou “id único dos integrantes do digital” → interpretação inicial: lista de **user_ids** (ex.: em Firestore/config), sem novo sistema de departamento.

### Alinhamento com o plano atual de Sheets

- O plano de integração Google Sheets já prevê **whitelist** (`config/google_sheets_whitelist`: `user_ids`, `roles`).
- Para o digital, podemos: **(a)** reutilizar a mesma whitelist e tratar “quem pode ver botão Sheets” = “digital”, ou **(b)** ter um documento separado só para “digital” (ex.: `config/digital_team` com lista de `user_ids`) e usar isso tanto para o botão quanto para métricas.

---

## Descoberta – perguntas (uma por vez)

### Pergunta 1 – Identificação do setor digital

O setor **digital** será definido por uma **lista fixa de user_ids** (ex.: integrantes do time), gerenciada em Firestore/config (como a whitelist do plano atual)?

- **(a)** Sim: lista de user_ids (ex.: em `config/digital_team` ou reutilizando `config/google_sheets_whitelist`).
- **(b)** Não: o critério é outro (ex.: role, departamento em outro sistema, SSO) — descreva brevemente.

**Resposta:** **(a)** Sim — whitelist de user_ids, pode ser no Firestore (ex.: `config/digital_team` ou `config/google_sheets_whitelist`) ou no próprio código.

---

### Pergunta 2 – Escopo do botão e da planilha

Para **análise automática** e **personalizada** (1 relatório por vez), quando o usuário digital clicar no botão “Abrir no Google Sheets”:

- **(a)** Uma **única planilha por usuário** (ou por sessão): o sistema cria/usa sempre a mesma planilha e **adiciona uma linha** (account number + final_message) a cada análise.
- **(b)** **Uma planilha por análise**: cada análise gera ou abre uma planilha nova (ou uma aba nova) com só aquela linha.
- **(c)** Só **ultra lote** precisa do botão/planilha; automática e personalizada **não** precisam do botão (só copiar/colar ou outro fluxo).

Qual opção reflete melhor o uso do digital?

**Resposta:** **(c)** Só **ultra lote** precisa do botão/planilha; automática e personalizada não precisam do botão (copiar/colar ou outro fluxo).

---

### Pergunta 3 – Métricas digital x resto

As métricas para diferenciar volume **digital** x **resto** serão usadas onde?

- **(a)** Só **interno**: relatórios/dashboard admin, BigQuery, planilhas internas, etc. (nada na UI do produto para o usuário final).
- **(b)** Também na **UI do produto**: exibir algo para o usuário (ex.: “uso do digital”) ou para o digital ver seu próprio volume.
- **(c)** Os dois: admin vê digital x resto; digital pode ver seu próprio uso em algum lugar.

Qual opção?

**Resposta:** **(a)** Só **interno**: relatórios/dashboard admin, BigQuery, planilhas internas, etc. (nada na UI do produto para o usuário final).

---

## Abordagens exploradas

### Escopo consolidado (após respostas)

| Item | Decisão |
|------|--------|
| **Quem é digital** | Whitelist de `user_ids` (Firestore, ex.: `config/digital_team` ou `config/google_sheets_whitelist`, ou no código). |
| **Botão Google Sheets** | Apenas **ultra lote**; planilha com colunas **account number** e **final_message**. |
| **Métricas digital x resto** | Uso **só interno** (admin/dashboard/BigQuery); não expor na UI do produto. |

---

### Abordagem A: Uma lista “digital” + sector no documento de métricas ⭐ Recomendada

**O que faz:**  
- Uma única fonte de verdade para “quem é digital”: documento Firestore (ex.: `config/digital_team`) com `user_ids: string[]`, ou reutilizar `config/google_sheets_whitelist` como lista do digital.  
- **Botão Sheets:** reutilizar o plano existente de integração Google Sheets para ultra batch; o botão é exibido só para quem está na lista (digital = whitelist). Planilha: colunas **account number** e **final_message**.  
- **Métricas:** ao registrar qualquer métrica (`record_metric_call`, `record_ultra_batch_start`, `record_ultra_batch_complete`), o backend consulta se `user_id` está na lista digital; se sim, grava no documento do usuário (`metrics/{date}/users/{userId}`) um campo opcional **`sector: "digital"`**. Quem não está na lista não recebe o campo (ou `sector: null`). Dashboard admin agrega/filtra por `sector` para relatórios digital x resto.

**Prós:**  
- Uma lista só para “digital” e para “quem vê botão Sheets” (se unificada).  
- Queries simples no admin: filtrar por `sector == "digital"`.  
- Histórico de métricas já carrega o segmento; relatórios não dependem de lista “no momento da consulta”.

**Contras:**  
- Backend precisa carregar a lista (ou cache) ao registrar métrica; cuidado com latência/cache.

**Por que recomendo:** Alinha botão Sheets e métricas na mesma definição de “digital”, evita duplicar listas e permite relatórios internos consistentes.

---

### Abordagem B: Duas listas (Sheets whitelist vs digital para métricas)

**O que faz:**  
- **Whitelist Sheets:** quem vê o botão (ex.: `config/google_sheets_whitelist`).  
- **Lista digital para métricas:** ex.: `config/digital_team`, usada só ao registrar métricas para preencher `sector: "digital"`.  
- As duas listas podem ter os mesmos IDs, mas são conceitualmente separadas.

**Prós:**  
- Separação clara: “acesso à feat Sheets” vs “segmento para relatório”.

**Contras:**  
- Duas listas para manter; se forem o mesmo grupo, risco de divergência.

**Quando faz sentido:** Se no futuro “quem vê botão” e “quem é digital nas métricas” puderem ser grupos diferentes.

---

### Abordagem C: Não gravar sector; marcar “digital” na hora do relatório

**O que faz:**  
- Não alterar o schema de métricas. Ao montar relatório/dashboard, o admin carrega a lista digital (Firestore ou código) e, para cada `user_id` nas métricas, marca “digital” se estiver na lista.

**Prós:**  
- Zero mudança na escrita de métricas; uma lista só.

**Contras:**  
- Toda consulta precisa da lista; se a lista mudar, o “digital” no passado muda (pode ser aceitável). Queries de agregação por setor ficam no lado do cliente/BI.

---

## YAGNI – o que deixar de fora do MVP

| Feature / ideia | Decisão | Motivo |
|-----------------|--------|--------|
| Botão Sheets em automática/personalizada | **Fora** | Resposta (c): só ultra lote. |
| UI de métricas “digital” para usuário final | **Fora** | Resposta (a): só uso interno. |
| Duas listas (Sheets vs digital) | **Fora** (se A escolhida) | Uma lista basta para MVP. |
| Coluna extra na planilha (além de account number + final_message) | **Fora** | Não pedido; adicionar depois se precisar. |
| BigQuery/export específico no MVP | **Opcional** | Métricas já em Firestore; agregar por `sector` no admin; BigQuery pode vir depois. |

---

## Rascunho de requisitos para /define

1. **Lista digital (whitelist)**  
   - Manter uma única lista de `user_ids` que definem o setor digital (Firestore, ex.: `config/digital_team`, ou reutilizar `config/google_sheets_whitelist`).  
   - Backend deve expor/usar essa lista para: (a) decidir se exibe botão Google Sheets no ultra lote; (b) decidir se grava `sector: "digital"` nas métricas.

2. **Botão Google Sheets (apenas ultra lote)**  
   - Visível só para usuários na lista digital.  
   - Planilha com duas colunas: **account number**, **final_message** (texto final da análise).  
   - Reutilizar/estender o plano existente de integração Google Sheets para ultra batch (configuração, criação de planilha, escrita incremental).

3. **Métricas digital x resto (uso interno)**  
   - Ao registrar métricas (`record_metric_call`, `record_ultra_batch_start`, `record_ultra_batch_complete`), quando `user_id` estiver na lista digital, gravar no documento do usuário em `metrics/{date}/users/{userId}` o campo **`sector: "digital"`**.  
   - Dashboard/admin deve poder agregar ou filtrar por `sector` para relatórios digital x resto (sem alterar UI do produto para usuário final).

4. **Não escopo do MVP**  
   - Botão Sheets em análise automática/personalizada.  
   - Exposição de métricas “digital” na UI do produto para usuário final.

---

## Próximos passos

1. ~~Responder Pergunta 1~~ ✅  
2. ~~Responder Pergunta 2~~ ✅  
3. ~~Responder Pergunta 3~~ ✅  
4. ~~Abordagens + YAGNI + requisitos~~ ✅  

---

## Status

**✅ Complete (Defined)** — Requisitos extraídos em `docs/DEFINE_DIGITAL_GOOGLE_SHEETS.md`. Atualizado após conclusão da fase Define.
