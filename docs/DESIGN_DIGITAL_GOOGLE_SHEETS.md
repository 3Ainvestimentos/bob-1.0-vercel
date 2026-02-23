# DESIGN: Digital – Google Sheets (ultra lote) + Métricas por setor

> Especificação técnica derivada de `docs/DEFINE_DIGITAL_GOOGLE_SHEETS.md` e `docs/BRAINSTORM_DIGITAL_GOOGLE_SHEETS.md`. Alinhado ao plano `.cursor/plans/integração_google_sheets_ultra_batch_121c3d47.plan.md`.

| Atributo | Valor |
|----------|--------|
| **Feature** | Digital – Google Sheets (ultra lote) + métricas por setor |
| **Fase** | 3 – Build (✅ Complete) |
| **Input** | docs/DEFINE_DIGITAL_GOOGLE_SHEETS.md |
| **Output** | Código implementado + BUILD_REPORT abaixo |

---

## 1. Análise de requisitos (resumo)

| Elemento | Conteúdo |
|----------|----------|
| **Problema** | Setor digital precisa exportar resultado do ultra lote para Google Sheets (account number + texto) e métricas internas segmentadas digital x resto. |
| **Usuários** | Equipe digital (botão Sheets + automação); Produto/gestão (relatórios por setor); Admin (whitelist única). |
| **Critérios de sucesso** | Botão Sheets só para whitelist; planilha com account number + final_message; sector "digital" em métricas; agregação sem duplicar volume. |
| **Fora do escopo** | Botão em automática/personalizada; métricas na UI do produto; duas listas; colunas extras na planilha. |

---

## 2. Arquitetura – visão geral

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    DIGITAL – GOOGLE SHEETS + MÉTRICAS POR SETOR                  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────────┐     ┌─────────────────────────┐     ┌─────────────────────┐  │
│  │   Frontend   │     │  ai-service (Backend)   │     │  Firestore           │  │
│  │              │     │                         │     │                       │  │
│  │ ChatMessage  │────▶│ check-whitelist         │────▶│ config/digital_team  │  │
│  │ Area.tsx     │     │ (lista por email)       │     │ (emails: string[])    │  │
│  │              │     │                         │     │ users/{uid} (email)  │  │
│  │ Botão Sheets │     │ configure-sheets        │     │                       │  │
│  │ (só digital) │     │ write row (accountNumber│     │                       │  │
│  │              │     │ + final_message)         │     │ metrics/{date}/users/ │  │
│  └──────────────┘     └───────────┬─────────────┘     │   {userId} + sector  │  │
│         │                         │                   │ metrics/{date}/total│  │
│         │                         │                   │ metrics_summary/     │  │
│         │                         ▼                   │   {YYYY-MM}          │  │
│         │                 ┌─────────────────────┐     │   + digital_analyses │  │
│         │                 │ digital_whitelist  │     │   + rest_analyses    │  │
│         │                 │ (is_digital)       │     └───────────┬───────────┘  │
│         │                 └─────────┬─────────┘                 │              │
│         │                           │                           │              │
│         │                           ▼                           ▼              │
│         │                 ┌─────────────────────┐     ┌─────────────────────┐  │
│         │                 │ metrics.py         │     │ metrics_aggregator   │  │
│         │                 │ record_* + sector  │     │ (Cloud Function)     │  │
│         │                 └─────────────────────┘     │ volume.by_sector    │  │
│         │                                              └─────────────────────┘  │
│         └──────────────────────────────────────────────────────────────────────│
│                              Google Sheets API (planilha por job)               │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Fluxos principais:**

