# DESIGN: Evolução das Métricas do Report Analyzer

> Especificação técnica para as três evoluções: total de assessores configurável, persistência de uso (substitui intensidade) e métricas segmentadas para o time digital.

| Atributo | Valor |
|----------|-------|
| **Feature** | Evolução das Métricas – Report Analyzer |
| **Input** | `docs/DEFINE_METRICAS_EVOLUTION.md` |
| **Fase** | 2 – Design |
| **Status** | ✅ Complete (Built) |
| **Próximo passo** | `/ship` — re-agregar histórico (ver §10) e validar em produção |

---

## 1. Análise dos Requisitos

- **REQ-1 (Assessores):** `TOTAL_ASSESSORS = 213` hardcoded em `config.py` → mover para Firestore `config/metrics_config.total_assessors`; valor correto = `139`; admin edita via painel sem redeploy.
- **REQ-2 (Persistência):** Substituir `intensity.analyses_per_assessor_avg` por `persistence.users_3m_streak` — count de UIDs que usaram o sistema nos 3 meses consecutivos M, M-1, M-2.
- **REQ-3 (Digital):** Adicionar subcampo `digital` ao documento mensal com MAU, MAU%, volume e persistência do time digital. Identificação de usuários digitais via resolução `config/digital_team.emails → UID` (lida uma vez por ciclo de aggregação) — **não** via campo `sector` nos docs diários (ver Decisão 3).
- **Pré-condição importante:** O `aggregator.py` atual possui `_compute_digital_analyses` baseado em `sector == 'digital'`. Esse mecanismo será substituído pela resolução email→UID descrita na Decisão 3.

---

## 2. Estado Atual do Firestore (verificado em produção)

```
config /
  digital_team               # emails: string[] — time digital (~7 membros)
  metrics_config             # [NOVO] total_assessors: int

metrics /
  {YYYY-MM-DD} /             # ex: 2026-02-05
    users /
      {uid}                  # doc ID = UID hash (ex: 1n2a2xwnboNZCoEV5zD1jbLXpZT2)
                             # campos: automatica, personalized, ultra_batch_runs[],
                             #         sector?, date, last_updated
    total /
      total                  # único doc na subcoleção
                             # campos: automatica, personalized,
                             #         ultra_batch_total_files, date, last_updated

ultra_batch_jobs /
  {jobId}                    # status, successCount, failureCount, created_at, ...

metrics_summary /
  {YYYY-MM}                  # estrutura VARIA por época de criação (ver abaixo)
```

### Variação histórica de `metrics_summary/{YYYY-MM}` (verificado em produção)

| Epoch | Campos presentes | Observação |
|-------|-----------------|------------|
| Aggregator v1 (ex: `2025-12`) | `adoption`, `closed`, `intensity`, `month`, `quality`, `scale`, `volume.{total_analyses}` | `volume` tem só `total_analyses`; sem `digital_analyses`/`rest_analyses` |
| Aggregator v2 (ex: `2026-01`+) | + `volume.{digital_analyses, rest_analyses}` | Campos extras ignorados pelo Pydantic; sem impacto no frontend |
| Pós-deploy desta evolução | + `persistence`, `digital`, `adoption.active_uids` (em closed) | `intensity` deixa de ser gravado; `volume` mantém apenas `total_analyses` |

---

## 3. Arquitetura da Solução

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                    FLUXO EVOLUÍDO — MÉTRICAS REPORT ANALYZER                     │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  Cloud Scheduler (cron diário)                                                   │
│       │                                                                          │
│       ▼  HTTP POST                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────┐     │
│  │  Cloud Function – metrics_aggregator                                    │     │
│  │                                                                         │     │
│  │  1. _read_total_assessors(db)     ←── config/metrics_config            │     │
│  │  2. _load_digital_uids(db)        ←── config/digital_team.emails       │     │
│  │     └── users.where("email","==", e) para cada email (~7 leituras)     │     │
│  │  3. _collect_active_uids(db, dates)              → set[uid] global     │     │
│  │  4. _collect_active_uids(db, dates, filter_uids) → set[uid] digital    │     │
│  │  5. _get_uids_for_month(db, M-1/M-2)                                   │     │
│  │     └── lê adoption.active_uids do summary (se closed) ou relê metrics/│     │
│  │  6. _compute_persistence(uids_m, uids_m1, uids_m2) → int               │     │
│  │  7. _compute_volume_and_ultra_files(db, dates)                          │     │
│  │  8. _compute_quality_and_scale(db, start, end)                         │     │
│  │  9. Escreve metrics_summary/{YYYY-MM}                                   │     │
│  └─────────────────────────────────────────────────────────────────────────┘     │
│       │                                                                          │
│       ▼                                                                          │
│  Firestore: metrics_summary/{YYYY-MM}                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐     │
│  │  adoption:    { mau, mau_percent, active_uids? }                        │     │
│  │  volume:      { total_analyses }                                        │     │
│  │  persistence: { users_3m_streak }      ← NOVO (substitui intensity)    │     │
│  │  quality:     { ultra_batch_success_rate_pct, ... }                    │     │
│  │  scale:       { pct_volume_ultra_batch }                                │     │
│  │  digital:     { mau, mau_percent, total_analyses, users_3m_streak }    │     │
│  └─────────────────────────────────────────────────────────────────────────┘     │
│       │                                                                          │
│       ▼                                                                          │
│  AI Service  GET /api/report/metrics-summary                                    │
│  ┌─────────────────────────────────────────────────────────────────────────┐     │
│  │  MetricsSummaryItem (Pydantic) – campos novos opcionais                 │     │
│  └─────────────────────────────────────────────────────────────────────────┘     │
│       │                                                                          │
│       ▼                                                                          │
│  Next.js Admin  page.tsx → <TabsContent value="report-analyzer">              │
│  ┌─────────────────────────────────────────────────────────────────────────┐     │
│  │  <Tabs> (sub-abas, padrão idêntico ao Chat/RAG)                        │     │
│  │  ├── "Análise Geral"  → ReportAnalyzerMetricsTab.tsx                   │     │
│  │  │     [Input total_assessors editável]                                 │     │
│  │  │     Cards: MAU% | Volume | Persistência | Qualidade x2 | Escala     │     │
│  │  └── "Análise Digital" → DigitalMetricsTab.tsx  [NOVO]                 │     │
│  │        Cards: MAU Digital | MAU% Digital | Volume Digital | Persist.    │     │
│  │        Seletor de período + Tabela histórica digital                    │     │
│  └─────────────────────────────────────────────────────────────────────────┘     │
│                                                                                  │
│  Admin UI  → Server Action updateTotalAssessors → config/metrics_config          │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Decisões de Arquitetura

