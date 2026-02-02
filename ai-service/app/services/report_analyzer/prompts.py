# --------------------PROMPTS ANALISE AUTOMATICA---------------------

XP_REPORT_EXTRACTION_PROMPT_OPTIMIZED ="""
        Você é um especialista em análise de relatórios financeiros da XP.
        Analise o TEXTO e as IMAGENS do PDF para extrair dados com máxima precisão.

        **INSTRUÇÕES CRÍTICAS:**
        1. Use o TEXTO para dados estruturados (números, percentuais, datas)
        2. Use as IMAGENS para entender layout, tabelas, gráficos e formatação visual
        3. Combine ambas as fontes para máxima precisão
        4. Preste atenção especial a:
        - Sinais negativos (ex: -0,13%, -3,14%) - MUITO IMPORTANTE!
        - Formatação de tabelas e alinhamento
        - Gráficos e visualizações
        - Layout e organização espacial

        {images_context}

        **TEXTO EXTRAÍDO DO PDF:**
        {raw_text}

        **CAMPOS A EXTRAIR (TODOS OBRIGATÓRIOS):**
        1. accountNumber: Número da conta do cliente
        2. reportMonth: Mês de referência do relatório (formato: MM/AAAA)
        3. grossEquity: Patrimônio total bruto (formato: R$ X.XXX,XX) - Procure por "PATRIMÔNIO TOTAL BRUTO" ou "PATRIMÔNIO BRUTO" no relatório
        4. monthlyReturn: Rentabilidade percentual do mês
        5. monthlyCdi: Rentabilidade em %CDI do mês
        6. monthlyGain: Ganho financeiro do mês (formato: R$ X.XXX,XX)
        7. yearlyReturn: Rentabilidade percentual do ano
        8. yearlyCdi: Rentabilidade em %CDI do ano
        9. yearlyGain: Ganho financeiro do ano (formato: R$ X.XXX,XX)
        10. benchmarkValues: Objeto com valores dos benchmarks (índices de referencia) do mês atual (pode ser negativo!):
        - CDI: percentual
        - Ibovespa: percentual
        - IPCA: percentual 
        - Dólar: percentual 
        11. classPerformance: Array com performance por classe de ativo:
            - className: nome da classe
            - classReturn: rentabilidade percentual do mês
            
        12. topAssets: Objeto organizado por classe de ativo com os 2 melhores ativos de cada classe:
        - Estrutura: {{className: [lista de ativos]}}
        - Para cada ativo:
          * assetName: nome do ativo
          * assetReturn: rentabilidade do ativo
          * assetType: tipo específico do ativo
        - Exemplo: {{"Pós Fixado": [{{"assetName": "CDB BANCO MASTER", "assetReturn": "1,56%", "assetType": "CDB"}}, {{"assetName": "CDB BANCO MASTER", "assetReturn": "1,54%", "assetType": "CDB"}}], "Inflação": [{{"assetName": "NTN-B", "assetReturn": "1,06%", "assetType": "NTN-B"}}, {{"assetName": "Tesouro IPCA+ 2026", "assetReturn": "1,16%", "assetType": "Tesouro IPCA+"}}]}}

        **FORMATO DE SAÍDA:**
        - Use formato brasileiro (vírgula para decimal)
        - Preserve sinais negativos (ex: -0,13%, -3,14%)
        - Valores monetários em formato R$ X.XXX,XX
        - Percentuais com símbolo % (ex: 1,06%)
        - Responda APENAS com JSON válido, sem texto adicional

        Responda APENAS com o JSON válido.
        """




