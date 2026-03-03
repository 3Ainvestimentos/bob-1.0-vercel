# BRAINSTORM: Evolução das Métricas do Report Analyzer

## Análise dos Commits de Referência

| Commit | Data | Descrição |
|--------|------|-----------|
| `5e35ab4` | 2026-02-19 | `metrics_aggregators` — Cloud Function de agregação mensal: cria `functions/metrics_aggregator/`, calcula MAU, Volume, Intensidade, Qualidade e Escala; persiste em `metrics_summary` Firestore |
| `60dadfb` | 2026-02-19 | `frontend metrics report analyzer` — Dashboard admin (`ReportAnalyzerMetricsTab.tsx`) que consome `/api/report/metrics-summary` e exibe os 6 KPIs com tabela histórica e gráfico de tendência |

### Arquitetura atual

```
[Scheduler Cloud Function] → aggregator.py → Firestore: metrics_summary/{YYYY-MM}
                                                         ↓
                                            ai-service /api/report/metrics-summary
                                                         ↓
                                     ReportAnalyzerMetricsTab.tsx (Next.js admin)
```

**Peças-chave:**
- `functions/metrics_aggregator/config.py` → constante hardcoded `TOTAL_ASSESSORS = 213`
- `aggregator.py` → `mau_percent = mau / TOTAL_ASSESSORS * 100`
- `ai-service/app/models/requests.py` → `MetricsSummaryItem` com campo `intensity.analyses_per_assessor_avg`
- `ReportAnalyzerMetricsTab.tsx` → exibe card "Intensidade" com `analyses_per_assessor_avg`
- `ai-service/app/services/digital_whitelist.py` → já identifica usuários do digital via `config/digital_team.emails` no Firestore

---

## Ideia Inicial

Três evoluções independentes no sistema de métricas do Report Analyzer:

1. **Assessores configurável**: número total de assessores está hardcoded em `213`; deve ser corrigido para `139` e tornar-se editável via painel admin no frontend, sem precisar redeploy da Cloud Function.
2. **Persistência de uso**: substituir a métrica "Intensidade" (média de análises/assessor) por "Persistência de Uso" — quantos usuários usaram o XP Performance por 3 meses consecutivos.
3. **Métricas do Digital**: criar um conjunto de KPIs exclusivo para o time digital, segmentando os dados da coleção `config/digital_team` no Firestore.

---

## Discovery Q&A

| # | Pergunta | Resposta | Impacto |
|---|----------|----------|---------|
| 1 | O número 139 é fixo ou muda periodicamente (ex: contratações/saídas)? | **Muda** — por isso precisa ser editável | A fonte de verdade passa a ser Firestore (`config/metrics_config.total_assessors`), não mais código |
| 2 | Para "persistência de uso": 3 meses consecutivos *até o mês corrente* ou *qualquer janela de 3 meses no histórico*? | Últimos 3 meses consecutivos até o mês da agregação | Computação pontual por agregação mensal |
| 3 | "Persistência" é uma nova coluna nas métricas mensais (acompanha o tempo) ou um KPI único no dashboard? | Nova coluna mensal, substitui "Intensidade" no schema | Mudança de schema em `MetricsSummaryItem`, `aggregator.py`, frontend |
| 4 | As métricas do digital devem aparecer no mesmo dashboard ou em aba separada? | **Sub-aba separada** dentro da aba "Report Analyzer", com o padrão já adotado em Chat/RAG ("Análise Geral" / "Análise Digital") | Novo componente `DigitalMetricsTab.tsx`; `page.tsx` envolve as duas sub-abas com `<Tabs>` |
| 5 | As métricas do digital devem ser armazenadas no mesmo doc `metrics_summary/{YYYY-MM}` ou em documento separado? | Mesmo documento, campo `digital: {...}` | Schema do Firestore evolui com campo adicional |
| 6 | A sub-aba digital usa os mesmos filtros de período (from/to mês) que a Análise Geral? | Sim — mesmo mecanismo de filtro, estado compartilhado ou próprio por sub-aba | `DigitalMetricsTab.tsx` tem seus próprios inputs de período, mesmo padrão que `ReportAnalyzerMetricsTab.tsx` |

---

## Inventário de Dados / Fontes

| Fonte | Localização | Notas |
|-------|-------------|-------|
| Métricas diárias por usuário | Firestore `metrics/{YYYY-MM-DD}/users/{uid}` | Campos: `automatica`, `personalized`, `ultra_batch_runs[]` |
| Resumo mensal | Firestore `metrics_summary/{YYYY-MM}` | Escrito pela Cloud Function |
| Usuários digitais | Firestore `config/digital_team.emails` | Lista de e-mails; já mapeado por `digital_whitelist.py` |
| UID → email | Firestore `users/{uid}.email` | Já resolvido em `digital_whitelist.py` |
| Total de assessores | `config.py` hardcoded como `213` | **A ser movido para** `config/metrics_config.total_assessors` |
| Histórico de 3 meses | `metrics_summary/{YYYY-MM}.adoption.mau` (por mês) | Precisamos de lista de UIDs por mês, não só o count |