### Decisão 1: Fonte de verdade para `total_assessors`

| Atributo | Valor |
|----------|-------|
| **Status** | Aceita |
| **Data** | 2026-03-03 |

**Contexto:** `TOTAL_ASSESSORS = 213` está hardcoded em `config.py`. Toda mudança exige redeploy.

**Escolha:** Mover para Firestore `config/metrics_config.total_assessors`, lido no início de cada execução da Cloud Function. O painel admin escreve nesse documento via Server Action.

**Racional:** Segue o padrão já adotado pelo projeto (`config/digital_team` é a fonte de verdade do time digital). Sem custo de redeploy. Leitura única por ciclo mensal — custo Firestore negligível.

**Alternativas rejeitadas:**
1. Variável de ambiente na Cloud Function — frontend não consegue escrever; exige redeploy ou atualização manual no GCP Console.
2. Endpoint `/api/config/metrics` no AI Service — camada extra sem ganho; Firestore é mais direto.

**Consequências:** Cloud Function precisa de permissão de leitura em `config/` (já tem, pois acessa `config/digital_team`). Fallback para `139` garante que a Function não falha se o doc não existir.

---

### Decisão 2: Cálculo de persistência com UIDs intermediários

| Atributo | Valor |
|----------|-------|
| **Status** | Aceita |
| **Data** | 2026-03-03 |

**Contexto:** Para calcular usuários com 3 meses consecutivos, precisamos dos sets de UIDs ativos em M, M-1 e M-2. Atualmente `_compute_mau` retorna apenas o count, descartando os UIDs.

**Escolha:** Refatorar `_compute_mau` → `_collect_active_uids(db, date_list, sector=None) -> set[str]`. Para meses já fechados (`closed=True`), armazenar `adoption.active_uids` e `adoption.digital_active_uids` no documento de summary. O mês seguinte lê essas listas em vez de reler `metrics/{date}/users/` por 60 dias.

**Racional:** Elimina a releitura de 60 dias de dados Firestore a cada execução. Para o primeiro ciclo (sem histórico), a Cloud Function relê os dados brutos normalmente — sem comportamento especial.

**Alternativas rejeitadas:**
1. Calcular persistência no AI Service / frontend — dados brutos exigem muitas leituras Firestore por request; sem persistência histórica.
2. Coleção separada `metrics_persistence/{YYYY-MM}` — over-engineering; o campo cabe no documento existente.

**Consequências:** Documento `metrics_summary` ganha `adoption.active_uids: list[str]` (apenas em meses fechados). Estimativa de tamanho: 139 UIDs × ~36 bytes ≈ 5 KB. Muito abaixo do limite de 1 MB do Firestore. `active_uids` **não é exposto pela API** (campo interno ao aggregator).

---

### Decisão 3: Identificação de usuários digitais via resolução email→UID

| Atributo | Valor |
|----------|-------|
| **Status** | Aceita (revisão da decisão original) |
| **Data** | 2026-03-03 |

**Contexto:** Duas abordagens foram avaliadas:
- **`sector == 'digital'` nos docs diários**: o AI Service grava esse campo via `digital_whitelist.py` no momento de cada uso. Parece conveniente, mas tem dois problemas sérios:
  1. **Falha retroativa**: quem entrar no time digital *depois* de já ter usado o sistema não terá `sector` gravado nos docs passados → cálculo de persistência de 3 meses incorreto para esses casos.
  2. **Cache stale**: `digital_whitelist.py` usa cache de 5 minutos em memória; se o cache estava desatualizado no `record_metric_call`, o `sector` pode não ser gravado mesmo para usuários digitais.
- **Resolução email→UID no aggregator**: lê `config/digital_team.emails` uma vez por ciclo de aggregação e resolve para UIDs via `users.where("email", "==", email)`. Filtra métricas diárias pelos UIDs encontrados.

**Escolha:** Resolução email→UID a cada execução do aggregator, descartando dependência do campo `sector` para filtragem digital.

**Racional:** O time digital tem ~7 membros (conforme `config/digital_team`). Resolver 7 emails para UIDs custa 7 leituras Firestore por aggregação mensal — custo absolutamente negligível. A abordagem garante que `config/digital_team.emails` é a única fonte de verdade, sem depender de campo gravado de forma eventual/cacheada pelo AI Service. `sector` continua sendo gravado pelo AI Service (para análise futura), mas o aggregator não depende dele.

**Alternativas rejeitadas:**
1. `sector == 'digital'` — dados históricos incorretos para membros adicionados ao time depois de usarem o sistema; cache stale do `digital_whitelist` pode omitir gravações.
2. `where("email", "in", [list])` em lote — a coleção `users/` não tem índice em `email`; queries `in` Firestore têm limite de 30 elementos. Queries individuais por email são mais simples e o time tem 7 pessoas.
3. Calcular digital no AI Service on-the-fly — latência alta; sem histórico persistido.

**Re-agregação histórica:** Como a resolução email→UID ocorre **na hora da agregação** (não na hora do uso), é possível e recomendado re-executar `run_monthly_aggregation` para meses passados após o deploy. Os dados brutos `metrics/{YYYY-MM-DD}/users/{uid}` ainda existem no Firestore. Ver §10 para o plano de re-agregação.

