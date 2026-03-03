# DEFINE: Evolução das Métricas do Report Analyzer

> Requisitos estruturados e validados para as três evoluções do sistema de métricas: (1) total de assessores configurável, (2) substituição de Intensidade por Persistência de Uso, (3) métricas segmentadas para o time digital.

| Atributo | Valor |
|----------|-------|
| **Feature** | Evolução das Métricas – Report Analyzer |
| **Fase** | 1 – Define |
| **Input** | `docs/BRAINSTORM_METRICAS_EVOLUTION.md` |
| **Status** | ✅ Complete (Designed) |
| **Próximo passo** | `/build docs/DESIGN_METRICAS_EVOLUTION.md` |

---

## 1. Problem Statement

O sistema de métricas do Report Analyzer, implantado nos commits `5e35ab4` e `60dadfb`, possui três limitações: (1) o número total de assessores (`213`) está hardcoded na Cloud Function, está errado (correto: `139`) e exige redeploy para corrigir; (2) a métrica "Intensidade" mede volume médio de uso por assessor, mas não captura se há hábito/retenção sustentada; (3) não há segmentação de métricas para o time digital, cujos membros já são identificados no Firestore (`config/digital_team`).

---

## 2. Target Users

| User | Role | Pain Point |
|------|------|------------|
| Equipe de produto / gestão | Acompanhar adoção e engajamento | `mau_percent` calculado com base errada (`213` ao invés de `139`) distorce todos os percentuais de adoção |
| Admin do sistema | Manter configurações sem redeploy | Não consegue corrigir o número de assessores sem envolver engenharia |
| Gestão do time digital | Monitorar uso exclusivo do seu segmento | Métricas globais não revelam a adoção dentro do próprio time digital |
| Desenvolvedor / SRE | Manter o pipeline de métricas | Configuração espalhada entre código e Firestore gera inconsistências |

---

## 3. Goals

### REQ-1: Total de Assessores Configurável

| Priority | Goal |
|----------|------|
| **MUST** | Corrigir o valor de `213` para `139` sem exigir redeploy |
| **MUST** | Tornar `total_assessors` editável pelo admin via frontend |
| **MUST** | A Cloud Function deve ler o valor do Firestore (`config/metrics_config.total_assessors`) com fallback para `139` |
| **SHOULD** | Validar que o valor inserido é um inteiro positivo antes de salvar |
| **COULD** | Exibir o valor atual no card de Adoção (MAU%) como subtexto |

### REQ-2: Persistência de Uso (substitui Intensidade)

| Priority | Goal |
|----------|------|
| **MUST** | Calcular quantos usuários usaram o XP Performance nos 3 meses consecutivos até o mês M (meses M, M-1 e M-2) |
| **MUST** | Persistir o resultado como `persistence.users_3m_streak` em `metrics_summary/{M}` |
| **MUST** | Remover o campo `intensity` dos documentos novos (meses a partir da implantação) |
| **MUST** | Manter retrocompatibilidade: meses históricos com `intensity` não quebram o frontend |
| **SHOULD** | Armazenar o set de UIDs ativos em meses fechados (`adoption.active_uids`) para evitar releitura no cálculo de persistência futuro |
| **COULD** | Exibir meta configurável para `users_3m_streak` (hardcoded por ora) |

### REQ-3: Métricas Exclusivas para o Digital

| Priority | Goal |
|----------|------|
| **MUST** | Calcular MAU digital, MAU% digital, volume digital e persistência digital durante a agregação mensal |
| **MUST** | Persistir como subcampo `digital: {...}` no documento `metrics_summary/{M}` existente |
| **MUST** | Criar sub-aba "Análise Digital" dentro da aba "Report Analyzer" em `page.tsx`, seguindo o padrão já adotado em Chat/RAG (sub-abas: "Análise Geral" / "Análise Digital") |
| **MUST** | Novo componente `DigitalMetricsTab.tsx` com 4 cards (MAU Digital, MAU% Digital, Volume Digital, Persistência Digital), seletor de período e tabela histórica |
| **MUST** | `ReportAnalyzerMetricsTab.tsx` (Análise Geral) **não** recebe a seção Digital — ela fica inteiramente em `DigitalMetricsTab.tsx` |
| **SHOULD** | Usar `config/digital_team.emails` como fonte de verdade para tamanho do time (já existente, sem nova coleção) |
| **COULD** | Exibir o tamanho do time digital (`total_digital_size`) como subtexto no card de MAU% Digital |

