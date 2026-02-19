# DEFINE: Dashboard de métricas report_analyzer no painel admin

> Requisitos para exibir as métricas agregadas da funcionalidade report_analyzer em uma tela do painel administrativo.

| Atributo | Valor |
|----------|--------|
| **Feature** | Dashboard de métricas report_analyzer (painel admin) |
| **Fase** | 1 – Define |
| **Input** | Backend já implementado (agregação + GET /api/report/metrics-summary); painel admin existente em `/admin` |
| **Status** | ✅ Complete (Designed) |
| **Próximo passo** | /build |

---

## 1. Problem Statement

O painel administrativo (`/admin`) hoje não exibe as métricas de adoção, volume, intensidade, qualidade e escala da funcionalidade report_analyzer. Os dados já estão disponíveis via API (`GET /api/report/metrics-summary`) e no Firestore (`metrics_summary/{YYYY-MM}`), mas não há tela para o admin visualizá-los. É necessário uma tela de dashboard no painel admin que consuma essa API e exiba as 6 métricas (e metas) de forma clara.

---

## 2. Target Users

| User | Role | Pain Point |
|------|------|------------|
| Administrador | Acessa `/admin` | Não consegue ver métricas consolidadas do report_analyzer (MAU, volume, qualidade, escala) |
| Equipe de produto/gestão | Usa painel para decisões | Falta visão mensal da adoção e qualidade do report_analyzer |
| Operações | Monitora saúde | Não tem indicadores de sucesso ultra-batch e volume no mesmo lugar |

---

## 3. Goals

| Priority | Goal |
|----------|------|
| **MUST** | Exibir as 6 métricas (Adoção MAU/213, Volume, Intensidade, Qualidade x2, Escala) no painel admin |
| **MUST** | Permitir seleção de intervalo de meses (ex.: últimos 12 meses) e exibir um resumo por mês |
| **MUST** | Mostrar metas de referência (ex.: MAU 30%→50%, Volume 10k/mês, Qualidade ≥90% e ≥98%, Escala ≥30%) junto aos valores |
| **SHOULD** | Exibir tendência (gráfico por mês) para adoção, volume e qualidade |
| **SHOULD** | Manter consistência visual com as abas existentes do admin (cards, tabelas, recharts) |
| **COULD** | Exportar dados (CSV/JSON) do intervalo selecionado |

---

## 4. Métricas a Exibir (contrato já existente)

Fonte: `docs/DEFINE_METRICAS_REPORT_ANALYZER.md` e resposta de `GET /api/report/metrics-summary`.

| Objetivo | Métrica | Meta de referência | Campo na API |
|----------|--------|--------------------|--------------|
| Adoção | MAU / 213 | 30% (3m) → 50% (6m) | `adoption.mau`, `adoption.mau_percent` |
| Volume | Total análises/mês | 10.000/mês | `volume.total_analyses` |
| Intensidade | Análises por assessor | ≥ 30/mês | `intensity.analyses_per_assessor_avg` |
| Qualidade | Sucesso por arquivo (ultra-batch) | ≥ 90% | `quality.ultra_batch_success_rate_pct` |
| Qualidade | Jobs ultra-batch concluídos | ≥ 98% | `quality.ultra_batch_jobs_completed_rate_pct` |
| Escala | % volume via ultra-batch | ≥ 30% | `scale.pct_volume_ultra_batch` |

Cada item da API inclui também `month`, `closed`, `updated_at`.

---

## 5. Success Criteria

- [ ] O admin acessa uma aba/seção "Report Analyzer" (ou "Métricas Report") no painel e vê as métricas sem erro.
- [ ] É possível escolher um intervalo de meses (ex.: from 2025-06 to 2026-02) e a tela exibe os resumos desses meses (cards e/ou tabela).
- [ ] Valores numéricos e metas de referência estão visíveis (ex.: MAU 29% com meta 30%).
- [ ] A tela usa a mesma proteção de acesso do painel (apenas usuários com role `admin`).

---