**Consequências:**
- Nova função `_load_digital_uids(db) -> set[str]` no aggregator.
- `_collect_active_uids` aceita parâmetro `filter_uids: set[str] | None` no lugar de `sector: str | None`.
- `digital_team_size = len(digital_emails)` (já lido no mesmo passo).
- Campo `sector` nos docs diários: mantido pelo AI Service, mas ignorado pelo aggregator.

---

### Decisão 4: Retrocompatibilidade do campo `intensity`

| Atributo | Valor |
|----------|-------|
| **Status** | Aceita |
| **Data** | 2026-03-03 |

**Contexto:** Documentos históricos no Firestore têm `intensity.analyses_per_assessor_avg`; novos documentos terão `persistence.users_3m_streak`. O frontend e o modelo Pydantic precisam tratar ambos.

**Escolha:** No modelo Pydantic (`MetricsSummaryItem`), `intensity` vira `Optional` e `persistence` vira `Optional`. O aggregator para de gravar `intensity` em novos documentos. O frontend usa `persistence?.users_3m_streak ?? null` e exibe `—` quando ausente.

**Alternativas rejeitadas:**
1. Manter `intensity` para sempre — confunde o significado da métrica; contradiz o requisito.
2. Reprocessar todos os meses históricos — operação custosa e desnecessária para o MVP.

**Consequências:** Documentos históricos exibem `—` na coluna "Persistência". Meses novos exibem `—` na coluna legada "Intensidade" (que será removida do frontend).

---

## 5. Schema do Documento `metrics_summary/{YYYY-MM}`

### Schema atual — aggregator v1 (ex: `2025-12`, confirmado em produção)

```json
{
  "month": "2025-12",
  "closed": true,
  "adoption":  { "mau": 42, "mau_percent": 19.72 },
  "volume":    { "total_analyses": 2432 },
  "intensity": { "analyses_per_assessor_avg": 57.9 },
  "quality":   { "ultra_batch_success_rate_pct": 99.95, "ultra_batch_jobs_completed_rate_pct": 100 },
  "scale":     { "pct_volume_ultra_batch": 89.56 },
  "updated_at": "..."
}
```

### Schema atual — aggregator v2 (ex: `2026-01`+, versão em produção hoje)

```json
{
  "month": "2026-02",
  "closed": false,
  "adoption":  { "mau": 50, "mau_percent": 23.47 },
  "volume":    { "total_analyses": 8500, "digital_analyses": 1200, "rest_analyses": 7300 },
  "intensity": { "analyses_per_assessor_avg": 170.0 },
  "quality":   { "ultra_batch_success_rate_pct": 95.2, "ultra_batch_jobs_completed_rate_pct": 99.1 },
  "scale":     { "pct_volume_ultra_batch": 42.0 },
  "updated_at": "..."
}
```

> `volume.digital_analyses` e `volume.rest_analyses` existem no Firestore (v2+), mas são ignorados pelo modelo Pydantic (`MetricsSummaryVolume` expõe apenas `total_analyses`). Sem impacto no frontend.

### Schema completo pós-evolução — mês aberto (novos docs)

```json
{
  "month": "2026-03",
  "closed": false,
  "adoption": {
    "mau": 72,
    "mau_percent": 51.8
  },
  "volume": {
    "total_analyses": 11200
  },
  "persistence": {
    "users_3m_streak": 45
  },
  "quality": {
    "ultra_batch_success_rate_pct": 96.0,
    "ultra_batch_jobs_completed_rate_pct": 99.5
  },
  "scale": {
    "pct_volume_ultra_batch": 48.0
  },
  "digital": {
    "mau": 12,
    "mau_percent": 80.0,
    "total_analyses": 3200,
    "users_3m_streak": 9
  },
  "updated_at": "2026-03-01T01:00:00Z"
}
```

### Schema completo pós-evolução — mês fechado (com campos auxiliares para persistência)

```json
{
  "month": "2026-02",
  "closed": true,
  "adoption": {
    "mau": 50,
    "mau_percent": 35.97,
    "active_uids": ["uid1", "uid2", "..."],
    "digital_active_uids": ["uid3", "uid4"]
  },
  "volume":      { "total_analyses": 8500 },
  "persistence": { "users_3m_streak": 30 },
  "quality":     { "ultra_batch_success_rate_pct": 95.2, "ultra_batch_jobs_completed_rate_pct": 99.1 },
  "scale":       { "pct_volume_ultra_batch": 42.0 },
  "digital":     { "mau": 6, "mau_percent": 85.7, "total_analyses": 1200, "users_3m_streak": 5 },
  "updated_at":  "2026-03-01T01:00:00Z"
}
```

> **Notas:**
> - `adoption.active_uids` e `adoption.digital_active_uids` são gravados **apenas em meses fechados** (`closed=True`). São campos internos — não expostos pela API ao frontend.
> - `intensity` **não aparece** em documentos novos. Documentos históricos mantêm o campo.
> - `digital.mau_percent = digital.mau / digital_team_size * 100` onde `digital_team_size = len(config/digital_team.emails)`.
> - `mau_percent` usa `total_assessors = 139` (fonte: `config/metrics_config`) — docs históricos foram calculados com `213` (errado).

### Novo documento: `config/metrics_config`

```json
{
  "total_assessors": 139
}
```

---

## 6. Padrões de Código

### 6.1 `functions/metrics_aggregator/config.py`

```python
import os
from typing import Final

# TOTAL_ASSESSORS removido — lido dinamicamente do Firestore
DEFAULT_TOTAL_ASSESSORS: Final[int] = 139
COLLECTION_METRICS: Final[str] = "metrics"
COLLECTION_METRICS_SUMMARY: Final[str] = "metrics_summary"
COLLECTION_ULTRA_BATCH_JOBS: Final[str] = "ultra_batch_jobs"
COLLECTION_CONFIG: Final[str] = "config"
COLLECTION_USERS: Final[str] = "users"          # para resolução email→UID
DOC_METRICS_CONFIG: Final[str] = "metrics_config"
DOC_DIGITAL_TEAM: Final[str] = "digital_team"
SUBDOC_USERS: Final[str] = "users"
SUBDOC_TOTAL: Final[str] = "total"
DOC_TOTAL: Final[str] = "total"
TIMEZONE_UTC: Final[str] = "UTC"
MAX_MONTHS_QUERY: Final[int] = int(os.environ.get("METRICS_SUMMARY_MAX_MONTHS", "24"))
```

