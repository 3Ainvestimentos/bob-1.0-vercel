# DESIGN: Dashboard de métricas report_analyzer no painel admin

> Especificação técnica para exibir as métricas agregadas do report_analyzer em uma aba do painel administrativo.

| Atributo | Valor |
|----------|--------|
| **Feature** | Dashboard de métricas report_analyzer (painel admin) |
| **Input** | `docs/DEFINE_DASHBOARD_METRICAS_REPORT_ANALYZER.md` |
| **Fase** | 2 – Design |
| **Status** | Ready for Build |
| **Próximo passo** | /build |

---

## 1. Análise dos Requisitos (DEFINE)

- **Problema:** Admin não tem tela para ver métricas (MAU, volume, intensidade, qualidade, escala) do report_analyzer; dados já existem na API.
- **Objetivo:** Nova aba no painel admin que consome `GET /api/report/metrics-summary`, exibe as 6 métricas e metas de referência, com seleção de intervalo de meses.
- **Restrições:** Apenas role `admin`; usar API existente; manter padrões do painel (Next.js, Card, recharts).

---

## 2. Arquitetura da Solução

### 2.1 Visão geral

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                    DASHBOARD MÉTRICAS REPORT_ANALYZER (PAINEL ADMIN)                      │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                         │
│  Admin (browser)                                                                        │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │  /admin → page.tsx (Tabs: Análise Geral | RAG | ... | Métricas Report)           │   │
│  │       │                                                                          │   │
│  │       └─ Tab "Métricas Report" → seleção from_month / to_month                   │   │
│  │              │                                                                    │   │
│  │              ▼                                                                    │   │
│  │         getReportAnalyzerMetricsSummary(fromMonth, toMonth)  [Server Action]     │   │
│  └─────────────────────────────────────────────────────────────────────────────────┘   │
│       │                                                                                 │
│       ▼ HTTP GET                                                                        │
│  ai-service                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │  GET /api/report/metrics-summary?from_month=YYYY-MM&to_month=YYYY-MM             │   │
│  │  → Firestore metrics_summary → JSON { summaries: [...] }                         │   │
│  └─────────────────────────────────────────────────────────────────────────────────┘   │
│       │                                                                                 │
│       ▼                                                                                 │
│  Admin UI: Cards (KPIs por mês ou resumo) + Tabela ou gráfico (tendência)              │
│                                                                                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Fluxo de dados

1. Admin abre a aba "Métricas Report" no painel.
2. Frontend chama a server action `getReportAnalyzerMetricsSummary(fromMonth, toMonth)` com intervalo padrão (ex.: últimos 12 meses).
3. A server action faz `fetch` ao ai-service `GET /api/report/metrics-summary?from_month=...&to_month=...` (URL via env).
4. Resposta `{ summaries: [...] }` é retornada ao cliente.
5. UI exibe: cards com totais ou último mês; tabela por mês com as 6 métricas e metas; opcionalmente gráfico de tendência (recharts).

---

## 3. Decisões de Arquitetura

### Decisão 1: Onde obter os dados (server action vs client fetch)

| Atributo | Valor |
|----------|--------|
| **Status** | Aceita |
| **Data** | 2026-02-19 |

**Contexto:** O ai-service expõe GET /api/report/metrics-summary. O painel pode chamar do client (fetch no browser) ou via server action (fetch no servidor Next.js).

**Escolha:** **Server action** que faz fetch ao ai-service no servidor e retorna os dados. O admin page chama essa action ao montar a aba ou ao alterar o intervalo.

**Rationale:** (1) Evita expor a URL do ai-service no client se no futuro usarmos variável só server-side. (2) Consistente com outras ações do admin (getAdminInsights, etc.) que já são server actions. (3) CORS pode ser evitado se o ai-service não permitir origem do front.

**Consequências:** Criar função em `admin/actions.ts` e serviço ou fetch direto em `admin/lib/` (ex.: `report_analyzer_metrics_service.ts`) que usa `process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL` ou `PYTHON_SERVICE_URL`.