> **Gap identificado**: o aggregator atual salva `mau` (contagem), não a lista de UIDs. Para calcular persistência (interseção de 3 meses), precisamos ou (a) armazenar o `set` de UIDs por mês no summary, ou (b) recalcular a persistência relendo `metrics/{date}/users/` dos últimos 3 meses no momento da agregação.

---

## Feature 1: Total de Assessores Configurável

### Contexto

`TOTAL_ASSESSORS = 213` em `functions/metrics_aggregator/config.py`. O valor correto é `139`. Cada vez que muda, exige redeploy da Cloud Function.

### Abordagens

#### Abordagem A: Firestore como fonte de verdade ⭐ Recomendada

**O que faz:** Cria `config/metrics_config` no Firestore com campo `total_assessors: 139`. A Cloud Function lê esse valor no início da execução. O frontend admin adiciona um campo editável que faz `set` no mesmo documento.

**Pros:**
- Zero redeploy para mudança de valor
- Única fonte de verdade (Firestore)
- Segue padrão já adotado pelo projeto (`config/digital_team`)
- Frontend usa Server Action já existente em `admin/actions.ts`

**Cons:**
- 1 leitura extra no Firestore por execução da Cloud Function (custo negligível)
- Requer regra de segurança Firestore para escrita (apenas admin)

**Arquivos afetados:**
- `functions/metrics_aggregator/config.py` → remove constante, adiciona leitura Firestore
- `functions/metrics_aggregator/aggregator.py` → recebe `total_assessors` como parâmetro
- `src/app/admin/components/ReportAnalyzerMetricsTab.tsx` → adiciona input editável
- `src/app/admin/actions.ts` → nova Server Action `updateTotalAssessors`

#### Abordagem B: Variável de ambiente na Cloud Function

**O que faz:** `TOTAL_ASSESSORS` vira env var da Cloud Function. Frontend exibe o valor atual mas não tem write — a mudança exige atualizar env vars no GCP Console ou Terraform.

**Pros:** Sem leitura extra de Firestore.

**Cons:** Frontend não consegue editar — contradiz o requisito. Redeploy necessário.

#### Abordagem C: Endpoint de config no AI Service

**O que faz:** AI Service expõe `/api/config/metrics` com GET/PUT. Frontend consome esse endpoint.

**Cons:** Mais complexo, outra peça de infraestrutura, sem ganho real frente à Abordagem A.

**Selecionada:** Abordagem A.

---

## Feature 2: Persistência de Uso (substitui Intensidade)

### Contexto

"Intensidade" = `analyses_per_assessor_avg` (total de análises / MAU). Mede volume médio de uso, mas não captura hábito/retenção.

"Persistência de Uso" = quantidade de usuários que usaram o XP Performance nos **últimos 3 meses consecutivos** (incluindo o mês atual da agregação). Mede engajamento sustentado.

### Abordagens

#### Abordagem A: Calcular persistência na Cloud Function lendo histórico ⭐ Recomendada

**O que faz:** Durante a agregação do mês M, a Cloud Function:
1. Coleta set de UIDs ativos em M, M-1 e M-2 (relendo `metrics/{date}/users/` para cada mês)
2. Faz interseção dos 3 sets
3. Salva `persistence: { users_3m_streak: <count> }` em `metrics_summary/{M}`

**Pros:**
- Sem mudança de schema de armazenamento diário (não precisa salvar lista de UIDs no summary)
- Cálculo determinístico e reproduzível
- Encapsulado na Cloud Function existente

**Cons:**
- Custo de leitura Firestore aumenta (3x leitura de 30 dias de métricas por usuário ativo)
- Para os meses M-1 e M-2 que já estão `closed=true`, o dado está disponível sem necessidade de reprocessar

**Otimização:** Para M-1 e M-2 já fechados, armazenar o set de UIDs no `metrics_summary` como `adoption.active_uids: string[]`. Isso elimina a releitura nos meses seguintes.

#### Abordagem B: Salvar lista de UIDs por mês no summary e calcular persistência no frontend/API

**O que faz:** O summary passa a ter `adoption.active_uids: string[]`. O AI Service ou o frontend calcula a interseção.

**Cons:** Lista de UIDs pode crescer (privacidade, tamanho do documento Firestore — limite 1 MB por doc). Expõe UIDs na API. Não recomendado.