1. **Botão Sheets:** Frontend chama check-whitelist → Backend resolve uid → email (`users/{uid}.email`) e verifica se email está em `config/digital_team.emails` → Se estiver, botão é exibido; configure-sheets cria planilha; escrita incremental usa colunas **account number** e **final_message**.
2. **Métricas com sector:** Em todo `record_metric_call`, `record_ultra_batch_start`, `record_ultra_batch_complete`, o backend consulta `is_digital(user_id)` (que internamente resolve uid → email e checa a lista de emails) e, se verdadeiro, grava `sector: "digital"` no documento `metrics/{date}/users/{userId}`.
3. **Agregação:** O job mensal do `metrics_aggregator` mantém `volume.total_analyses` como hoje (soma de `metrics/{date}/total/total`) e adiciona `volume.digital_analyses` (soma apenas usuários com `sector == "digital"`) e `volume.rest_analyses = total_analyses - digital_analyses`.

---

## 3. Decisões de arquitetura

### Decisão 1: Lista única digital = whitelist Google Sheets

| Atributo | Valor |
|----------|--------|
| **Status** | Aceita |
| **Data** | 2026-02-23 |

**Contexto:** O DEFINE exige uma única fonte de verdade para “quem é digital” e para “quem vê o botão Sheets”.

**Escolha:** Usar **apenas** o documento Firestore `config/digital_team` com **`emails: string[]`** (lista de e-mails do setor digital) para ambos os propósitos. O backend continua recebendo `user_id` (uid) nas requisições; para saber se o usuário é digital, resolve o uid em email via documento `users/{uid}` (campo `email`) e verifica se esse email está em `config/digital_team.emails`. Assim a lista no Firestore fica legível (e-mails em vez de UIDs).

**Rationale:** Evita duas listas; atendimento ao AT-DS-007; uso de email melhora legibilidade para admin (como na estrutura atual de usuários: `users/{uid}` com `email`, `displayName`, `uid`, etc.).

**Alternativas rejeitadas:**
1. Duas listas (Sheets vs digital para métricas) — rejeitada por aumentar manutenção e risco de inconsistência (DEFINE e Brainstorm).
2. Marcar “digital” apenas na hora do relatório (sem gravar sector) — rejeitada porque relatórios precisam de agregação por setor e invariante total = digital + resto no metrics_summary.

**Consequências:** Backend e frontend dependem da mesma lista; qualquer mudança de “quem é digital” é feita em um único documento.

---

### Decisão 2: Campo opcional `sector` no documento do usuário em métricas

| Atributo | Valor |
|----------|--------|
| **Status** | Aceita |
| **Data** | 2026-02-23 |

**Contexto:** Métricas já persistem em `metrics/{date}/users/{userId}` com `automatica`, `personalized`, `ultra_batch_runs`. Precisamos segmentar digital x resto sem quebrar contrato existente.

**Escolha:** Adicionar campo opcional `sector: "digital"` apenas quando o usuário (identificado pelo uid) estiver na lista digital — ou seja, quando o email do usuário (em `users/{uid}.email`) estiver em `config/digital_team.emails`. Usuários fora da lista não recebem o campo (ou pode ser `null`).

**Rationale:** Compatível com leitores atuais; dashboard/admin pode filtrar/agregar por `sector`; agregação mensal pode calcular volume_digital a partir dos usuários com `sector == "digital"`.

**Alternativas rejeitadas:**
1. Nova subcoleção ou documento separado por setor — rejeitada por complexidade e duplicação de dados.
2. Não persistir sector e calcular na leitura — rejeitada porque a agregação mensal precisa de valores estáveis e invariante total = digital + resto.

**Consequências:** Leitura da lista digital no backend em toda gravação de métrica; recomendado cache em memória (TTL curto) para não impactar latência (SHOULD/COULD no DEFINE).

---

### Decisão 3: Agregação mensal – volume total inalterado; digital e resto como segmentos

| Atributo | Valor |
|----------|--------|
| **Status** | Aceita |
| **Data** | 2026-02-23 |

**Contexto:** O total de análises do mês não pode ser “total + digital” (duplicação). Digital é subconjunto do total.