---

### Decisão 2: Aba no painel vs página separada

| Atributo | Valor |
|----------|--------|
| **Status** | Aceita |
| **Data** | 2026-02-19 |

**Contexto:** O painel admin já usa Tabs (Análise Geral, RAG, Latência, Usuários, Feedbacks, Alertas Jurídicos, Sistema).

**Escolha:** **Nova aba** "Métricas Report" (ou "Report Analyzer") no mesmo `page.tsx`, com `TabsTrigger` e `TabsContent` dedicados.

**Rationale:** (1) Consistente com o resto do painel. (2) Um único lugar para todas as funções admin. (3) Menos navegação e deploy (sem nova rota).

**Consequências:** Ajustar `TabsList` para 8 colunas (ou layout que acomode 8 abas); adicionar estado para intervalo (from_month, to_month) e para os dados da API; opcionalmente extrair o conteúdo da aba para um componente `ReportAnalyzerMetricsTab` para manter page.tsx legível.

---

### Decisão 3: Exibição das métricas e metas

| Atributo | Valor |
|----------|--------|
| **Status** | Aceita |
| **Data** | 2026-02-19 |

**Escolha:** (1) **Cards** no topo com resumo do último mês (ou do mês selecionado) com as 6 métricas e indicação visual de meta (ex.: texto “Meta 30%” e cor se abaixo/acima). (2) **Tabela** por mês (linhas = meses, colunas = MAU %, Volume, Intensidade, Qualidade arquivo %, Qualidade jobs %, Escala %) com metas na primeira linha ou no header. (3) **Gráfico de tendência** (recharts): eixo X = mês, eixo Y = valor; séries opcionais para MAU %, Volume, Qualidade.

**Rationale:** Alinha com DEFINE (exibir 6 métricas e metas); reutiliza Card e recharts já usados no admin.

**Consequências:** Definir metas fixas na UI (MAU 30%→50%, Volume 10k, Intensidade ≥30, Qualidade ≥90% e ≥98%, Escala ≥30%) ou em constante; evitar lógica de negócio pesada no front (apenas exibição).

---

## 4. File Manifest

| # | File | Action | Purpose | Dependencies | Agent |
|---|------|--------|---------|--------------|-------|
| 1 | `src/app/admin/lib/report_analyzer_metrics_service.ts` | Create | Fetch GET /api/report/metrics-summary (server-side); retorna { summaries } ou erro | None | @python-developer / (general) |
| 2 | `src/app/admin/actions.ts` | Modify | Adicionar getReportAnalyzerMetricsSummary(fromMonth, toMonth) que chama o serviço acima | 1 | (general) |
| 3 | `src/app/admin/page.tsx` | Modify | Nova aba "Métricas Report"; estado from_month/to_month; chamada à action; Cards + Tabela (e opcional gráfico) para métricas e metas | 2 | (general) |
| 4 | `src/app/admin/components/ReportAnalyzerMetricsTab.tsx` | Create | Componente da aba: seletor de intervalo, cards, tabela, gráfico; recebe summaries e loading/error | None | (general) |

**Observação:** O projeto pode usar `components` dentro de `admin` ou em `src/components`; se já existir padrão de componentes por feature, seguir (ex.: `src/app/admin/components/`). O agente (general) indica execução direta pelo Build; não há agente específico de frontend no manifest — usar padrões do design e do codebase.

---

## 5. Especificação da API consumida

- **Método/URL:** `GET {baseUrl}/api/report/metrics-summary?from_month=YYYY-MM&to_month=YYYY-MM`
- **baseUrl:** `process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL` ou `process.env.PYTHON_SERVICE_URL` (server-side).
- **Resposta esperada:** `{ summaries: MetricsSummaryItem[] }`.
- **MetricsSummaryItem:** `{ month, closed, adoption: { mau, mau_percent }, volume: { total_analyses }, intensity: { analyses_per_assessor_avg }, quality: { ultra_batch_success_rate_pct, ultra_batch_jobs_completed_rate_pct }, scale: { pct_volume_ultra_batch }, updated_at? }`.

