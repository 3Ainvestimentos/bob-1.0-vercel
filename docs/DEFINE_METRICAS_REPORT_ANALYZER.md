# DEFINE: Cloud Scheduler – Métricas report_analyzer

> Requisitos extraídos e validados para pré-agregação de métricas da funcionalidade report_analyzer, fornecendo dados prontos para exibição no frontend.

| Atributo | Valor |
|----------|--------|
| **Feature** | Métricas agregadas (report_analyzer) |
| **Fase** | 1 – Define |
| **Input** | Conversa de planejamento + métricas selecionadas (print) + estrutura Firestore atual |
| **Status** | ✅ Complete (Built) |
| **Próximo passo** | /ship (deploy + validação) |

---

## 1. Problem Statement

O frontend precisa exibir métricas de adoção, volume, intensidade, qualidade e escala da funcionalidade report_analyzer; hoje os dados estão espalhados no Firestore (métricas por dia, por usuário, jobs ultra-batch). Calcular essas métricas a cada acesso à página geraria milhares de leituras e latência alta. É necessário um mecanismo que pré-agregue os números por mês e os disponibilize em documentos únicos para leitura rápida pelo frontend.

---

## 2. Target Users

| User | Role | Pain Point |
|------|------|------------|
| Equipe de produto/gestão | Visualizar dashboards de métricas | Não tem visão consolidada mensal (MAU, volume, qualidade) sem custo/latência altos |
| Desenvolvedor frontend | Consumir API de métricas | Não quer montar várias queries nem agregar no client; precisa de payload pronto por mês |
| Operações | Monitorar saúde do report_analyzer | Precisa de indicadores de qualidade (sucesso ultra-batch, jobs concluídos) agregados |

---

## 3. Goals

| Priority | Goal |
|----------|------|
| **MUST** | Pré-agregar mensalmente as 6 métricas selecionadas e persistir em documento(s) no Firestore |
| **MUST** | Suportar meses passados (fechados) e mês atual (atualizado periodicamente) |
| **MUST** | Expor dados no formato pronto para o frontend (ex.: 1 doc por mês com todos os KPIs) |
| **SHOULD** | Executar agregação via job agendado (ex.: Cloud Scheduler + Cloud Function) sem bloquear o ai-service |
| **SHOULD** | Atualizar o mês atual em intervalo definido (ex.: 1x/dia ou a cada 6h) |
| **COULD** | Permitir reprocessamento sob demanda de um mês específico (backfill ou correção) |

---

## 4. Métricas a Agregar (contrato com o frontend)

As metas abaixo são as que o scheduler deve calcular e persistir; o frontend apenas exibe.

| Objetivo | Métrica | Meta | Fonte dos dados (Firestore atual) |
|----------|--------|------|-----------------------------------|
| Adoção | MAU / 213 | 30% (3 meses) → 50% (6 meses) | `metrics/{date}/users` → usuários distintos no mês com automatica > 0 ou personalized > 0 ou ultra_batch_runs não vazio |
| Volume | Total análises/mês | 10.000/mês | `metrics/{date}/total/total`: soma(automatica + personalized + ultra_batch_total_files) no mês |
| Intensidade | Análises por assessor | ≥ 30/mês | Volume do mês / MAU do mês |
| Qualidade | Sucesso por arquivo (ultra-batch) | ≥ 90% | `ultra_batch_jobs`: soma(successCount) / soma(successCount + failureCount) no mês |
| Qualidade | Jobs ultra-batch concluídos | ≥ 98% | `ultra_batch_jobs`: count(status==completed) / count(status in completed|failed) no mês |
| Escala | % volume via ultra-batch | ≥ 30% | soma(ultra_batch_total_files) no mês / Volume do mês |

---

## 5. Success Criteria

- [ ] Um job agendado executa sem falha e escreve pelo menos um documento de resumo mensal no Firestore.
- [ ] O frontend consegue obter as 6 métricas de N meses com no máximo N leituras (1 doc por mês).
- [ ] Métricas de meses passados permanecem estáveis (não recalculadas a cada execução, exceto backfill).
- [ ] Mês atual reflete dados até a última execução do job (atraso aceitável: 24h ou 6h conforme config).

---