XP_REPORT_ANALYSIS_PROMPT = """
    Você é um especialista em finanças e comunicação com clientes, com habilidade para transformar dados complexos de relatórios de investimento em uma narrativa clara e envolvente.

    **TAREFA:**
    Sua tarefa é realizar uma análise profunda de relatórios de investimentos da XP. Além de analisar a performance geral, você deve **aprofundar a análise (fazer o drill-down)** nos destaques e detratores. Para isso, identifique os **ativos individuais** dentro das classes que mais impactaram o resultado e explique o **porquê** de sua performance, conectando com o cenário macroeconômico.

    **REGRAS ESTRITAS:**
    1.  **CLASSIFICAÇÃO DE CLASSES:**
        -   Compare a rentabilidade mensal de cada classe de ativo com seu respectivo benchmark:
        - **Mapeamento de benchmarks:**
        * Pós Fixado → CDI
        * Pré Fixado → CDI  
        * Multimercado → CDI
        * Alternativo → CDI
        * Inflação → IPCA
        * Renda Variável Brasil → Ibovespa
        * Fundos Listados → CDI
        * **Renda Fixa Global e Renda Variável Global: NÃO têm benchmark válido no relatório - NÃO incluir em highlights ou detractors**

        -   **Pontos Positivos:** São **EXCLUSIVAMENTE** as classes de ativo cuja rentabilidade no mês foi **SUPERIOR** ao seu benchmark de referência correspondente. (benchmarkDifference > 0,00).
        -   **Detratores do mês (Máximo dois):** São **EXCLUSIVAMENTE** as classes de ativo cuja rentabilidade no mês foi **INFERIOR** ao seu benchmark de referência (benchmarkDifference < 0,00).
        -   **REGRA CRÍTICA - CLASSES GLOBAIS:** As classes "Renda Fixa Global" e "Renda Variável Global" **NUNCA** devem aparecer em highlights ou detractors, mesmo que tenham benchmarkDifference positivo ou negativo. Essas classes serão tratadas separadamente na formatação final.

    2.  **ANÁLISE DETALHADA (DRILL-DOWN):**
    - Para TODAS as classes de "Destaques", consulte a seção "topAssets" dos dados extraídos. 
    - Identifique os 2 ou 3 **ativos individuais** com maior rentabilidade no mês dentro de cada classe e cite-os como os impulsionadores do resultado. 
    - **ORDENE os highlights por diferença decrescente** (maior diferença primeiro).

    3. **REGRA CRÍTICA - SEÇÃO DETRACTORS:**
   - **SEMPRE gere a seção "detractors"** mesmo que seja uma lista vazia
   - **NUNCA omita** a seção detractors do JSON de resposta
   - Se não houver classes abaixo do benchmark, retorne: `"detractors": []`

    **DADOS EXTRAÍDOS:**
    {{extracted_data}}

    **FORMATO DE RESPOSTA (JSON obrigatório):**
    {{
      "highlights": [
        {{
          "className": "Nome da classe",
          "classReturn": "rentabilidade da classe",
          "classBenchmark": "benchmark correspondente",
          "classBenchmarkValue": "valor do benchmark"
          "benchmarkDifference": "diferença em relação ao benchmark",
          "drivers": [
            {{
              "assetName": "Nome do ativo",
              "assetReturn": "Rentabilidade do ativo",
              "assetType": "Tipo específico do ativo"
            }}
          ]
        }}
      ],
      "detractors": [
        {{
          "className": "Nome da classe",
          "classReturn": "rentabilidade da classe",
          "classBenchmark": "benchmark correspondente", 
          "classBenchmarkValue": "valor do benchmark",
          "benchmarkDifference": "diferença em relação ao benchmark"
        }}
      ]
    }}

    **INSTRUÇÕES CRÍTICAS:**
    - Use o campo "benchmarkDifference" dos dados extraídos para classificação
    - *ATENÇAO* Inclua TODAS as classes que (benchmarkDifference maior que 0,00) em highlights **EXCETO "Renda Fixa Global" e "Renda Variável Global"**
    -  *ATENÇAO* Inclua TODAS as classes que (benchmarkDifference negativo (-)) em detractors **EXCETO "Renda Fixa Global" e "Renda Variável Global"**
    - SEMPRE gere ambas as seções (highlights e detractors)
    - Ordene highlights por diferença decrescente
    - Use os dados de "topAssets" para os drivers

    -   **Pontos Positivos (highlights):** São **EXCLUSIVAMENTE** as classes de ativo cuja rentabilidade no mês foi **SUPERIOR** ao seu benchmark de referência correspondente. **NUNCA** inclua classes que estão abaixo do benchmark. **NUNCA** inclua "Renda Fixa Global" ou "Renda Variável Global".
    -   **Detratores do mês (detractors):** São **EXCLUSIVAMENTE** as classes de ativo cuja rentabilidade no mês foi **INFERIOR** ao seu benchmark de referência. **NUNCA** inclua classes que estão acima do benchmark. **NUNCA** inclua "Renda Fixa Global" ou "Renda Variável Global".



    Responda APENAS com o JSON, sem texto adicional.
    """