**Escolha:**  
- `volume.total_analyses`: mantido como hoje — soma, sobre os dias do mês, de `(automatica + personalized + ultra_batch_total_files)` do documento `metrics/{date}/total/total`.  
- `volume.digital_analyses`: soma, por dia e por usuário em `metrics/{date}/users/{userId}` onde `sector == "digital"`, de `automatica + personalized + soma(file_count de cada entrada em ultra_batch_runs)`.  
- `volume.rest_analyses`: `total_analyses - digital_analyses` (ou soma equivalente para usuários sem sector ou sector != "digital").  
- Invariante: `total_analyses === digital_analyses + rest_analyses`.

**Rationale:** Atende §4.1 do DEFINE e AT-DS-008; evita duplicação e mantém consistência para dashboards.

**Alternativas rejeitadas:**
1. Somar “total” + “digital” — rejeitada por duplicar contagem.
2. Só persistir digital_analyses e calcular resto no dashboard — aceitável, mas persistir ambos deixa o contrato do metrics_summary explícito e testável.

**Consequências:** A Cloud Function `metrics_aggregator` precisa de nova lógica (função auxiliar ou extensão de `_compute_volume_and_ultra_files`) para iterar `metrics/{date}/users` e somar por sector; payload de `metrics_summary` ganha campos `volume.digital_analyses` e `volume.rest_analyses` (ou `volume.by_sector.digital` / `volume.by_sector.rest`).

---

### Decisão 4: Colunas da planilha e reuso do plano Sheets

| Atributo | Valor |
|----------|--------|
| **Status** | Aceita |
| **Data** | 2026-02-23 |

**Contexto:** DEFINE exige planilha com **account number** e **final_message**. O plano existente já prevê accountNumber e escrita incremental.

**Escolha:** Manter uma planilha por job; cabeçalhos **account number** e **final_message**; a coluna **final_message** é preenchida com o campo `final_message` de cada resultado em `ultra_batch_jobs/{jobId}/results/{index}`. Reutilizar criação dinâmica, credenciais por variável de ambiente e escrita assíncrona do plano.

**Rationale:** Alinhado ao DEFINE e ao plano; sem colunas extras no MVP.

**Consequências:** Serviço Google Sheets (no plano) deve usar nomes de coluna `account number` e `final_message`; nenhuma mudança de contrato além da nomenclatura se o plano tiver usado outros nomes (ex.: "Mensagem WhatsApp" → mapear para `final_message`).

---

## 4. Manifesto de arquivos

Arquivos a criar ou modificar, com dependências e agente sugerido. “(general)” = sem agente especializado; Build agent pode atribuir ou implementar diretamente.