---

## 6. Metas de referência (UI)

Exibir junto aos valores; podem ser constantes no front ou em um objeto de configuração.

| Métrica | Meta de referência |
|---------|--------------------|
| Adoção (MAU %) | 30% (3 meses) → 50% (6 meses) |
| Volume (total análises/mês) | 10.000 |
| Intensidade (análises/assessor) | ≥ 30 |
| Qualidade (sucesso por arquivo) | ≥ 90% |
| Qualidade (jobs concluídos) | ≥ 98% |
| Escala (% volume ultra-batch) | ≥ 30% |

---

## 7. Padrão de código – Server action e serviço

```typescript
// src/app/admin/lib/report_analyzer_metrics_service.ts
const BASE_URL = process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL || process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';

export async function fetchReportAnalyzerMetricsSummary(
  fromMonth: string,
  toMonth: string
): Promise<{ summaries: MetricsSummaryItem[] } | { error: string }> {
  const url = `${BASE_URL}/api/report/metrics-summary?from_month=${encodeURIComponent(fromMonth)}&to_month=${encodeURIComponent(toMonth)}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return { error: `API ${res.status}: ${await res.text()}` };
  return res.json();
}
```

```typescript
// src/app/admin/actions.ts — adicionar
export async function getReportAnalyzerMetricsSummary(fromMonth: string, toMonth: string) {
  try {
    const data = await fetchReportAnalyzerMetricsSummary(fromMonth, toMonth);
    if (data && 'error' in data) return { error: data.error };
    return data;
  } catch (e: any) {
    return { error: e?.message || 'Não foi possível carregar as métricas.' };
  }
}
```

---

## 8. Padrão de código – Aba no page.tsx

- Adicionar `TabsTrigger value="report-metrics">Métricas Report</TabsTrigger>` e `TabsContent value="report-metrics">...</TabsContent>`.
- Estado: `reportMetricsSummaries`, `reportMetricsLoading`, `reportMetricsError`, `reportMetricsFrom`, `reportMetricsTo`.
- Efeito ou handler: ao montar a aba ou ao mudar from/to, chamar `getReportAnalyzerMetricsSummary(reportMetricsFrom, reportMetricsTo)` e preencher estado.
- Render: se loading, spinner; se error, mensagem; senão, componente `ReportAnalyzerMetricsTab` (ou inline) com cards, tabela e opcionalmente gráfico.

---

## 9. Estratégia de Testes

| Tipo | Escopo | Ferramentas |
|------|--------|-------------|
| Unit | `fetchReportAnalyzerMetricsSummary`: mock fetch; retorna dados ou erro | jest ou vitest |
| Integration | Admin page: usuário admin vê aba e dados mockados (MSW ou mock da action) | React Testing Library |
| Manual | Admin acessa /admin, abre aba Métricas Report, seleciona intervalo, vê cards e tabela; API indisponível exibe erro | — |

---

## 10. Checklist de Qualidade

- [ ] Diagrama de arquitetura descreve fluxo Admin → Server Action → ai-service → UI.
- [ ] Decisões documentadas (server action, aba no painel, cards + tabela + metas).
- [ ] File manifest com todos os arquivos e dependências.
- [ ] Metas de referência e contrato da API documentados.
- [ ] Estratégia de testes cobre serviço e UI.

---

## 11. Referências

- DEFINE: `docs/DEFINE_DASHBOARD_METRICAS_REPORT_ANALYZER.md`
- API e backend: `docs/DESIGN_METRICAS_REPORT_ANALYZER.md`, `docs/BUILD_REPORT_METRICAS_REPORT_ANALYZER.md`
- Painel admin: `src/app/admin/page.tsx`, `src/app/admin/actions.ts`, `docs/ARQUITETURA_COMPONENTES.md`