---

### 6.2 Novas funções em `functions/metrics_aggregator/aggregator.py`

#### `_read_total_assessors`

```python
def _read_total_assessors(db: firestore.Client) -> int:
    """Lê total_assessors do Firestore; fallback para DEFAULT_TOTAL_ASSESSORS."""
    try:
        doc = (
            db.collection(COLLECTION_CONFIG)
            .document(DOC_METRICS_CONFIG)
            .get()
        )
        if doc.exists:
            value = (doc.to_dict() or {}).get("total_assessors")
            if isinstance(value, int) and value > 0:
                return value
    except Exception as e:
        logger.warning("Falha ao ler total_assessors do Firestore: %s. Usando fallback=%d", e, DEFAULT_TOTAL_ASSESSORS)
    return DEFAULT_TOTAL_ASSESSORS
```

#### `_load_digital_uids` (resolve email→UID a partir de `config/digital_team`)

```python
def _load_digital_uids(db: firestore.Client) -> tuple[set[str], int]:
    """
    Lê config/digital_team.emails e resolve cada email para UID via users/{uid}.email.

    Retorna:
        (digital_uids, digital_team_size)
        - digital_uids: set de UIDs encontrados no Firestore para os emails do time
        - digital_team_size: len(emails) — usado como denominador do mau_percent digital

    Estratégia de resolução: para cada email, consulta users/ com
    where("email", "==", email).limit(1). O time digital tem ~7 membros,
    portanto o custo é ~7 leituras por execução mensal (negligível).
    """
    try:
        config_doc = db.collection(COLLECTION_CONFIG).document(DOC_DIGITAL_TEAM).get()
        if not config_doc.exists:
            logger.warning("config/digital_team não encontrado; métricas digitais zeradas.")
            return set(), 0
        emails: list[str] = [
            e.strip().lower()
            for e in ((config_doc.to_dict() or {}).get("emails") or [])
            if isinstance(e, str) and e.strip()
        ]
        digital_team_size = len(emails)
    except Exception as e:
        logger.error("Falha ao ler config/digital_team: %s", e)
        return set(), 0

    digital_uids: set[str] = set()
    users_col = db.collection(COLLECTION_USERS)
    for email in emails:
        try:
            docs = list(users_col.where("email", "==", email).limit(1).stream())
            if docs:
                digital_uids.add(docs[0].id)
            else:
                logger.warning("Email digital sem UID correspondente: %s", email)
        except Exception as e:
            logger.warning("Falha ao resolver email→UID para %s: %s", email, e)

    logger.info(
        "Time digital: %d emails, %d UIDs resolvidos", digital_team_size, len(digital_uids)
    )
    return digital_uids, digital_team_size
```

> **Nota sobre `COLLECTION_USERS`:** adicionar `COLLECTION_USERS: Final[str] = "users"` em `config.py`.

#### `_collect_active_uids` (refatora `_compute_mau`)

```python
def _collect_active_uids(
    db: firestore.Client,
    date_list: list[str],
    filter_uids: set[str] | None = None,
) -> set[str]:
    """
    Retorna o set de UIDs ativos no período.
    Se `filter_uids` for fornecido, retorna apenas a interseção com esse conjunto.

    Para métricas globais: filter_uids=None (todos os usuários).
    Para métricas digitais: filter_uids=digital_uids (resolvidos por _load_digital_uids).
    NÃO usa o campo 'sector' — fonte de verdade é config/digital_team.emails.
    """
    seen: set[str] = set()
    for date_str in date_list:
        users_ref = (
            db.collection(COLLECTION_METRICS)
            .document(date_str)
            .collection(SUBDOC_USERS)
        )
        for doc in users_ref.stream():
            if filter_uids is not None and doc.id not in filter_uids:
                continue
            data = doc.to_dict() or {}
            automatica = data.get("automatica") or 0
            personalized = data.get("personalized") or 0
            ultra_batch_runs = data.get("ultra_batch_runs") or []
            if automatica > 0 or personalized > 0 or len(ultra_batch_runs) > 0:
                seen.add(doc.id)
    return seen
```

#### `_get_uids_for_month` (lê do summary ou relê Firestore)

```python
def _get_uids_for_month(
    db: firestore.Client,
    month_key: str,
    uid_field: str = "active_uids",
) -> set[str]:
    """
    Retorna UIDs de um mês a partir de active_uids no summary (se disponível),
    ou relendo os dados brutos do Firestore (fallback).
    uid_field: 'active_uids' para global, 'digital_active_uids' para digital.
    """
    ref = db.collection(COLLECTION_METRICS_SUMMARY).document(month_key)
    doc = ref.get()
    if doc.exists:
        data = doc.to_dict() or {}
        adoption = data.get("adoption") or {}
        cached = adoption.get(uid_field)
        if isinstance(cached, list) and cached:
            return set(cached)

    # Fallback: reler dados brutos
    parts = month_key.split("-")
    year, month = int(parts[0]), int(parts[1])
    date_list = _month_range(year, month)
    sector_filter = "digital" if uid_field == "digital_active_uids" else None
    return _collect_active_uids(db, date_list, sector=sector_filter)
```

#### `_compute_persistence`

```python
def _compute_persistence(
    uids_m: set[str],
    uids_m1: set[str],
    uids_m2: set[str],
) -> int:
    """Retorna o count de UIDs presentes nos 3 meses consecutivos."""
    return len(uids_m & uids_m1 & uids_m2)
```

#### `_compute_digital_volume`