| # | Arquivo | Ação | Propósito | Dependências | Agente | Rationale |
|---|---------|------|-----------|--------------|--------|------------|
| 1 | `ai-service/app/services/digital_whitelist.py` | Criar | Lê `config/digital_team.emails` e, dado `user_id` (uid), resolve email em `users/{uid}.email` e verifica se está na lista; expõe `is_digital(user_id)`; cache opcional (TTL) | Nenhuma | @python-developer | Lógica Python, Firestore, padrões de cache |
| 2 | `ai-service/app/services/metrics.py` | Modificar | Em `record_metric_call`, `record_ultra_batch_start`, `record_ultra_batch_complete`: obter sector via `digital_whitelist.is_digital(user_id)` e gravar `sector: "digital"` no doc do usuário ao criar/atualizar | 1 | @python-developer | Serviço de métricas existente, tipagem e testes |
| 3 | `ai-service/app/api/report.py` | Modificar | Endpoint check-whitelist (ou equivalente) usar lista digital; garantir que configure-sheets e escrita de planilha usem colunas account number + final_message | 1, plano Sheets | @python-developer | API report, integração whitelist |
| 4 | `ai-service/app/services/report_analyzer/google_sheets_service.py` | Criar/Modificar | Garantir cabeçalhos **account number** e **final_message**; escrever linhas com o campo `final_message` do resultado na coluna **final_message** | Plano Sheets, config credentials | @python-developer | Serviço Sheets, nomes de coluna do DEFINE |
| 5 | `ai-service/app/services/report_analyzer/ultra_batch_processing.py` | Modificar | Já previsto no plano: extrair accountNumber, salvar em results; acionar escrita no Sheets com accountNumber e final_message (coluna **final_message**) | 4 | @python-developer | Pipeline ultra batch |
| 6 | `src/hooks/use-google-sheets-whitelist.ts` | Criar/Modificar | Hook que verifica se usuário está na lista digital (mesma usada para botão Sheets); retorno ex.: `{ isAuthorized, isLoading, error }` | Backend check-whitelist | (general) | Frontend React, chamada API |
| 7 | `src/app/chat/ChatMessageArea.tsx` | Modificar | Renderizar botão “Abrir no Google Sheets” apenas quando `msg.ultraBatchJobId` + `isAuthorized` (lista digital); posição próxima ao progresso do ultra lote | 6, componente botão do plano | (general) | UI ultra lote |
| 8 | `src/components/chat/GoogleSheetsConfigButton.tsx` | Criar | Componente do plano: modal de confirmação, opcional custom_name, exibir link da planilha; usado apenas no fluxo ultra lote para usuários digitais | 6 | (general) | UI React |
| 9 | `src/app/actions.ts` | Modificar | Adicionar/ajustar funções que chamam configure-sheets, get-config, check-whitelist (lista digital) | Backend endpoints | (general) | Server actions |
| 10 | `functions/metrics_aggregator/aggregator.py` | Modificar | Calcular `digital_analyses` (soma por usuário com sector "digital") e `rest_analyses = total_analyses - digital_analyses`; escrever em `payload["volume"]` campos `digital_analyses` e `rest_analyses` (ou `by_sector`) | Nenhuma | @function-developer | Cloud Function, Firestore aggregation |
| 11 | `ai-service/app/services/metrics.py` (testes) | Modificar | Testes para sector: usuário na lista digital recebe `sector: "digital"`; usuário fora não recebe sector | 2 | @test-generator | pytest, métricas |
| 12 | `ai-service/app/services/digital_whitelist.py` (testes) | Criar | Testes para `is_digital`: email na lista (uid → email em users) retorna True; fora retorna False; doc ausente ou lista vazia | 1 | @test-generator | pytest |
| 13 | `functions/metrics_aggregator/tests/` | Modificar | Testes para nova lógica de volume por setor e invariante total = digital + rest | 10 | @test-generator | pytest, agregador |

Configuração e Firestore (não são “arquivos de código” no manifest, mas entradas de configuração):

- **Firestore:** Documento **`config/digital_team`** com **`emails: string[]`** (lista de e-mails; ver guia em §8). Backend resolve uid → email via `users/{uid}.email`.
- **Variável de ambiente:** `GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY` (já prevista no plano Sheets).

---

## 5. Padrões de código

### 5.1 Serviço de lista digital (Python)

```python
# digital_whitelist.py - contrato esperado
# config/digital_team tem campo emails: string[] (lista de e-mails do setor digital).
# users/{uid} tem campo email (estrutura existente do app).

def is_digital(user_id: str) -> bool:
    """
    Retorna True se o usuário (uid) pertence ao setor digital.
    Resolve: ler users/{user_id}.email; ler config/digital_team.emails; retornar email in emails.
    Usado para: (1) exibir botão Sheets no ultra lote; (2) gravar sector nas métricas.
    """
    # 1. Obter db; ler users/{user_id} e pegar campo email.
    # 2. Ler config/digital_team e pegar array emails.
    # 3. Retornar email in emails (normalizar caso se necessário).
    # Cache em memória (uid -> bool ou email -> bool) com TTL curto para reduzir leituras.
    ...
```