XP_MESSAGE_FORMAT_PROMPT_AUTO = """
      Você é um especialista em comunicação financeira. Sua tarefa é formatar uma análise COMPLETA de performance em uma mensagem de WhatsApp seguindo o modelo obrigatório.

      **DADOS EXTRAÍDOS COMPLETOS:**
      {extracted_data}

      **DESTAQUES:**
      {highlights}

      **DETRATORES DO MÊS:**
      {detractors}

      **INSTRUÇÕES:**
      1. Use TODOS os dados fornecidos (análise completa)
      2. Substitua placeholders pelos valores reais
      4. **PRIORIZE os highlights pela maior diferença em relação ao benchmark**
      5. **SEMPRE mencione o highlight com maior diferença primeiro**
      6. Na seção de "Highlights", nos ativos individuais que foram responsáveis pela valorização, cite os de maior rentabilidade como os impulsionadores do resultado.
      7. **ABREVIAÇÃO DE NOMES DE ATIVOS (REGRA CRÍTICA):** Ao usar o campo "assetName" dos drivers na mensagem, SEMPRE abrevie o nome antes de inserir:
         - Para ativos com código (ex: AZQI11, HGLG11, HCTR11): use APENAS o código do "assetName"
         - Para ativos com nome composto: use apenas a primeira parte até o primeiro hífen "-" do "assetName"
         - Remova sufixos técnicos como "FIC FIDC", "FIP IE", "FIDCR", etc. do "assetName"
         - Remova datas, índices, percentuais e informações técnicas após o nome principal do "assetName"
         - Mantenha apenas o nome essencial que identifica o ativo de forma clara e concisa
         - Exemplos de transformação do "assetName":
           * "CRA VAMOS - JAN/2030 - IPC-A + 7,16%" → "CRA VAMOS"
           * "DEB MOVIDA - JUN/2028 - IPC-A + 6,55%" → "DEB MOVIDA"
           * "AZQI11 - AZ Quest Infra Yield FIP IE" → "AZQI11"
           * "Brave 90 FIC FIDC" → "Brave 90"
      8. **Se houver múltiplos highlights, ordene por diferença decrescente**
      9. **OBRIGATÓRIO: Retorne a mensagem COMPLETA dentro de um bloco de código markdown (```)**
      10. **IMPORTANTE: Comece com ``` e termine com ```**
      11. **RENDIMENTOS GLOBAIS (REGRA CRÍTICA):**
         - As classes "Renda Fixa Global" e "Renda Variável Global" devem ser REMOVIDAS dos destaques e detratores do mês
         - Essas classes devem aparecer APENAS na seção "🌐 *Rendimentos Globais:*"
         - **BUSQUE essas classes no campo "classPerformance" do "extracted_data" (NÃO nos highlights/detractors)**
         - NÃO mencione benchmark (Dólar) para essas classes, apenas a rentabilidade e os ativos (se houver em "topAssets" ou "allAssets")
         - A seção "🌐 *Rendimentos Globais:*" deve ser OMITIDA completamente se não houver nenhuma dessas classes no "extracted_data.classPerformance"
         - Se houver apenas uma classe global, mostre apenas ela. Se houver ambas, mostre ambas

    
    -   **Pontos Positivos (Destaques):** São **EXCLUSIVAMENTE** as classes de ativo cuja rentabilidade no mês foi **SUPERIOR** ao seu benchmark de referência correspondente. **NUNCA** inclua classes que estão abaixo do benchmark.
    -   **Detratores do mês [Máximo dois pontos] (Detractors):** São **EXCLUSIVAMENTE** as classes de ativo cuja rentabilidade no mês foi **INFERIOR** ao seu benchmark de referência. **NUNCA** inclua classes que estão acima do benchmark.

    **OMISSÃO DE SEÇÃO VAZIA (REGRA CRÍTICA):** Se não houver nenhuma classe de ativo na categoria "Detratores do mês", você DEVE omitir completamente a seção ":atenção: Detratores do mês:" do resultado final. Se não houver nenhuma classe global ("Renda Fixa Global" ou "Renda Variável Global"), você DEVE omitir completamente a seção "🌐 Rendimentos Globais:".


      **MODELO OBRIGATÓRIO (ANÁLISE COMPLETA):**

      **FORMATO OBRIGATÓRIO DA RESPOSTA (em MARKDOWN) retorne crase tripla no início ``` e ``` no final:**

      ```
      Olá, *[N° do Cliente]!*

      🔎 *Resumo da performance:*
      Em [reportMonth] sua carteira rendeu *[monthlyReturn]*, o que equivale a *[monthlyCdi]* do CDI, um ganho bruto de *[monthlyGain]*!
      No ano, estamos com uma rentabilidade de *[yearlyReturn:]*, o que equivale a uma performance de *[yearlyCdi]* do CDI e um resultado financeiro de *[yearlyGain]*. 
      Finalizamos o mês com o patrimônio bruto de *[grossEquity]*!

      ✅ *Destaques do mês:*
      - *[className]*, com *[classReturn]*, com [classBenchmarkDifference] acima do [classBenchmark], valorização puxada por ativos como *[assetName] (+[assetReturn])* e *[assetName] (+[assetReturn])*.

      - *[className]*, com *[classReturn]*, com [classBenchmarkDifference] acima do [classBenchmark], sustentada por ativos como *[assetName] (+[assetReturn])* e *[assetName] (+[assetReturn])*.

      - [daqui pra frente, se existir... máximo de um ativo]

      🌐 *Rendimentos Globais:*
      [APENAS se existir "Renda Fixa Global" ou "Renda Variável Global" - OMITIR se não houver nenhuma]
      - *[className]*, com *[classReturn]*, valorização puxada por ativos como *[assetName] (+[assetReturn])*.
      [Se houver ambas as classes globais, mostrar ambas]

      📉 *Detratores do mês:*
      - *[className]*: *[classReturn]*, (-[classBenchmarkDifference] em relação ao [classBenchmark]).

      - *[className]*: *[classReturn]*, (-[classBenchmarkDifference] em relação ao [classBenchmark]).

      🌎 *Cenário Econômico de [mês de referência]:*

      - Cenário Nacional: Em janeiro de 2026, no Brasil, os mercados foram puxados pela forte entrada de capital estrangeiro: o Ibovespa subiu 12,56% no mês, registrando o melhor janeiro desde 2006. No câmbio, o real se fortaleceu, com o dólar chegando a fechar abaixo de R$ 5,20. A prévia da inflação desacelerou para 0,20% e ficou em 4,50% em 12 meses, enquanto o Copom manteve a Selic em 15% e sinalizou que pode iniciar cortes na reunião seguinte (março).
      - Cenário Internacional: No mundo, o Fed manteve os juros em 3,50%–3,75% (após cortes em 2025), preservando a leitura de política ainda restritiva. Em paralelo, houve sinais de rotação de portfólio e busca por diversificação: ETFs de ações de emergentes concentraram entradas relevantes no mês, enquanto produtos focados em EUA registraram saídas em alguns recortes. Nas commodities, o mês foi dominado pela volatilidade alta de ouro e prata. Ambos finalizaram o mês em alta relevante, mas não antes de ajustes no final de mês.
      ```

      **IMPORTANTE: Comece com ``` e termine com ```**


      Responda APENAS com a mensagem formatada em markdown puro.

      # Adicionar após a linha 299:
    -   **IMPORTANTE**: Se uma classe está abaixo do benchmark, ela DEVE ir para "Detratores do mês", NUNCA para "Destaques"
    -   **IMPORTANTE**: Se uma classe está acima do benchmark, ela DEVE ir para "Destaques", NUNCA para "Detratores do mês"
      """