#### Abordagem C: Coleção separada `metrics_persistence/{YYYY-MM}`

**O que faz:** Cria nova coleção só para dados de persistência.

**Cons:** Over-engineering — o campo cabe no documento existente.

**Selecionada:** Abordagem A com otimização de armazenar `active_uids` no summary dos meses fechados (hash de UIDs, sem PII).

### Impacto de Schema

```diff
# metrics_summary/{YYYY-MM}
- "intensity": { "analyses_per_assessor_avg": float }
+ "persistence": { "users_3m_streak": int }
```

**Frontend:** Card "Intensidade" → "Persistência de Uso" exibindo `users_3m_streak` usuários.

**Retrocompatibilidade:** Meses históricos já agregados continuarão tendo `intensity` sem `persistence`. O frontend deve tratar ambos (mostrar `-` para meses sem o campo).

---

## Feature 3: Métricas Exclusivas para o Digital

### Contexto

O time digital já é identificado via `config/digital_team.emails` no Firestore (implementado em `digital_whitelist.py` no AI Service). Atualmente, as métricas são globais. Precisamos de um corte segmentado: quantos usuários digitais usam o XP Performance?

### Abordagens

#### Abordagem A: Subcampo `digital` no documento metrics_summary ⭐ Recomendada

**O que faz:** A Cloud Function carrega a lista de UIDs do digital (`config/digital_team.emails` → resolve email → UID via `users/{uid}`) e computa as mesmas métricas filtradas por esse subconjunto. Salva em `metrics_summary/{M}.digital: { mau, mau_percent, total_analyses, persistence_3m }`.

`mau_percent` do digital = `digital_mau / total_digital_team_size * 100`.

**Pros:**
- Segue o padrão já existente no documento
- Um único documento por mês (sem overhead de coleções extras)
- Reutiliza toda a infraestrutura de leitura já existente

**Cons:**
- Cloud Function precisa acessar `config/digital_team` (nova leitura por execução)
- `total_digital_team_size` precisa ser lido do mesmo documento `config/digital_team` (campo `emails.length`)

#### Abordagem B: Documento separado `metrics_summary_digital/{YYYY-MM}`

**O que faz:** Cria coleção paralela só para métricas do digital.

**Cons:** Duplicação de infraestrutura; a lógica é a mesma, só muda o filtro. Over-engineering.

#### Abordagem C: Calcular no AI Service com filtragem em tempo real

**O que faz:** AI Service lê os dados brutos e filtra por digital on-the-fly ao servir a API.

**Cons:** Latência alta, custo de leitura multiplicado a cada request, sem histórico persistido.

**Selecionada:** Abordagem A.

### Métricas do Digital (MVP)

| Métrica | Campo | Descrição |
|---------|-------|-----------|
| MAU Digital | `digital.mau` | Usuários ativos únicos do time digital no mês |
| MAU Digital % | `digital.mau_percent` | `mau / total_digital_size * 100` |
| Volume Digital | `digital.total_analyses` | Total de análises feitas pelo time digital |
| Persistência Digital | `digital.users_3m_streak` | Usuários do digital com 3 meses consecutivos |

**Frontend:** Sub-aba "Análise Digital" dentro da aba "Report Analyzer", espelhando o padrão de Chat/RAG. Novo componente `DigitalMetricsTab.tsx` com 4 cards e tabela histórica própria. `ReportAnalyzerMetricsTab.tsx` (Análise Geral) permanece inalterado no conteúdo — apenas o input de assessores é adicionado.

---

## Features Removidas (YAGNI)

| Feature | Motivo | Futuro? |
|---------|--------|---------|
| Exportar lista de UIDs persistentes para CSV | Sem uso definido, risco LGPD | Talvez |
| Alertas automáticos por e-mail quando meta não atingida | Fora do escopo desta iteração | Sim |
| Breakdowns por tipo de análise (automática vs. personalizada vs. ultra-batch) no digital | Complexidade alta, dado disponível, mas não pedido | Sim |
| Configuração de metas (targets) pelo frontend | Hardcoded no frontend é suficiente por enquanto | Sim |
| ~~Aba separada para métricas digitais~~ | ~~Mesma aba com seção é suficiente~~ | ~~Só se o volume de métricas digitais crescer~~ → **Revertido**: sub-aba "Análise Digital" foi adicionada ao escopo, seguindo padrão Chat/RAG |

---