---

## 4. Contexto Técnico

### Localização de Deployment

| Componente | Localização | Justificativa |
|------------|-------------|---------------|
| Lógica de agregação | `functions/metrics_aggregator/` | Cloud Function já existente; alterações são incrementais |
| Schema de modelos | `ai-service/app/models/requests.py` | Pydantic models do AI Service já tipam o contrato da API |
| Endpoint da API | `ai-service/app/api/report.py` | Endpoint `/api/report/metrics-summary` já existente |
| Frontend | `src/app/admin/components/ReportAnalyzerMetricsTab.tsx` | Tab de métricas já criada |
| Server Action | `src/app/admin/actions.ts` | Padrão de Server Actions admin já estabelecido |

### KB Domains

| Domain | Uso |
|--------|-----|
| `gcp / firestore` | Leitura de `config/metrics_config`, `config/digital_team`, `users/{uid}` |
| `pydantic` | Atualização de `MetricsSummaryItem` com campos novos (`persistence`, `digital`) |
| `nextjs / server-actions` | `updateTotalAssessors` com validação e escrita no Firestore via SDK admin |

### Impacto de Infraestrutura

Nenhuma nova infraestrutura GCP necessária. A Cloud Function existente será alterada; o agendamento (Cloud Scheduler) permanece inalterado.

---

## 5. Success Criteria

- [ ] `mau_percent` exibido no frontend usa base `139` (ou o valor atual em `config/metrics_config.total_assessors`)
- [ ] Admin consegue alterar `total_assessors` no painel e o próximo ciclo de agregação usa o novo valor sem redeploy
- [ ] Campo `persistence.users_3m_streak` presente em todos os documentos `metrics_summary` — tanto nos gerados após a implantação quanto nos meses históricos re-agregados
- [ ] Campo `digital.{mau, mau_percent, total_analyses, users_3m_streak}` presente em todos os documentos após re-agregação histórica (2025-11 em diante)
- [ ] Meses históricos com `intensity` são exibidos no frontend sem erro (valor exibe `—`)
- [ ] Seção "Análise Digital" (sub-aba) exibe dados corretos para meses históricos re-agregados
- [ ] Testes unitários cobrem: leitura de `total_assessors` do Firestore com fallback, cálculo de interseção de 3 meses, filtragem por UIDs digitais

---

## 6. Acceptance Tests

### REQ-1: Total de Assessores Configurável

| ID | Cenário | Given | When | Then |
|----|---------|-------|------|------|
| AT-101 | Leitura do Firestore OK | `config/metrics_config.total_assessors = 139` existe | Cloud Function executa | `mau_percent` calculado com base `139` |
| AT-102 | Fallback quando doc não existe | `config/metrics_config` ausente | Cloud Function executa | `TOTAL_ASSESSORS = 139` (fallback) usado; sem erro |
| AT-103 | Admin edita valor pelo frontend | Admin insere `150` no campo | Clica em "Salvar" | Firestore atualizado; próxima agregação usa `150` |
| AT-104 | Validação de entrada inválida | Admin insere `0` ou texto | Clica em "Salvar" | Erro de validação exibido; Firestore não alterado |

### REQ-2: Persistência de Uso