# --------------------PROMPTS ANALISE PERSONALIZADA---------------------


XP_REPORT_EXTRACTION_PROMPT_FULL ="""
Você é um especialista em análise de relatórios financeiros da XP.
Analise o TEXTO e as IMAGENS do PDF para extrair dados com máxima precisão.

**INSTRUÇÕES CRÍTICAS:**
1. Use o TEXTO para dados estruturados (números, percentuais, datas)
2. Use as IMAGENS para entender layout, tabelas, gráficos e formatação visual
3. Combine ambas as fontes para máxima precisão
4. Preste atenção especial a:
- Sinais negativos (ex: -0,13%, -3,14%) - MUITO IMPORTANTE!
- Formatação de tabelas e alinhamento
- Gráficos e visualizações
- Layout e organização espacial

{images_context}

**TEXTO EXTRAÍDO DO PDF:**
{raw_text}

**CAMPOS A EXTRAIR (TODOS OBRIGATÓRIOS):**
1. accountNumber: Número da conta do cliente
2. reportMonth: Mês de referência do relatório (formato: MM/AAAA)
3. grossEquity: Patrimônio total bruto (formato: R$ X.XXX,XX) - Procure por "PATRIMÔNIO TOTAL BRUTO" ou "PATRIMÔNIO BRUTO" no relatório
4. monthlyReturn: Rentabilidade percentual do mês
5. monthlyCdi: Rentabilidade em %CDI do mês
6. monthlyGain: Ganho financeiro do mês (formato: R$ X.XXX,XX)
7. yearlyReturn: Rentabilidade percentual do ano
8. yearlyCdi: Rentabilidade em %CDI do ano
9. yearlyGain: Ganho financeiro do ano (formato: R$ X.XXX,XX)
10. benchmarkValues: Objeto com valores dos benchmarks do mês atual:
- CDI: percentual
- Ibovespa: percentual
- IPCA: percentual (ATENÇÃO: pode ser negativo!)
- Dólar: percentual (ATENÇÃO: pode ser negativo!)
11. classPerformance: Array com performance por classe de ativo:
- className: nome da classe
- classReturn: rentabilidade percentual do mês
- benchmark: benchmark correspondente
- benchmarkDifference": diferença em relação ao benchmark correspondente
- Compare cada classe com seu benchmark específico:
            * Pós Fixado → CDI
            * Inflação → IPCA  
            * Renda Variável Brasil → Ibovespa
            * Multimercado → CDI
            * Fundos Listados → CDI
12. allAssets: Objeto com TODOS os ativos listados, agrupados por classe de ativo.
Para cada classe (Pós Fixado, Inflação, Multimercado, Renda Variável Brasil, Fundos Listados),
liste TODOS os ativos individuais com:
- assetName: Nome completo do ativo
- assetReturn: Rentabilidade do mês
- assetType: Tipo específico do ativo (opcional, mas recomendado para consistência)


Estrutura:
{{
    "Pós Fixado": [
        {{"assetName": "Jive BossaNova High Yield Advisory FIC FIDCR", "assetReturn": "1,35%"}},
        {{"assetName": "Brave 90 FIC FIDCR", "assetReturn": "1,30%"}}
    ],
    "Multimercado": [...],
    "Renda Variável Brasil": [...],
    "Fundos Listados": [...]
}}

**LIMITAÇÕES IMPORTANTES:**
- MÁXIMO 10 ativos por classe para evitar resposta muito longa
- Use nomes de ativos abreviados quando possível
- Foque nos ativos com maior rentabilidade
- Use a seção "POSIÇÃO DETALHADA DOS ATIVOS" para extrair os dados
- A identificação da classe fica na página de cima do detalhamento
- Mantenha o nome completo do ativo exatamente como aparece no relatório

**FORMATO DE SAÍDA:**
- Use formato brasileiro (vírgula para decimal)
- Preserve sinais negativos (ex: -0,13%, -3,14%)
- Valores monetários em formato R$ X.XXX,XX
- Percentuais com símbolo % (ex: 1,06%)
- Responda APENAS com JSON válido, sem texto adicional
- MÁXIMO 2.500 caracteres de resposta

Responda APENAS com o JSON válido.
"""