```python
def _compute_digital_volume(
    db: firestore.Client,
    date_list: list[str],
    digital_uids: set[str],
) -> int:
    """
    Soma de análises (automatica + personalized + ultra_batch files) dos UIDs do time digital.
    digital_uids é o set resolvido por _load_digital_uids — NÃO usa campo sector.
    """
    total = 0
    for date_str in date_list:
        users_ref = (
            db.collection(COLLECTION_METRICS)
            .document(date_str)
            .collection(SUBDOC_USERS)
        )
        for doc in users_ref.stream():
            if doc.id not in digital_uids:
                continue
            data = doc.to_dict() or {}
            automatica = data.get("automatica") or 0
            personalized = data.get("personalized") or 0
            runs = data.get("ultra_batch_runs") or []
            file_count = sum(r.get("file_count") or 0 for r in runs)
            total += automatica + personalized + file_count
    return total
```

---

### 6.3 `run_monthly_aggregation` atualizado

```python
def run_monthly_aggregation(
    db: firestore.Client,
    month_key: str,
    closed: bool,
) -> None:
    parts = month_key.split("-")
    year, month = int(parts[0]), int(parts[1])
    date_list = _month_range(year, month)
    start_ts, end_ts = _get_month_bounds(year, month)

    # REQ-1: lê total_assessors do Firestore
    total_assessors = _read_total_assessors(db)

    # REQ-3: resolve emails → UIDs do time digital (fonte: config/digital_team.emails)
    digital_uids, digital_team_size = _load_digital_uids(db)

    # Coleta UIDs ativos do mês atual
    active_uids = _collect_active_uids(db, date_list)                        # global
    digital_uids_active = _collect_active_uids(db, date_list, filter_uids=digital_uids)  # digital

    mau = len(active_uids)
    digital_mau = len(digital_uids_active)
    mau_percent = (mau / total_assessors * 100.0) if total_assessors else 0.0
    digital_mau_percent = (digital_mau / digital_team_size * 100.0) if digital_team_size else 0.0

    # REQ-2: persistência (interseção com M-1 e M-2)
    prev1 = _prev_month(month_key)
    prev2 = _prev_month(prev1)
    uids_m1 = _get_uids_for_month(db, prev1, "active_uids")
    uids_m2 = _get_uids_for_month(db, prev2, "active_uids")
    d_uids_m1 = _get_uids_for_month(db, prev1, "digital_active_uids")
    d_uids_m2 = _get_uids_for_month(db, prev2, "digital_active_uids")

    persistence = _compute_persistence(active_uids, uids_m1, uids_m2)
    digital_persistence = _compute_persistence(digital_uids_active, d_uids_m1, d_uids_m2)

    # Volume
    total_analyses, ultra_total = _compute_volume_and_ultra_files(db, date_list)
    digital_total_analyses = _compute_digital_volume(db, date_list, digital_uids)
    pct_volume_ultra_batch = (ultra_total / total_analyses * 100.0) if total_analyses else 0.0

    # Qualidade
    success_rate_pct, jobs_completed_rate_pct, _ = _compute_quality_and_scale(db, start_ts, end_ts)

    # Monta payload
    adoption_payload: dict = {"mau": mau, "mau_percent": round(mau_percent, 2)}
    if closed:
        adoption_payload["active_uids"] = list(active_uids)
        adoption_payload["digital_active_uids"] = list(digital_uids_active)

    payload: dict = {
        "month": month_key,
        "closed": closed,
        "adoption": adoption_payload,
        "volume": {"total_analyses": total_analyses},
        "persistence": {"users_3m_streak": persistence},
        "quality": {
            "ultra_batch_success_rate_pct": round(success_rate_pct, 2),
            "ultra_batch_jobs_completed_rate_pct": round(jobs_completed_rate_pct, 2),
        },
        "scale": {"pct_volume_ultra_batch": round(pct_volume_ultra_batch, 2)},
        "digital": {
            "mau": digital_mau,
            "mau_percent": round(digital_mau_percent, 2),
            "total_analyses": digital_total_analyses,
            "users_3m_streak": digital_persistence,
        },
        "updated_at": firestore.SERVER_TIMESTAMP,
    }

    db.collection(COLLECTION_METRICS_SUMMARY).document(month_key).set(payload)
    logger.info(
        "Agregação mensal: %s closed=%s mau=%d persist=%d digital_mau=%d",
        month_key, closed, mau, persistence, digital_mau,
    )


def _prev_month(month_key: str) -> str:
    year, month = int(month_key[:4]), int(month_key[5:7])
    if month == 1:
        return f"{year - 1}-12"
    return f"{year}-{month - 1:02d}"
```

---

### 6.4 `ai-service/app/models/requests.py` — novos modelos

```python
class MetricsSummaryAdoption(BaseModel):
    mau: int = 0
    mau_percent: float = 0.0
    # active_uids não exposto na API (campo interno do aggregator)

class MetricsSummaryVolume(BaseModel):
    total_analyses: int = 0

# NOVO — substitui MetricsSummaryIntensity
class MetricsSummaryPersistence(BaseModel):
    users_3m_streak: int = 0

# Mantido como Optional para retrocompatibilidade com docs históricos
class MetricsSummaryIntensity(BaseModel):
    analyses_per_assessor_avg: float = 0.0

class MetricsSummaryQuality(BaseModel):
    ultra_batch_success_rate_pct: float = 0.0
    ultra_batch_jobs_completed_rate_pct: float = 0.0

class MetricsSummaryScale(BaseModel):
    pct_volume_ultra_batch: float = 0.0

# NOVO
class MetricsSummaryDigital(BaseModel):
    mau: int = 0
    mau_percent: float = 0.0
    total_analyses: int = 0
    users_3m_streak: int = 0

class MetricsSummaryItem(BaseModel):
    month: str = Field(..., description="YYYY-MM")
    closed: bool = False
    adoption: Optional[MetricsSummaryAdoption] = None
    volume: Optional[MetricsSummaryVolume] = None
    persistence: Optional[MetricsSummaryPersistence] = None   # NOVO
    intensity: Optional[MetricsSummaryIntensity] = None       # LEGADO (retrocompat)
    quality: Optional[MetricsSummaryQuality] = None
    scale: Optional[MetricsSummaryScale] = None
    digital: Optional[MetricsSummaryDigital] = None           # NOVO
    updated_at: Optional[Any] = None
```