### 5.2 Gravar sector em métricas (Python)

```python
# Em metrics.py, ao criar ou atualizar doc em metrics/{date}/users/{userId}:
from app.services.digital_whitelist import is_digital

def _user_doc_updates(base_updates: dict, user_id: str) -> dict:
    updates = dict(base_updates)
    if is_digital(user_id):
        updates["sector"] = "digital"
    return updates

# Em record_metric_call / record_ultra_batch_start / record_ultra_batch_complete,
# ao fazer transaction.set ou transaction.update, incluir updates de _user_doc_updates.
```

### 5.3 Agregação – volume por setor (Python)

```python
# aggregator.py - esboço da nova função
def _compute_volume_by_sector(
    db: firestore.Client, date_list: list[str]
) -> tuple[int, int, int]:
    """
    Retorna (total_analyses, digital_analyses, rest_analyses).
    total_analyses = soma de metrics/{date}/total/total (inalterado).
    digital_analyses = soma, por usuário com sector=="digital", de automatica + personalized + sum(file_count) em ultra_batch_runs.
    rest_analyses = total_analyses - digital_analyses.
    """
    total_analyses, ultra_total = _compute_volume_and_ultra_files(db, date_list)
    digital_analyses = 0
    for date_str in date_list:
        users_ref = db.collection(COLLECTION_METRICS).document(date_str).collection(SUBDOC_USERS)
        for doc in users_ref.stream():
            data = doc.to_dict() or {}
            if data.get("sector") != "digital":
                continue
            automatica = data.get("automatica") or 0
            personalized = data.get("personalized") or 0
            runs = data.get("ultra_batch_runs") or []
            file_count = sum(r.get("file_count") or 0 for r in runs)
            digital_analyses += automatica + personalized + file_count
    rest_analyses = total_analyses - digital_analyses
    return total_analyses, digital_analyses, rest_analyses
```

### 5.4 Frontend – exibição condicional do botão

```tsx
// ChatMessageArea.tsx - condição para mostrar botão Sheets
{msg.ultraBatchJobId && msg.role === 'assistant' && isAuthorized && (
  <GoogleSheetsConfigButton jobId={msg.ultraBatchJobId} onConfigured={...} />
)}
// isAuthorized vem do hook useGoogleSheetsWhitelist (ou useDigitalWhitelist) que chama check-whitelist (lista digital).
```

---

## 6. Estratégia de testes

| Tipo | Escopo | Arquivos | Ferramentas |
|------|--------|----------|-------------|
| Unit | `is_digital()`, cache, edge cases (doc ausente, lista vazia) | `tests/test_digital_whitelist.py` | pytest, mock Firestore |
| Unit | `record_metric_call` / `record_ultra_batch_*` com e sem sector | `ai-service/.../tests/test_metrics.py` | pytest, mock Firestore |
| Unit | `_compute_volume_by_sector` e invariante total = digital + rest | `functions/metrics_aggregator/tests/test_aggregator.py` | pytest |
| Integração | check-whitelist retorna conforme lista digital; configure-sheets e escrita com colunas corretas | report API tests | pytest, test doubles |
| Aceite | AT-DS-001 a AT-DS-008 | Manual ou E2E | Checklist a partir do DEFINE |

Cobertura mínima desejada: módulo `digital_whitelist`, alterações em `metrics.py` (sector) e nova lógica do `metrics_aggregator` (volume por setor).

---

## 7. Configuração e segurança