## 6. Acceptance Tests

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| AT-001 | Admin vê aba de métricas | Usuário logado com role admin, API metrics-summary disponível | Acessa /admin e abre aba Report Analyzer | Aba exibe cards ou tabela com métricas por mês; sem erro 401/403 |
| AT-002 | Intervalo de meses | Aba Report Analyzer aberta | Usuário seleciona from_month e to_month (ex.: 2025-11 a 2026-02) | Tela exibe apenas os meses do intervalo; dados batem com a API |
| AT-003 | Metas de referência | Dados de um mês com MAU 29% | Visualização do mês | Meta (ex.: 30%) é exibida junto ao valor para comparação |
| AT-004 | Usuário não-admin | Usuário logado sem role admin | Tenta acessar /admin | Comportamento atual do painel (bloqueio ou redirecionamento) |
| AT-005 | API indisponível | ai-service ou metrics-summary fora do ar | Admin abre aba Report Analyzer | Mensagem de erro clara (ex.: "Não foi possível carregar as métricas") sem quebrar a página |

---

## 7. Out of Scope

- Cálculo ou agregação de métricas no frontend (dados vêm apenas da API).
- Alteração da API ou do schema de `metrics_summary` (já definidos).
- Dashboard público ou para usuários não-admin.
- Alertas automáticos ou notificações quando métricas ficam abaixo da meta (pode ser COULD em design).
- Nova coleta de dados no report_analyzer.

---

## 8. Constraints

- Acesso apenas para usuários com role `admin` (mesmo modelo do painel atual).
- Consumir apenas a API existente `GET /api/report/metrics-summary?from_month=YYYY-MM&to_month=YYYY-MM` (máx. 24 meses).
- Manter padrões visuais e de código do painel admin (Next.js, componentes UI existentes, recharts se já usado).

---

## 9. Assumptions

| ID | Assumption | If Wrong, Impact | Validated? |
|----|------------|------------------|------------|
| A-001 | A API GET /api/report/metrics-summary está disponível e retorna `{ summaries: [...] }` | Tela não terá dados; depende do ai-service estar no ar e com Firestore populado | [x] (API já implementada) |
| A-002 | O painel admin usa Next.js em `src/app/admin` e abas com Tabs (analytics, rag, latency, users, etc.) | Integração será nova aba ou seção dentro do mesmo page.tsx ou componente dedicado | [x] (codebase existente) |
| A-003 | Chamadas ao ai-service usam `NEXT_PUBLIC_PYTHON_SERVICE_URL` ou server action que chama o backend | Se auth do ai-service for exigida, precisaremos passar token ou usar rota server-side | [ ] |
| A-004 | Total de assessores (213) para exibir meta de MAU pode ser fixo na UI ou vindo da API (já no mau_percent) | Se mudar, basta atualizar texto da meta na UI | [ ] |

---

## 10. Deployment Location / KB / Infrastructure

- **Onde a feature vive:** (a) `src/` – aplicação principal (painel admin em `src/app/admin`).
- **Domínios de conhecimento:** frontend Next.js, componentes UI (shadcn/ui), recharts; integração com ai-service (fetch).
- **Infraestrutura:** (c) Não – usa API e painel existentes; nenhum recurso GCP novo.

---

## 11. Clarity Score

| Element | Score | Criteria |
|---------|-------|----------|
| Problem | 3 | Clareza: admin não vê métricas; dados já existem na API |
| Users | 3 | Admin, produto, operações com dores claras |
| Goals | 3 | MUST/SHOULD/COULD definidos; 6 métricas e metas explícitas |
| Success | 3 | Critérios mensuráveis (aba visível, intervalo, metas, acesso) |
| Scope | 3 | Out of scope e constraints explícitos |

**Total: 15/15**

---

## 12. Referências

- Backend (agregação + API): `docs/DEFINE_METRICAS_REPORT_ANALYZER.md`, `docs/DESIGN_METRICAS_REPORT_ANALYZER.md`, `docs/BUILD_REPORT_METRICAS_REPORT_ANALYZER.md`
- Design desta feature: `docs/DESIGN_DASHBOARD_METRICAS_REPORT_ANALYZER.md`
- API: `GET /api/report/metrics-summary?from_month=YYYY-MM&to_month=YYYY-MM` (ai-service)
- Painel admin: `src/app/admin/page.tsx`, `src/app/admin/actions.ts`, `docs/ARQUITETURA_COMPONENTES.md`