---

### 6.5 `src/app/admin/lib/report_analyzer_metrics_service.ts`

```typescript
export interface MetricsSummaryPersistence {
  users_3m_streak: number;
}

export interface MetricsSummaryDigital {
  mau: number;
  mau_percent: number;
  total_analyses: number;
  users_3m_streak: number;
}

export interface MetricsSummaryItem {
  month: string;
  closed: boolean;
  // adoption e volume sempre presentes em todos os docs conhecidos
  adoption: { mau: number; mau_percent: number };
  // volume: Optional defensivo para docs muito antigos (se existirem antes de 2025-12)
  // Docs v1 têm apenas total_analyses; docs v2+ têm também digital_analyses/rest_analyses (ignorados)
  volume?: { total_analyses: number };
  // persistence: presente em docs pós-deploy E em meses históricos após re-agregação (DESIGN §10)
  persistence?: MetricsSummaryPersistence;
  // intensity: presente apenas em docs históricos não re-agregados (legacy)
  intensity?: { analyses_per_assessor_avg: number };
  // quality e scale sempre presentes
  quality: {
    ultra_batch_success_rate_pct: number;
    ultra_batch_jobs_completed_rate_pct: number;
  };
  scale: { pct_volume_ultra_batch: number };
  // digital: presente em docs pós-deploy E em meses históricos após re-agregação (DESIGN §10)
  digital?: MetricsSummaryDigital;
  updated_at?: string;
}
```

> **Regras de exibição no frontend por campo Optional:**
> | Campo | Se ausente | Contexto |
> |-------|-----------|---------|
> | `volume` | exibir `—` no card (improvável, apenas docs muito antigos) | defensivo |
> | `persistence` | exibir `—` na coluna/card | docs não re-agregados ainda |
> | `intensity` | ignorar (não exibir) | docs pós-deploy ou re-agregados |
> | `digital` | ocultar seção digital / exibir placeholder | docs não re-agregados ainda |
>
> **Após re-agregação histórica concluída (DESIGN §10):** todos os meses de 2025-11 em diante terão `persistence` e `digital`. Os casos `—` acima devem desaparecer progressivamente.

---

### 6.6 `src/app/admin/actions.ts` — novas Server Actions

```typescript
export async function getTotalAssessors(): Promise<{ value: number } | { error: string }> {
  try {
    const { getFirestore } = await import('@/lib/firebase-admin');
    const db = getFirestore();
    const doc = await db.collection('config').doc('metrics_config').get();
    const value = doc.exists ? (doc.data()?.total_assessors ?? 139) : 139;
    return { value };
  } catch (e: any) {
    return { error: e?.message ?? 'Erro ao ler total_assessors' };
  }
}

export async function updateTotalAssessors(
  value: number
): Promise<{ success: boolean; error?: string }> {
  if (!Number.isInteger(value) || value <= 0) {
    return { success: false, error: 'Valor deve ser um inteiro positivo.' };
  }
  try {
    const { getFirestore } = await import('@/lib/firebase-admin');
    const db = getFirestore();
    await db.collection('config').doc('metrics_config').set(
      { total_assessors: value },
      { merge: true }
    );
    return { success: true };
  } catch (e: any) {
    console.error('Erro em updateTotalAssessors:', e);
    return { success: false, error: e?.message ?? 'Erro ao salvar.' };
  }
}
```

---

### 6.7 `ReportAnalyzerMetricsTab.tsx` — estrutura das mudanças

**Estado adicional:**
```typescript
const [totalAssessors, setTotalAssessors] = useState<number>(139);
const [editingAssessors, setEditingAssessors] = useState<number>(139);
const [savingAssessors, setSavingAssessors] = useState(false);
```

**Card de Persistência (substitui Intensidade):**
```tsx
<Card>
  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
    <CardTitle className="text-sm font-medium">Persistência de Uso</CardTitle>
    <Repeat className="h-4 w-4 text-muted-foreground" />
  </CardHeader>
  <CardContent>
    <div className={cn('text-2xl font-bold',
      metricColor(latestSummary.persistence?.users_3m_streak ?? 0, TARGETS.persistence_3m_streak)
    )}>
      {latestSummary.persistence?.users_3m_streak ?? '—'}
    </div>
    <p className="text-xs text-muted-foreground">
      usuários 3 meses seguidos | Meta: ≥ {TARGETS.persistence_3m_streak}
    </p>
  </CardContent>
</Card>
```

**Target adicionado:**
```typescript
const TARGETS = {
  // ...existentes...
  persistence_3m_streak: 30,        // novo
  digital_mau_percent: 80,          // novo
} as const;
```

**Input de assessores (dentro do Card de filtros de `ReportAnalyzerMetricsTab.tsx`):**
```tsx
<div className="space-y-2">
  <Label htmlFor="total-assessors">Total de Assessores</Label>
  <div className="flex gap-2">
    <Input
      id="total-assessors"
      type="number"
      min={1}
      value={editingAssessors}
      onChange={(e) => setEditingAssessors(Number(e.target.value))}
      className="w-24"
    />
    <Button
      variant="outline"
      size="sm"
      disabled={savingAssessors || editingAssessors === totalAssessors}
      onClick={handleSaveAssessors}
    >
      {savingAssessors ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
    </Button>
  </div>
</div>
```

---

### 6.8 `src/app/admin/page.tsx` — wrappar de sub-abas no Report Analyzer

Substituir o bloco atual:
```tsx
<TabsContent value="report-analyzer" className="mt-4">
  <ReportAnalyzerMetricsTab />
</TabsContent>
```