- **Lista digital:** Firestore `config/digital_team` com `emails: string[]`; apenas backend e admin alteram; não expor lista completa de e-mails em resposta pública.
- **Check-whitelist:** Retornar apenas booleano (autorizado ou não) para o usuário autenticado; não listar e-mails de outros usuários.
- **Credenciais Sheets:** Não persistir no Firestore. Em **desenvolvimento**: variável de ambiente (ex.: `.env` com `GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY`). Em **produção**: Secret Manager (mesmo nome da variável injetada no runtime, ex.: Cloud Run / Vercel). O código lê apenas `os.getenv("GOOGLE_SHEETS_SERVICE_ACCOUNT_KEY")` em ambos os ambientes.
- **Métricas:** Campo `sector` não contém dados sensíveis; uso interno (dashboard/admin) conforme DEFINE.

---

## 8. Configurar `config/digital_team` no Firestore (interface)

Use **apenas** a coleção/documento abaixo. O backend e o botão Sheets leem esta lista para decidir quem é “digital”. A lista usa **e-mail** (como em `users/{uid}.email`) para ficar legível na interface.

### Passo a passo no Console do Firestore

1. **Abrir o projeto**
   - Acesse [Firebase Console](https://console.firebase.google.com/) e selecione o projeto do app.

2. **Ir ao Firestore**
   - No menu lateral: **Build** → **Firestore Database** (ou **Firestore**).

3. **Criar a coleção `config` (se não existir)**
   - Clique em **+ Iniciar coleção** (ou **Add collection**).
   - **ID da coleção:** `config` → **Avançar**.

4. **Criar o documento `digital_team`**
   - **ID do documento:** `digital_team` (exatamente assim).
   - Clique em **Avançar**.

5. **Adicionar o campo `emails` (array)**
   - **Campo:** `emails`
   - **Tipo:** escolha **matriz** / **array**.
   - **Valores:** adicione o **e-mail** de cada usuário do setor digital (um por elemento), **igual ao campo `email` do documento do usuário** em `users/{uid}`. Exemplo:
     - `lucas.nogueira@3ainvestimentos.com.br`
     - `outro.membro@3ainvestimentos.com.br`
   - Para **adicionar outro valor** ao array, use o botão **+ Adicionar item** e preencha com o próximo e-mail.
   - **Salvar** o documento.

6. **Estrutura final do documento**
   - Caminho: `config` (coleção) → `digital_team` (documento).
   - Campos:
     - `emails` (tipo: array) — lista de strings, cada uma = um e-mail (o mesmo valor do campo `email` em `users/{uid}`).

**Exemplo (como deve aparecer no console):**

| Campo   | Tipo  | Valor (exemplo) |
|---------|--------|------------------|
| `emails` | array | `["lucas.nogueira@3ainvestimentos.com.br", "outro@3ainvestimentos.com.br"]` |

7. **Manutenção**
   - Para incluir alguém: edite o documento `config/digital_team`, adicione um novo item ao array `emails` com o **e-mail** da pessoa (o mesmo que está em `users/{uid}.email`) e salve.
   - Para remover: edite o documento e apague o item correspondente do array.

**Onde obter o e-mail:** no Firestore, abra o documento do usuário em **Users** (ID do documento = uid do usuário) e use o valor do campo **`email`** — por exemplo `lucas.nogueira@3ainvestimentos.com.br`. O backend usa esse mesmo valor para comparar com a lista em `config/digital_team.emails`.

---

## 9. Referências

- **DEFINE:** `docs/DEFINE_DIGITAL_GOOGLE_SHEETS.md`
- **Brainstorm:** `docs/BRAINSTORM_DIGITAL_GOOGLE_SHEETS.md`
- **Plano Google Sheets ultra batch:** `.cursor/plans/integração_google_sheets_ultra_batch_121c3d47.plan.md`
- **Métricas:** `ai-service/app/services/metrics.py`
- **Agregador:** `functions/metrics_aggregator/aggregator.py`
- **UI ultra lote:** `src/app/chat/ChatMessageArea.tsx`
- **Estrutura de usuários:** coleção `users`, documento `users/{uid}` com campos `email`, `displayName`, `uid`, `role`, etc. (usada para resolver uid → email em `digital_whitelist`).