## 6. Acceptance Tests

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| AT-001 | Resumo mensal criado | Dados em metrics/{date} e ultra_batch_jobs para um mês | Job de agregação roda para esse mês | Doc em metrics_summary/monthly/{YYYY-MM} com adoption, volume, intensity, quality, scale |
| AT-002 | MAU calculado | Vários users com atividade em dias diferentes do mês | Agregação do mês | mau = número de user_id distintos com pelo menos 1 análise no mês |
| AT-003 | Volume e escala | metrics/{date}/total/total com automatica, personalized, ultra_batch_total_files | Agregação do mês | total_analyses = soma dos três; pct_volume_ultra_batch = ultra_batch / total_analyses |
| AT-004 | Qualidade ultra-batch | ultra_batch_jobs com created_at no mês e status/successCount/failureCount | Agregação do mês | success_rate por arquivo e jobs_completed_rate calculados e persistidos |
| AT-005 | Mês atual atualizado | Job configurado para rodar 1x/dia | Execução diária | Doc do mês atual (closed: false) atualizado com dados até o dia anterior (ou até agora) |
| AT-006 | Mês passado fechado | Primeiro dia do mês seguinte | Job de fechamento | Mês anterior marcado como closed: true e não mais alterado nas execuções seguintes |

---

## 7. Out of Scope

- Cálculo de métricas em tempo real no backend a cada request (rejeitado: custo e latência).
- Nova coleta de dados no report_analyzer (usar apenas estrutura atual do Firestore).
- Dashboard ou UI do frontend (apenas backend/scheduler que alimenta os dados).
- Métricas em tempo real do “dia de hoje” (opcional; pode ser COULD em design).
- Alteração do schema existente de metrics/{date}/users e metrics/{date}/total/total.

---

## 8. Constraints

- Estrutura do Firestore atual deve ser mantida: `metrics/{date}/users/{userId}`, `metrics/{date}/total/total`, `ultra_batch_jobs/{job_id}` (e subcoleção results).
- Total de assessores = 213 (constante para cálculo de MAU/213).
- Ambiente GCP (projeto já usa Firestore, Cloud Run para ai-service); Cloud Scheduler e Cloud Functions são candidatos naturais.

---

## 9. Assumptions

| ID | Assumption | If Wrong, Impact | Validated? |
|----|------------|-------------------|------------|
| A-001 | Firestore já contém metrics por date e ultra_batch_jobs com created_at | Não há dados para agregar; precisa de backfill ou migração | [x] (código atual escreve esses dados) |
| A-002 | 1 execução por dia do job é suficiente para “mês atual” | Se precisar de atualização intraday, aumentar frequência no Design | [ ] |
| A-003 | Frontend consumirá via API que lê metrics_summary (ou leitura direta Firestore com regras adequadas) | Pode ser necessário endpoint no ai-service que leia e retorne os resumos | [ ] |
| A-004 | Nenhum outro sistema escreve em metrics_summary; apenas o job de agregação | Conflito de escrita se outro processo escrever no mesmo doc | [ ] |

---

## 10. Clarity Score

| Element | Score | Criteria |
|---------|-------|----------|
| Problem | 3 | Clareza: frontend precisa de métricas prontas; custo/latência evitados com pré-agregação |
| Users | 3 | Produto, frontend e operações identificados com dores claras |
| Goals | 3 | MUST/SHOULD/COULD definidos; 6 métricas e metas explícitas |
| Success | 3 | Critérios mensuráveis (N leituras, doc persistido, mês atual atualizado) |
| Scope | 3 | Out of scope e constraints explícitos |

**Total: 15/15**

---

## 11. Referências

- Métricas e metas: print da tabela (Adoção MAU/213, Volume 10k/mês, Intensidade ≥30, Qualidade ≥90% e ≥98%, Escala ≥30%).
- Estrutura Firestore: `ai-service/app/services/metrics.py`, `ai-service/app/api/report.py`, `ai-service/app/services/report_analyzer/ultra_batch_processing.py`.
- Documentos relacionados: `docs/REPORTE_FALHAS_METRICAS.md`, `docs/DESIGN_CORRECAO_METRICAS.md`.

---

**Revisão:** Status atualizado para Complete (Built) após implementação conforme DESIGN e BUILD_REPORT_METRICAS_REPORT_ANALYZER.md.