Por:
```tsx
<TabsContent value="report-analyzer" className="mt-4">
  <Tabs defaultValue="geral" className="w-full">
    <TabsList>
      <TabsTrigger value="geral">Análise Geral</TabsTrigger>
      <TabsTrigger value="digital">Análise Digital</TabsTrigger>
    </TabsList>
    <TabsContent value="geral" className="mt-4">
      <ReportAnalyzerMetricsTab />
    </TabsContent>
    <TabsContent value="digital" className="mt-4">
      <DigitalMetricsTab />
    </TabsContent>
  </Tabs>
</TabsContent>
```

Adicionar import no topo:
```tsx
import DigitalMetricsTab from './components/DigitalMetricsTab';
```

---

### 6.9 `src/app/admin/components/DigitalMetricsTab.tsx` — estrutura do novo componente

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Users, BarChart2, Activity, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getReportAnalyzerMetricsSummary } from '../actions';
import type { MetricsSummaryItem } from '../lib/report_analyzer_metrics_service';

const TARGETS_DIGITAL = {
  mau_percent: 80,
  total_analyses: 2000,
  users_3m_streak: 10,
} as const;

function getDefaultDateRange() { /* mesmo padrão de ReportAnalyzerMetricsTab */ }
function metricColor(value: number, target: number) { /* mesmo padrão */ }

export default function DigitalMetricsTab() {
  const defaultRange = getDefaultDateRange();
  const [fromMonth, setFromMonth] = useState(defaultRange.from);
  const [toMonth, setToMonth] = useState(defaultRange.to);
  const [summaries, setSummaries] = useState<MetricsSummaryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (from: string, to: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getReportAnalyzerMetricsSummary(from, to);
      if (result && 'error' in result) { setError(result.error); setSummaries([]); }
      else { setSummaries(result.summaries ?? []); }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar métricas digitais.');
      setSummaries([]);
    } finally { setIsLoading(false); }
  }, []);

  useEffect(() => { fetchData(fromMonth, toMonth); }, []); // eslint-disable-line

  const latestSummary = summaries.length > 0 ? summaries[summaries.length - 1] : null;
  const digital = latestSummary?.digital;

  return (
    <div className="flex flex-col gap-6">
      {/* Card de seleção de período — idêntico ao ReportAnalyzerMetricsTab */}

      {digital && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {/* Card: MAU Digital */}
          {/* Card: MAU% Digital — com target 80% */}
          {/* Card: Volume Digital */}
          {/* Card: Persistência Digital */}
        </div>
      )}

      {/* Tabela histórica com colunas: Mês | MAU | MAU% | Volume | Persistência | Status */}
    </div>
  );
}
```

**Reutilização de dados:** `DigitalMetricsTab` consome o mesmo endpoint `/api/report/metrics-summary` (via `getReportAnalyzerMetricsSummary`) e lê `summary.digital` de cada item. Não há endpoint novo — o campo `digital` já estará no payload após a evolução do aggregator.

---

## 7. Manifesto de Arquivos

| # | Arquivo | Ação | Propósito | Dependências |
|---|---------|------|-----------|--------------|
| 1 | `functions/metrics_aggregator/config.py` | **Alterar** | Remover `TOTAL_ASSESSORS`; adicionar `DEFAULT_TOTAL_ASSESSORS`, `COLLECTION_CONFIG`, `DOC_METRICS_CONFIG`, `DOC_DIGITAL_TEAM` | — |
| 2 | `functions/metrics_aggregator/aggregator.py` | **Alterar** | `_read_total_assessors`, `_read_digital_team_size`, `_collect_active_uids`, `_get_uids_for_month`, `_compute_persistence`, `_compute_digital_volume`, `_prev_month`; atualizar `run_monthly_aggregation` | 1 |
| 3 | `functions/metrics_aggregator/tests/test_aggregator.py` | **Alterar** | Novos testes para AT-101..AT-104, AT-201..AT-205, AT-301..AT-306; atualizar mocks de `run_monthly_aggregation` | 2 |
| 4 | `ai-service/app/models/requests.py` | **Alterar** | Adicionar `MetricsSummaryPersistence`, `MetricsSummaryDigital`; tornar `intensity` `Optional`; atualizar `MetricsSummaryItem` | — |
| 5 | `ai-service/app/api/report.py` | **Alterar** | Sem mudança de lógica — Pydantic propaga campos novos automaticamente | 4 |
| 6 | `src/app/admin/lib/report_analyzer_metrics_service.ts` | **Alterar** | Atualizar `MetricsSummaryItem`: adicionar `persistence?`, `digital?`; manter `intensity?` como legado | — |
| 7 | `src/app/admin/actions.ts` | **Alterar** | Adicionar `getTotalAssessors()` e `updateTotalAssessors(value)` | 6 |
| 8 | `src/app/admin/components/ReportAnalyzerMetricsTab.tsx` | **Alterar** | Input editável `total_assessors`; card "Persistência de Uso" (substitui Intensidade); retrocompat para `intensity` histórico. **Sem** seção digital — ela fica em #9 | 6, 7 |
| 9 | `src/app/admin/components/DigitalMetricsTab.tsx` | **Criar** | Novo componente da sub-aba "Análise Digital": 4 cards (MAU, MAU%, Volume, Persistência Digital), seletor de período, tabela histórica. Consome o mesmo endpoint via `getReportAnalyzerMetricsSummary` | 6 |
| 10 | `src/app/admin/page.tsx` | **Alterar** | Envolver `<TabsContent value="report-analyzer">` com `<Tabs>` de sub-abas ("Análise Geral" / "Análise Digital"), importar `DigitalMetricsTab` | 8, 9 |

---

## 8. Estratégia de Testes

| Tipo | Escopo | Arquivo | Ferramenta | Acceptance Tests cobertos |
|------|--------|---------|-----------|--------------------------|
| Unit | `_read_total_assessors` fallback e doc ausente | `test_aggregator.py` | pytest | AT-101, AT-102 |
| Unit | `_collect_active_uids` com e sem filtro `sector` | `test_aggregator.py` | pytest | AT-301, AT-302, AT-303 |
| Unit | `_compute_persistence` interseção 3 meses | `test_aggregator.py` | pytest | AT-201, AT-202 |
| Unit | `_get_uids_for_month` — lê de cache e de fallback | `test_aggregator.py` | pytest | AT-205 |
| Unit | `run_monthly_aggregation` — payload com `persistence` e `digital` | `test_aggregator.py` | pytest | AT-304 |
| Unit | `updateTotalAssessors` — validação de entrada | Server Action (jest) | jest / vitest | AT-103, AT-104 |
| Integration | Frontend renderiza `—` para meses sem `persistence` | `ReportAnalyzerMetricsTab` | vitest + jsdom | AT-203, AT-204 |
| Integration | Sub-aba Digital renderiza cards com `digital` | `DigitalMetricsTab` | vitest + jsdom | AT-305, AT-306 |
| Integration | Navegação entre sub-abas não causa re-fetch desnecessário | `page.tsx` + ambos os tabs | vitest + jsdom | AT-307 |

### Padrão de mock para novos testes

```python
@patch("aggregator._read_total_assessors", return_value=139)
@patch("aggregator._load_digital_uids", return_value=({"u1", "u4"}, 7))  # 2 UIDs resolvidos, time=7
@patch("aggregator._compute_quality_and_scale")
@patch("aggregator._compute_volume_and_ultra_files")
@patch("aggregator._collect_active_uids")
def test_run_monthly_aggregation_new_schema(
    mock_uids, mock_vol, mock_qual, mock_load_digital, mock_assessors
):
    # _collect_active_uids chamado 2x: global (filter_uids=None) e digital (filter_uids={"u1","u4"})
    mock_uids.side_effect = [
        {"u1", "u2", "u3"},   # active_uids mês M (global, filter_uids=None)
        {"u1"},                # digital_uids_active mês M (filter_uids={"u1","u4"})
        # fallbacks para M-1 e M-2 via _get_uids_for_month (mocked via summary_ref.get)
    ]
    mock_vol.return_value = (100, 20)
    mock_qual.return_value = (95.0, 100.0, 100)
    db = MagicMock()
    summary_ref = MagicMock()
    db.collection.return_value.document.return_value = summary_ref
    # summary docs fechados não têm active_uids → força fallback
    summary_ref.get.return_value = MagicMock(exists=False)

    run_monthly_aggregation(db, "2026-03", closed=False)

    payload = summary_ref.set.call_args[0][0]
    assert "intensity" not in payload
    assert payload["persistence"]["users_3m_streak"] == 1   # u1 nos 3 meses
    assert payload["digital"]["mau"] == 1
    assert payload["digital"]["mau_percent"] == pytest.approx(1/7*100, abs=0.01)  # digital_team_size=7
    assert "active_uids" not in payload["adoption"]   # apenas em closed
