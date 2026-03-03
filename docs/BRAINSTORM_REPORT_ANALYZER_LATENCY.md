# BRAINSTORM: Otimização de arquitetura e latência – report_analyzer

## Ideia inicial

Reduzir a latência e otimizar a arquitetura do `ai-service/app/services/report_analyzer/` com base nas métricas de um dia de uso “intenso” do servidor (picos de latência de dezenas de minutos, alto uso de memória, “Execução do usuário” como principal gargalo).

---

## Contexto reunido

### Métricas do servidor (dia de uso intenso)

| Métrica | Observação |
|--------|------------|
| **Latência (p50/p95/p99)** | p99 até ~50 min no pico (13:00–18:00); p95 na faixa de 10–20 min. Mediana relativamente baixa → cauda longa. |
| **Detalhamento da latência** | **“Execução do usuário”** é o principal gargalo (picos 10–20 min). “Pendente” também com picos (fila/contenção). Um pico isolado em “Saída de resposta” (~50 min). Entrada/rede/roteamento baixos. |
| **Requisições** | Pico ~0,15–0,18 req/s; máximo de solicitações simultâneas ~10 (14:00–16:00). |
| **CPU** | Picos intermitentes até ~20%; não sustentado. |
| **Memória** | Uso sustentado alto (~27–28%) durante período ativo (07:00–17:00). |
| **Rede** | Entrada em bursts até 500 KB/s (internet); saída moderada (~50 KB/s para Google). |
| **Container** | Latência de inicialização 10–14 s (cold start relevante se houver scale-out). |

### Fluxo atual do report_analyzer

1. **API** (`report.py`): `POST /ultra-batch-process` cria job no Firestore e retorna **StreamingResponse** consumindo `process_ultra_batch_reports(...)`.
2. **Ultra batch** (`ultra_batch_processing.py`): Lê metadados do Firestore, divide arquivos em **chunks de 5**, para cada chunk:
   - Lê arquivos do GCS sob demanda (lazy).
   - Chama `process_batch_reports(files_to_process, user_id)`.
   - Escreve resultados no Firestore e buffer para Sheets (flush em executor).
   - Libera memória explicitamente (`del`, `gc.collect()`) entre chunks.
3. **Batch** (`batch_processing.py`): **Semáforo global** `MAX_CONCURRENT_JOBS = 5`. Para cada arquivo do chunk:
   - `create_report_analysis_workflow()` + `app.ainvoke(state)` (timeout 4 min por arquivo).
4. **Workflow** (LangGraph): `extract_pdf` → `extract_data` → `analyze_report` → `format_message_auto/custom`.
   - **extract_pdf**: Decode base64 → PyMuPDF (ou pdf2image/pdfplumber). Gera `raw_text` + lista de imagens (base64) por página → estado grande em memória.
   - **extract_data**: Monta prompt + todas as imagens, chama **Gemini síncrono** (`client.models.generate_content`).
   - **analyze_report**: **Gemini síncrono** (`call_response_gemini`) + retries com backoff.
   - **format_message**: **Gemini síncrono** para mensagem final.

### Diagnóstico técnico

| Problema | Evidência no código/métricas |
|---------|-----------------------------|
| **Execução pesada na mesma instância** | Toda a “Execução do usuário” ocorre no processo do Cloud Run: PDF + 2–3 chamadas Gemini por arquivo, tudo síncrono. |
| **Event loop bloqueado** | Chamadas ao Gemini são **síncronas** (`generate_content`). `generate_content_with_timeout` em config usa `asyncio.wait_for(_generate())` mas `_generate()` chama sync → **bloqueia o event loop**. |
| **Memória por request** | Por arquivo: base64 do PDF + bytes decodificados + `raw_text` + N páginas em base64 (imagens). 5 arquivos em paralelo = 5× esse volume. Estado do LangGraph mantém tudo até o fim do nó. |
| **Fila (Pendente)** | Semáforo 5; se chegarem 6+ streams/jobs, as requisições esperam → “Pendente” alto. |
| **Cold start** | Inicialização do contêiner 10–14 s; em scale-out cada nova instância soma esse atraso. |

---

## Abordagens exploradas

### Abordagem A: Otimizações in-process (não desacoplar) — recomendada para MVP

**O que faz:** Reduzir latência e memória **sem** mudar o modelo de deploy (tudo na mesma instância Cloud Run).

- **Mover chamadas Gemini para thread pool:** Executar `call_response_gemini`, `extract_data` (generate_content) e `format_message` (generate_content) em `loop.run_in_executor(None, fn_sync, ...)` para não bloquear o event loop. Assim outras requisições (health, status, etc.) continuam sendo atendidas e a concorrência real melhora.
- **Reduzir memória por arquivo:** (1) Não carregar todas as imagens em base64 no estado de uma vez; enviar ao Gemini em streaming ou por página sob demanda se a API permitir; (2) ou limitar resolução/DPI das imagens em `extract_pdf` para diminuir tamanho; (3) zerar referências a `pdf_images` / `raw_text` após uso no nó seguinte (quebrar estado grande assim que não for mais necessário).
- **Workflow compilado único:** Instanciar `create_report_analysis_workflow()` uma vez por processo (ou por worker) e reutilizar, em vez de criar novo grafo a cada arquivo (reduz overhead e alocações).
- **Ajuste fino:** Manter semáforo em 5 ou reduzir para 3 se memória continuar alta; garantir que `batch_flush_rows_to_sheets_sync` continue em executor (já está).