## Riscos e Dependências

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| `config/digital_team` pode não ter UID, só email | Cloud Function não sabe UID → email sem acessar `users/` | Mover resolução email→UID para a Cloud Function (igual ao `digital_whitelist.py`) |
| Interseção de 3 meses pode ser lenta para grandes bases | Leitura de ~90 dias × N usuários | Armazenar `active_uids` (ou hash set) no summary dos meses fechados |
| Breaking change no schema `intensity` → `persistence` | Frontend quebra para meses históricos | Frontend usa optional chaining (`s.persistence?.users_3m_streak ?? '-'`) |
| Permissão de escrita em `config/metrics_config` pelo admin | Segurança | Regras Firestore: escrita apenas para role `admin`; Server Action com `getServerSession` |
| `TOTAL_ASSESSORS` diverge entre Cloud Function e o que está salvo no Firestore para meses já fechados | Inconsistência histórica | Usar o valor do Firestore; re-agregar meses passados se necessário |

---

## Fluxo de Dados Proposto

```
Admin UI                       Firestore                      Cloud Function (mensal)
   │                               │                                   │
   ├── edita total_assessors ──→ config/metrics_config                 │
   │                               │                                   │
   │                           config/digital_team ←── lê ────────────┤
   │                           config/metrics_config ←── lê ──────────┤
   │                               │                                   │
   │                      metrics/{date}/users/ ←── lê 90 dias ───────┤
   │                               │                                   │
   │                      metrics_summary/{M} ←── escreve ────────────┘
   │                         ├── adoption.*
   │                         ├── persistence.*  (novo)
   │                         ├── digital.*      (novo)
   │                         └── [sem intensity]
   │                               │
   │  ReportAnalyzerMetricsTab ←── AI Service /api/report/metrics-summary
```

---

## Draft de Requisitos para /define

### REQ-1: Total de Assessores Configurável

- [ ] Criar documento `config/metrics_config` no Firestore com campo `total_assessors: 139`
- [ ] Cloud Function lê `total_assessors` do Firestore no início da execução (fallback: `139`)
- [ ] Frontend admin exibe campo editável "Total de Assessores" em `ReportAnalyzerMetricsTab.tsx`
- [ ] Server Action `updateTotalAssessors(value: number)` em `admin/actions.ts` que valida (inteiro > 0) e escreve no Firestore
- [ ] Corrigir valor atual de `213` para `139`

### REQ-2: Persistência de Uso

- [ ] Novo campo `persistence: { users_3m_streak: int }` em `metrics_summary/{M}`
- [ ] Remover campo `intensity` dos novos docs (manter nos históricos)
- [ ] `aggregator.py`: nova função `_compute_persistence(db, current_month)` que:
  - Coleta set de UIDs ativos nos meses M, M-1 e M-2
  - Retorna `len(set_M ∩ set_M-1 ∩ set_M-2)`
- [ ] Otimização: salvar `active_uids` (lista, sem PII extra além do UID já presente) no campo `adoption.active_uids` do summary para meses fechados
- [ ] Frontend: substituir card "Intensidade" por "Persistência de Uso" com valor `users_3m_streak`
- [ ] Tabela histórica: coluna "Intensidade" → "Persistência" com tratamento de meses sem o campo

### REQ-3: Métricas do Digital

- [ ] Cloud Function: nova função `_compute_digital_metrics(db, date_list, start_ts, end_ts)` que:
  - Lê `config/digital_team.emails` e resolve email→UID via `users/`
  - Filtra métricas pelos UIDs digitais
  - Calcula `mau`, `mau_percent`, `total_analyses`, `users_3m_streak`
- [ ] Salvar como `digital: {...}` no documento `metrics_summary/{M}`
- [ ] AI Service: expor campo `digital` no `MetricsSummaryItem` (opcional para retrocompat)
- [ ] Frontend: seção "Segmento Digital" com 4 cards e colunas na tabela

---

## Arquivos a Criar / Alterar

| Arquivo | Tipo | Motivo |
|---------|------|--------|
| `functions/metrics_aggregator/config.py` | Alterar | Remover `TOTAL_ASSESSORS` hardcoded |
| `functions/metrics_aggregator/aggregator.py` | Alterar | Ler config do Firestore, `_compute_persistence`, `_compute_digital_metrics` |
| `functions/metrics_aggregator/tests/test_aggregator.py` | Alterar | Novos testes para persistência e digital |
| `ai-service/app/models/requests.py` | Alterar | Schema: `intensity` → `persistence`, adicionar `digital` |
| `ai-service/app/api/report.py` | Alterar | Expor campos novos no endpoint |
| `src/app/admin/components/ReportAnalyzerMetricsTab.tsx` | Alterar | Editable input, card persistência, seção digital |
| `src/app/admin/actions.ts` | Alterar | `updateTotalAssessors` Server Action |
| `src/app/admin/lib/report_analyzer_metrics_service.ts` | Alterar | Schema atualizado |

---

## Status: ✅ Complete (Defined)

> Define gerado em `docs/DEFINE_METRICAS_EVOLUTION.md`