```

---

## 9. Considerações de Segurança

| Item | Medida |
|------|--------|
| Escrita em `config/metrics_config` pelo admin | Server Action com `getServerSession` — verificar role `admin` antes de executar o `set` |
| `active_uids` no Firestore | Campo interno; não exposto pela API; Firestore Security Rules: leitura de `metrics_summary` apenas para serviços autorizados |
| Validação do input `total_assessors` | `Number.isInteger(value) && value > 0` no lado servidor (Server Action); não confiar em validação do frontend |
| Tamanho do doc `metrics_summary` | Estimativa: ~5 KB com `active_uids`; monitorar se base cresce |

---

---

## 10. Plano de Re-agregação Histórica

### Por que é possível

A nova lógica resolve os membros digitais a partir de `config/digital_team.emails` **durante a agregação**, não durante o uso. Os dados brutos `metrics/{YYYY-MM-DD}/users/{uid}` permanecem no Firestore indefinidamente. Logo, re-executar o aggregator para qualquer mês passado produz resultados corretos com a nova abordagem.

### Ordem de execução (da mais antiga para a mais recente)

```
run_monthly_aggregation(db, "2025-11", closed=True)
run_monthly_aggregation(db, "2025-12", closed=True)
run_monthly_aggregation(db, "2026-01", closed=True)
run_monthly_aggregation(db, "2026-02", closed=True)
# 2026-03 será atualizado diariamente pelo cron já existente
```

> **Por que da mais antiga para a mais recente:** `_compute_persistence` lê `adoption.active_uids` de M-1 e M-2 (otimização). Executando em ordem, cada mês fechado grava `active_uids`, que o próximo mês pode usar. Se executado fora de ordem, o fallback relê `metrics/{date}/users/` — resultado é idêntico, apenas mais lento.

### Como disparar (opções)

| Opção | Comando | Quando usar |
|-------|---------|-------------|
| HTTP direto | `POST /aggregate?month=2025-11&force=true` ao endpoint da Cloud Function | Via `curl` ou Console GCP |
| Script local | `python -c "from aggregator import run_monthly_aggregation; ..."` com credenciais ADC | Durante desenvolvimento/teste |
| Scheduler manual | Alterar cron para re-rodar manualmente via Console GCP | Se o endpoint HTTP não estiver exposto |

> **Verificar antes de disparar:** confirmar que `config/digital_team.emails` está correto e que todos os membros têm `email` preenchido em `users/` (A-02). Um email não resolvido gera apenas um `logger.warning` — o membro simplesmente não entra nos cálculos.

### Resultado esperado após re-agregação

Todos os documentos `metrics_summary/{YYYY-MM}` (de `2025-11` em diante) terão:
- `persistence.users_3m_streak` — calculado com UIDs reais
- `digital.{mau, mau_percent, total_analyses, users_3m_streak}` — calculado com UIDs do time digital atual
- `adoption.active_uids` e `adoption.digital_active_uids` — gravados (meses fechados)

### Observação sobre composição do time digital

A re-agregação usa `config/digital_team.emails` **no momento da execução**. Se um membro estiver na lista hoje mas não estava usando o sistema em 2025-11, ele simplesmente não aparecerá nas métricas daquele mês (correto). Se um membro foi removido da lista, não aparecerá mesmo que tenha usado — comportamento desejado (fonte de verdade = lista atual).

---

## Status: ✅ Complete (Built)