| ID | Cenário | Given | When | Then |
|----|---------|-------|------|------|
| AT-201 | Usuário ativo 3 meses consecutivos | UID `u1` presente em M, M-1 e M-2 | Agregação de M executada | `u1` contado em `persistence.users_3m_streak` |
| AT-202 | Usuário ativo apenas 2 meses | UID `u2` presente em M e M-1, ausente em M-2 | Agregação de M executada | `u2` **não** contado em `persistence.users_3m_streak` |
| AT-203 | Mês histórico com `intensity` (ex: 2025-12) | Frontend lê summary com `volume.total_analyses` e `intensity`, mas sem `persistence` nem `digital` | Tabela renderiza | Coluna "Persistência" exibe `—`; seção Digital oculta; sem erro de tipo |
| AT-204 | Mês novo sem `intensity` | Frontend lê summary com `persistence` e `volume`, sem `intensity` | Tabela renderiza | Coluna "Persistência" exibe valor; card Volume exibe valor; sem erro de tipo |
| AT-205 | Otimização `active_uids` | Mês M-1 `closed=true` com `adoption.active_uids` salvo | Agregação de M+1 executada | UIDs de M lidos de `active_uids` em vez de reler `metrics/{date}/users/` |

### REQ-3: Métricas do Digital

| ID | Cenário | Given | When | Then |
|----|---------|-------|------|------|
| AT-301 | Usuário digital usa o sistema | UID de email presente em `config/digital_team.emails` tem atividade no mês | Agregação executada | Usuário contado em `digital.mau` |
| AT-302 | Usuário não-digital não contamina | UID sem email digital tem atividade | Agregação executada | Usuário **não** contado em `digital.mau` |
| AT-303 | `config/digital_team` ausente | Documento não existe no Firestore | Agregação executada | `digital.mau = 0`; sem crash; warning logado |
| AT-304 | MAU% digital correto | `digital.mau = 5`, `total_digital_size = 20` | Agregação executada | `digital.mau_percent = 25.0` |
| AT-305 | Sub-aba digital renderiza dados | `metrics_summary/{M}` tem campo `digital` | Sub-aba "Análise Digital" selecionada | 4 cards exibem dados corretos; tabela histórica renderiza |
| AT-308 | Email do time digital sem UID correspondente em `users/` | `config/digital_team` tem email `X` sem doc em `users/` | Aggregation executa | Warning logado; email ignorado; sem crash; `digital.mau` reflete apenas UIDs resolvidos |
| AT-306 | Sub-aba digital com dados históricos re-agregados | `metrics_summary` de meses passados re-agregados via DESIGN §10 | Sub-aba "Análise Digital" selecionada | Cards exibem valores históricos corretos; tabela histórica populada |
| AT-309 | Sub-aba digital antes da re-agregação (campo `digital` ausente) | `metrics_summary/{M}` não tem campo `digital` | Sub-aba "Análise Digital" selecionada | Cards exibem `—` ou "Sem dados"; sem erro de tipo |
| AT-307 | Navegação entre sub-abas | Usuário clica em "Análise Geral" e depois "Análise Digital" | Ambas as sub-abas clicadas | Cada sub-aba renderiza seu próprio conteúdo isoladamente; sem interferência de estado |

---

## 7. Schema de Dados (contrato)

### Antes — docs criados pelo aggregator v1 (ex: `2025-12`, confirmado em produção)

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

### Antes — docs criados pelo aggregator v2 (ex: `2026-01`+, versão atual)

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

> `volume.digital_analyses` e `volume.rest_analyses` existem no Firestore (docs v2) mas não são mapeados pelo modelo Pydantic atual (`MetricsSummaryVolume` expõe apenas `total_analyses`) — sem impacto no frontend.

### Depois (novo schema — mês aberto, ex: `2026-03`)

```json
{
  "month": "2026-03",
  "closed": false,
  "adoption":    { "mau": 72, "mau_percent": 51.8 },
  "volume":      { "total_analyses": 11200 },
  "persistence": { "users_3m_streak": 45 },
  "quality":     { "ultra_batch_success_rate_pct": 96.0, "ultra_batch_jobs_completed_rate_pct": 99.5 },
  "scale":       { "pct_volume_ultra_batch": 48.0 },
  "digital":     { "mau": 12, "mau_percent": 80.0, "total_analyses": 3200, "users_3m_streak": 9 },
  "updated_at": "..."
}
```

### Depois (novo schema — mês fechado, ex: `2026-02`)