**Prós:**  
- Mudanças localizadas no ai-service; sem nova infra.  
- Melhora de responsividade (event loop livre) e possível redução de p99 por menos contenção.  
- Menor uso de memória por request ajuda a evitar OOM e GC pesado.

**Contras:**  
- Continua limitado a 1 instância por request de ultra-batch (streaming); picos muito altos ainda podem enfileirar.  
- Cold start do contêiner permanece (pode ser mitigado com min instances se orçamento permitir).

**Por que recomendo para primeiro passo:** Resolve o bloqueio do event loop e o uso excessivo de memória com risco baixo e sem introduzir filas ou workers externos. Pode ser feito em etapas (primeiro executor para Gemini, depois redução de memória).

---

### Abordagem B: Desacoplar com fila + worker (processamento assíncrono)

**O que faz:** API aceita o job, enfileira (ex.: Pub/Sub + Cloud Tasks ou fila no Firestore) e retorna imediatamente. Um worker (Cloud Run job ou instância separada) consome a fila e processa os relatórios; o cliente consulta status/resultados via polling ou Firestore em tempo real.

- **Vantagem:** Latência da **resposta HTTP** cai para algo próximo do tempo de enfileiramento (centenas de ms). A “Execução do usuário” some das métricas da API e passa para o worker.
- **Desvantagens:** Mais componentes (fila, worker, idempotência, retries); cliente precisa de polling ou WebSocket/Firestore para “quando ficou pronto”; streaming atual (SSE) teria que ser repensado (ex.: worker publica eventos em Firestore e o cliente escuta).

**Prós:**  
- Escala independente (mais workers sob carga).  
- API estável mesmo em pico.

**Contras:**  
- Arquitetura e operação mais complexas.  
- Mudança de contrato para o cliente (não é mais “um stream que termina quando o job acaba”).

---

### Abordagem C: Híbrido – manter streaming + worker só para “núcleo pesado”

**O que faz:** O request de ultra-batch continua sendo um stream SSE na API, mas o **processamento pesado** (extract_pdf + extract_data + analyze_report + format_message) é enviado a um **worker** via fila (ex.: uma task por chunk ou por arquivo). A API apenas orquestra: envia tarefas, consome resultados do worker (polling ou canal) e emite eventos SSE.

**Prós:**  
- Experiência do cliente (streaming) preservada.  
- CPU/memória pesada saem do processo da API.

**Contras:**  
- Implementação mais complexa (duas frentes: API orquestrador + worker).  
- Latência total pode ainda ser alta se o worker estiver sobrecarregado; precisa de métricas e capacidade adequada do worker.

---

## YAGNI – o que deixar de fora do MVP

| Feature | Motivo | Revisitar depois? |
|--------|--------|--------------------|
| Migrar ultra-batch inteiro para fila (Abordagem B pura) | Aumenta complexidade e muda modelo do cliente; primeiro validar ganho com Abordagem A. | Sim, se p99 continuar inaceitável após A. |
| Cache de resultados por hash do PDF | Aumenta complexidade e armazenamento; volume atual não indica necessidade. | Sim, se houver muitos relatórios repetidos. |
| Múltiplas instâncias dedicadas (API vs worker) sem fila | Abordagem A já pode dar ganho suficiente. | Sim, se A não resolver. |
| Redução agressiva de DPI/resolução sem métrica | Pode prejudicar qualidade da extração. | Sim, com A/B test de qualidade. |

---

## Requisitos em rascunho para /define

1. **Execução não bloqueante:** Todas as chamadas síncronas ao Gemini (extract_data, analyze_report, format_message) devem rodar em thread pool (`run_in_executor`) para não bloquear o event loop.
2. **Memória:** Reduzir retenção de estado pesado (pdf_images, raw_text) por request (liberar após uso no nó seguinte ou reduzir tamanho das imagens de forma configurável).
3. **Workflow:** Reutilizar instância do workflow compilado quando possível (ex.: singleton ou pool por processo), em vez de criar um novo a cada arquivo.
4. **Observabilidade:** Manter ou adicionar métricas de duração por etapa (extract_pdf, extract_data, analyze_report, format_message) e de uso de memória por job, para validar impacto das otimizações.
5. **Semáforo e timeout:** Manter `MAX_CONCURRENT_JOBS` configurável; revisar timeout por arquivo (4 min) após medir p95 real.
6. **Cold start (opcional):** Documentar uso de min instances no Cloud Run se o orçamento permitir, para reduzir impacto dos 10–14 s de inicialização.

---

## Próximos passos sugeridos

1. **Confirmar prioridade:** Você prefere começar só pela Abordagem A (executor + memória + workflow único) ou já considerar B/C?
2. **Definir sucesso:** Qual p95/p99 de latência é aceitável após a otimização (ex.: p95 &lt; 2 min, p99 &lt; 5 min)?
3. **Medir antes/depois:** Ter um dia de métricas “baseline” após cada mudança (ex.: primeiro só executor, depois redução de memória) para validar ganho.

Quando quiser formalizar requisitos e critérios de aceite, usar este brainstorm como entrada para a fase **Define** (ex.: `/define` com este documento).

---

**Status:** Rascunho pronto para validação e perguntas de clarificação (brainstorm Phase 0).