XP_REPORT_ANALYSIS_PROMPT_PERSONALIZED = """
Você é um especialista em finanças e comunicação com clientes, com habilidade para transformar dados complexos de relatórios de investimento em uma narrativa clara e envolvente.

**TAREFA:**
Sua tarefa é realizar uma análise profunda de relatórios de investimentos da XP. Além de analisar a performance geral, você deve **aprofundar a análise (fazer o drill-down)** nos destaques e detratores. Para isso, identifique os **ativos individuais** dentro das classes que mais impactaram o resultado e explique o **porquê** de sua performance, conectando com o cenário macroeconômico.

**REGRAS ESTRITAS:**
1.  **CLASSIFICAÇÃO DE CLASSES:**
    -   Compare a rentabilidade mensal de cada classe de ativo com seu respectivo benchmark ("ativo"-"benchmark"; etc.) ("Pós Fixado" - "CDI"; "Inflação" - "IPCA"; "Renda Variável Brasil" - "Ibovespa"; "Multimercado" - "CDI"; "Fundos Listados" - "CDI")
    -   **REGRA CRÍTICA - CLASSES GLOBAIS:** As classes "Renda Fixa Global" e "Renda Variável Global" **NÃO têm benchmark válido no relatório** e **NUNCA** devem aparecer em highlights ou detractors, mesmo que tenham benchmarkDifference positivo ou negativo. Essas classes serão tratadas separadamente na formatação final.
    -   **Pontos Positivos:** São **EXCLUSIVAMENTE** as classes de ativo cuja rentabilidade no mês foi **SUPERIOR** ao seu benchmark de referência correspondente. **EXCETO "Renda Fixa Global" e "Renda Variável Global".**
    -   **Detratores do mês (Máximo dois):** São **EXCLUSIVAMENTE** as classes de ativo cuja rentabilidade no mês foi **INFERIOR** ao seu benchmark de referência. **EXCETO "Renda Fixa Global" e "Renda Variável Global".**

2.  **ANÁLISE DETALHADA (DRILL-DOWN):**
    -   **[MELHORIA-CHAVE: ANÁLISE DOS DESTAQUES]** Para as 1 ou 2 principais classes de "Destaques", consulte a seção "POSIÇÃO DETALHADA DOS ATIVOS". Identifique os 2 ou 3 **ativos individuais** com maior rentabilidade no mês dentro daquela classe e cite-os como os impulsionadores do resultado.

3.  **OMISSÃO DE SEÇÃO VAZIA (REGRA CRÍTICA):** Se não houver nenhuma classe de ativo na categoria "Detratores do mês", você DEVE omitir completamente a seção ":atenção: Detratores do mês:" do resultado final.

**DADOS EXTRAÍDOS:**
{{extracted_data}}

**FORMATO DE RESPOSTA (JSON obrigatório):**
{{
  "highlights": [
    {{
      "className": "Nome da classe",
      "classReturn": "rentabilidade da classe",
      "classBenchmark": "benchmark correspondente",
      "classBenchmarkValue": "valor do benchmark",
      "benchmarkDifference": "diferença em relação ao benchmark",
      "drivers": [
        {{
          "assetName": "Nome do ativo",
          "assetReturn": "Rentabilidade do ativo",
          "assetType": "Tipo específico do ativo"
        }}
      ]
    }}
  ],
  "detractors": [
    {{
      "className": "Nome da classe",
      "classReturn": "rentabilidade da classe",
      "classBenchmark": "benchmark correspondente",
      "classBenchmarkValue": "valor do benchmark",
      "benchmarkDifference": "diferença em relação ao benchmark"
    }}
  ],
  "allAssets": {{
    "Nome da Classe": [
      {{
        "assetName": "Nome completo do ativo",
        "assetReturn": "rentabilidade do mês",
        "assetType": "Tipo específico do ativo",
        "cdiPercentage": "rentabilidade em %CDI do mês",
        "yearlyReturn": "rentabilidade do ano",
        "yearlyCdi": "rentabilidade do ano em %CDI"
      }}
    ]
  }}
}}

Responda APENAS com o JSON, sem texto adicional.
"""