```json
{
  "month": "2026-02",
  "closed": true,
  "adoption":    { "mau": 50, "mau_percent": 35.97, "active_uids": ["uid1", "uid2", "..."], "digital_active_uids": ["uid3"] },
  "volume":      { "total_analyses": 8500 },
  "persistence": { "users_3m_streak": 30 },
  "quality":     { "ultra_batch_success_rate_pct": 95.2, "ultra_batch_jobs_completed_rate_pct": 99.1 },
  "scale":       { "pct_volume_ultra_batch": 42.0 },
  "digital":     { "mau": 6, "mau_percent": 85.7, "total_analyses": 1200, "users_3m_streak": 5 },
  "updated_at": "..."
}
```

> **Notas:**
> - `active_uids` e `digital_active_uids` em `adoption` são campos auxiliares gravados **apenas em meses fechados** (`closed=True`). São usados pelo aggregator para calcular persistência sem reler dados brutos. Não são expostos pela API ao frontend.
> - `mau_percent` correto após fix: `50 / 139 * 100 = 35.97` (antes da correção estava `23.47` com divisor errado `213`).

### Novo documento Firestore: `config/metrics_config`

```json
{
  "total_assessors": 139
}
```

---

## 8. Out of Scope

| Item | Motivo |
|------|--------|
| Exportar lista de UIDs persistentes (CSV/XLSX) | Sem caso de uso definido; risco LGPD |
| Alertas automáticos por e-mail quando meta não atingida | Fora do escopo desta iteração |
| Breakdown por tipo de análise no segmento digital (automática vs. personalizada vs. ultra-batch) | Dados disponíveis, mas não solicitados para MVP |
| Configuração de metas (targets) via frontend | Targets hardcoded no frontend são suficientes por ora |
| ~~Aba separada para métricas digitais~~ | **Revertido** — sub-aba "Análise Digital" está agora **no escopo**, seguindo padrão Chat/RAG |
| Reprocessamento em batch de meses históricos com o novo valor de assessores | Operação manual sob demanda; fora do escopo automático |
| Mudança na periodicidade do Cloud Scheduler | Frequência atual suficiente |

---

## 9. Assumptions

| ID | Assumption | Impacto se Errada | Validado? |
|----|------------|-------------------|-----------|
| A-01 | `config/digital_team` no Firestore tem campo `emails: string[]` com e-mails lowercase | Cloud Function precisa de normalização extra | [x] — confirmado em `digital_whitelist.py` |
| A-02 | `users/{uid}.email` está sempre preenchido para usuários cadastrados via Google Auth | UIDs sem email não são encontrados na resolução email→UID pelo aggregator; membro do time digital sem email no Firestore não entra nas métricas digitais | [ ] — **validar em produção**: checar se todos os 7 membros do `config/digital_team` têm email preenchido em `users/` |
| A-03 | Tamanho do time digital (`len(emails)`) é obtido de `config/digital_team.emails.length` | Precisaria de campo `total` separado | [x] — email list é a fonte de verdade |
| A-04 | O documento `metrics_summary/{M}` está abaixo de 1 MB mesmo com `active_uids` adicionado | Precisaria de subcoleção separada para UIDs | [ ] — estimar com dados reais (~139 UIDs × ~36 bytes ≈ ~5 KB, seguro) |
| A-05 | A Cloud Function tem permissão de leitura em `config/metrics_config` | IAM/regras de segurança precisariam ser atualizadas | [ ] — verificar roles do service account |
| A-06 | O admin do frontend tem role que permite escrita em `config/metrics_config` | Server Action falhará silenciosamente | [ ] — definir regra Firestore durante Design |
| A-07 | Meses M-1 e M-2 já existem em `metrics_summary` (Cloud Function rodou ao menos 2 meses antes) | `users_3m_streak = 0` para meses iniciais (aceitável) | [x] — comportamento esperado documentado |
| A-08 | Docs históricos v1 (ex: 2025-12) têm `volume.total_analyses` apenas; docs v2 (2026-01+) têm também `digital_analyses` e `rest_analyses` no mesmo mapa | Frontend usaria campos não mapeados; risco de tipo errado | [x] — Pydantic `MetricsSummaryVolume` expõe apenas `total_analyses` (ignora extras); confirmado em produção |

---

## 10. Dependências e Riscos

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Lentidão na agregação com leitura de 90 dias para cálculo de persistência | Média | Médio | Usar `active_uids` em meses fechados; timeout da Cloud Function ajustado se necessário |
| Breaking change no schema `intensity → persistence` quebra clientes externos que consumam a API | Baixa | Alto | Campo `intensity` mantido como `Optional` no Pydantic model por 2 ciclos; remover após confirmação |
| Regras de segurança Firestore bloqueiam escrita de `total_assessors` pelo admin | Média | Alto | Definir regra explícita no Design; testar antes de ir para produção |
| `config/digital_team` com e-mails desatualizados gera métricas incorretas | Média | Médio | Documentar que o time é responsável por manter a lista; fora do escopo desta feature |
| Email em `config/digital_team` não encontrado em `users/` (cadastro incompleto) | Baixa | Baixo | `_load_digital_uids` loga warning por email não resolvido; membro não entra no cálculo silenciosamente — validar A-02 antes do deploy |
| Membros adicionados ao time digital depois de meses fechados não aparecem em dados históricos | Baixa | Baixo | **Mitigado pela re-agregação histórica** (ver DESIGN §10) — re-executar o aggregator para meses passados recalcula com a lista atual de `config/digital_team.emails`; dados brutos `metrics/{date}/users/` ainda estão no Firestore |
| Tamanho do doc `metrics_summary` com `active_uids` ultrapassa 1 MB (se base de usuários crescer) | Baixa | Médio | Limitar `active_uids` a hash MD5 dos UIDs (sem PII, 32 bytes × 500 usuários ≈ 16 KB) |

---

## 11. Arquivos a Criar / Alterar

| Arquivo | Operação | Mudança |
|---------|----------|---------|
| `functions/metrics_aggregator/config.py` | **Alterar** | Remover `TOTAL_ASSESSORS` hardcoded; adicionar `_read_total_assessors(db)` |
| `functions/metrics_aggregator/aggregator.py` | **Alterar** | `_compute_persistence()`, `_compute_digital_metrics()`; `run_monthly_aggregation()` recebe `total_assessors` como parâmetro |
| `functions/metrics_aggregator/tests/test_aggregator.py` | **Alterar** | Testes para `_compute_persistence` (interseção, fallback meses ausentes) e `_compute_digital_metrics` |
| `ai-service/app/models/requests.py` | **Alterar** | `MetricsSummaryIntensity` → `MetricsSummaryPersistence`; adicionar `MetricsSummaryDigital`; tornar `intensity` `Optional` |
| `ai-service/app/api/report.py` | **Alterar** | Expor `persistence` e `digital` no response; manter `intensity` como campo legado opcional |
| `src/app/admin/lib/report_analyzer_metrics_service.ts` | **Alterar** | Atualizar `MetricsSummaryItem`: `intensity` → optional, adicionar `persistence` e `digital` |
| `src/app/admin/components/ReportAnalyzerMetricsTab.tsx` | **Alterar** | Input editável para `total_assessors`; card "Persistência de Uso"; seção "Segmento Digital" |
| `src/app/admin/actions.ts` | **Alterar** | Adicionar `updateTotalAssessors(value: number): Promise<{success: boolean, error?: string}>` |

---

## 12. Clarity Score

| Elemento | Pontos | Critério |
|----------|--------|----------|
| Problem | 3/3 | Específico, quantificado (213 vs 139), actionable |
| Users | 3/3 | 4 personas com dores concretas |
| Goals | 3/3 | MoSCoW definido para as 3 features |
| Success Criteria | 3/3 | Testáveis e mensuráveis |
| Scope | 3/3 | Explícito: 8 itens fora do escopo listados |

**Total: 15/15 ✅**

---

## Status: ✅ Ready for Design