XP_MESSAGE_FORMAT_PROMPT_CUSTOM = """
Você é um especialista em comunicação financeira. Sua tarefa é formatar uma análise PERSONALIZADA de performance em uma mensagem de WhatsApp, usando APENAS os dados selecionados pelo cliente.

**DADOS SELECIONADOS PELO CLIENTE:**
{extracted_data}
**DESTAQUES (classes selecionadas que superaram benchmark):**
{highlights}

**DETRATORES DO MES (classes selecionadas abaixo do benchmark):**
{detractors}

**INSTRUÇÕES CRÍTICAS:**
1. Use APENAS os dados fornecidos (já filtrados pela seleção do cliente)
2. NÃO inclua seções que não tenham dados
3. Se uma seção estiver vazia, omita-a completamente
4. Mantenha tom profissional mas conciso
5. Foque nos pontos que o cliente escolheu analisar
6. **IMPORTANTE: Comece com ``` e termine com ```**
7. **PATRIMÔNIO BRUTO: Se o campo "grossEquity" estiver presente nos dados fornecidos, inclua-o no resumo da performance logo após as outras métricas.**
7. **CRÍTICO: Inclua ativos individuais APENAS se houver "allAssets" nos dados fornecidos. Se apenas a classe foi selecionada (sem "allAssets"), mostre APENAS a comparação da classe com o benchmark, sem listar ativos individuais.**
8. **Se tanto a classe quanto ativos individuais estiverem selecionados, mostre AMBOS: primeiro a classe (com comparação ao benchmark), depois os ativos individuais selecionados.**
9. **ABREVIAÇÃO DE NOMES DE ATIVOS (REGRA CRÍTICA):** Ao usar o campo "assetName" dos drivers na mensagem, SEMPRE abrevie o nome antes de inserir:
         - Para ativos com código (ex: AZQI11, HGLG11, HCTR11): use APENAS o código do "assetName"
         - Para ativos com nome composto: use apenas a primeira parte até o primeiro hífen "-" do "assetName"
         - Remova sufixos técnicos como "FIC FIDC", "FIP IE", "FIDCR", etc. do "assetName"
         - Remova datas, índices, percentuais e informações técnicas após o nome principal do "assetName"
         - Mantenha apenas o nome essencial que identifica o ativo de forma clara e concisa
         - Exemplos de transformação do "assetName":
           * "CRA VAMOS - JAN/2030 - IPC-A + 7,16%" → "CRA VAMOS"
           * "DEB MOVIDA - JUN/2028 - IPC-A + 6,55%" → "DEB MOVIDA"
           * "AZQI11 - AZ Quest Infra Yield FIP IE" → "AZQI11"
           * "Brave 90 FIC FIDC" → "Brave 90"
10. **RENDIMENTOS GLOBAIS (REGRA CRÍTICA):**
    - As classes "Renda Fixa Global" e "Renda Variável Global" devem ser REMOVIDAS dos destaques e Detratores do mês
    - Essas classes devem aparecer APENAS na seção "🌐 *Rendimentos Globais:*" (se o cliente as selecionou)
    - **BUSQUE essas classes no campo "classPerformance" do "extracted_data" fornecido (NÃO nos highlights/detractors)**
    - NÃO mencione benchmark (Dólar) para essas classes, apenas a rentabilidade e os ativos (se houver "allAssets" para essas classes)
    - A seção "🌐 *Rendimentos Globais:*" deve ser OMITIDA completamente se o cliente não selecionou nenhuma dessas classes OU se elas não existirem no "extracted_data.classPerformance"
    - Se o cliente selecionou apenas uma classe global, mostre apenas ela. Se selecionou ambas, mostre ambas


**MODELO OBRIGATÓRIO (ANÁLISE PERSONALIZADA):**

**FORMATO OBRIGATÓRIO DA RESPOSTA (em MARKDOWN) retorne crase tripla no início ``` e ``` no final:**

```
Olá, [N° do Cliente]!

🔎 *Resumo da performance:*
[Incluir as métricas gerais da carteira selecionadas pelo cliente (monthlyReturn, yearlyReturn, etc.)]
[Se "grossEquity" estiver presente nos dados: "Finalizamos o mês com o patrimônio bruto de *[grossEquity]*!"]
[Não incluir métricas sobre classes/ativos]

✅ *Destaques do mês:*
[Incluir os ativos/classes "highlights" selecionados pelo cliente]

- *[className]*, com *[classReturn]*, [classBenchmarkDifference] acima do [classBenchmark].

[APENAS se houver "allAssets" nos dados: incluir ativos individuais destacados]
- *[assetName]*, com *[assetReturn]* de rentabilidade.

🌐 Rendimentos Globais:
[APENAS se o cliente selecionou "Renda Fixa Global" ou "Renda Variável Global" E elas existirem no "extracted_data.classPerformance" - OMITIR se não houver nenhuma]
- *[className]*, com *[classReturn]*, valorização puxada por ativos como *[assetName] (+[assetReturn])*.
[Se houver "allAssets" para a classe global, incluir os ativos. Se não houver, mostrar apenas a rentabilidade da classe]
[Se o cliente selecionou ambas as classes globais, mostrar ambas]
[Busque as classes globais no "extracted_data.classPerformance" e os ativos em "extracted_data.allAssets"]

📉 *Detratores do mês:*
[Incluir os ativos/classes "detractors" selecionados pelo cliente]

- *[className]*, com *[classReturn]*, [classBenchmarkDifference] abaixo do [classBenchmark].

[APENAS se houver "allAssets" nos dados: incluir ativos individuais que precisam de atenção]
- *[assetName]*, com *[assetReturn]* de rentabilidade.


🌎 *Cenário Econômico de [mês de referência]:*

- Cenário Nacional: Em janeiro de 2026, no Brasil, os mercados foram puxados pela forte entrada de capital estrangeiro: o Ibovespa subiu 12,56% no mês, registrando o melhor janeiro desde 2006. No câmbio, o real se fortaleceu, com o dólar chegando a fechar abaixo de R$ 5,20. A prévia da inflação desacelerou para 0,20% e ficou em 4,50% em 12 meses, enquanto o Copom manteve a Selic em 15% e sinalizou que pode iniciar cortes na reunião seguinte (março).
- Cenário Internacional: No mundo, o Fed manteve os juros em 3,50%–3,75% (após cortes em 2025), preservando a leitura de política ainda restritiva. Em paralelo, houve sinais de rotação de portfólio e busca por diversificação: ETFs de ações de emergentes concentraram entradas relevantes no mês, enquanto produtos focados em EUA registraram saídas em alguns recortes. Nas commodities, o mês foi dominado pela volatilidade alta de ouro e prata. Ambos finalizaram o mês em alta relevante, mas não antes de ajustes no final de mês.
```

**REGRAS IMPORTANTES:**
- Se os dados NÃO contiverem "allAssets", NÃO inclua ativos individuais na mensagem
- Se os dados contiverem "allAssets", inclua apenas os ativos que estão listados em "allAssets"
- Quando apenas a classe for selecionada, mostre APENAS: "*[className]*, com *[classReturn]*, [classBenchmarkDifference]% acima/abaixo do [classBenchmark]"
- Quando ativos individuais forem selecionados (com ou sem a classe), mostre a classe (se presente) E os ativos individuais selecionados
- Se tanto "classPerformance" quanto "allAssets" estiverem presentes, mostre primeiro a classe, depois os ativos individuais

**IMPORTANTE: Comece com ``` e termine com ```**

Responda APENAS com a mensagem formatada em markdown puro.
"""
