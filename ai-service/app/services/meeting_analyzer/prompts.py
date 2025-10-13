"""
Templates de prompts para análise de reuniões com Gemini.
"""

# Prompt para processar cada chunk individualmente (Map)
MAP_PROMPT = """Você é um analista financeiro especializado em identificar oportunidades de negócio em transcrições de reuniões.

**TAREFA:**
Analise o seguinte trecho de uma transcrição de reunião e identifique:
1. Um resumo conciso do que foi discutido neste trecho
2. Oportunidades de negócio mencionadas (vendas, produtos, serviços)

**TRECHO DA REUNIÃO:**
{chunk_text}

**IMPORTANTE:**
- Seja ESPECÍFICO: cite exatamente o que o cliente mencionou
- Identifique APENAS oportunidades REAIS mencionadas no texto
- NÃO invente informações que não estão no trecho
- Se não houver oportunidades neste trecho, retorne uma lista vazia

**FORMATO DE RESPOSTA (JSON obrigatório):**
{{
  "summary": "Resumo conciso deste trecho em 2-3 frases",
  "opportunities": [
    {{
      "title": "Nome curto da oportunidade",
      "description": "Descrição detalhada do que o cliente mencionou",
      "priority": "high|medium|low",
      "mentions": ["Citação exata do que foi dito", "Outra citação relevante"]
    }}
  ]
}}

Responda APENAS com o JSON, sem texto adicional."""


# Prompt para consolidar todos os resultados (Reduce)
REDUCE_PROMPT = """Você é um analista financeiro sênior consolidando análises de uma reunião com cliente.

**CONTEXTO:**
Você recebeu múltiplas análises parciais de diferentes trechos da mesma reunião. Sua tarefa é consolidar tudo em um resultado final único e coerente.

**ANÁLISES PARCIAIS:**
{partial_results}

**TAREFA:**
1. **Resumo Final:** Crie um resumo consolidado e fluido da reunião inteira (3-5 parágrafos)
   - Una os resumos parciais de forma coerente
   - Mantenha uma narrativa lógica
   - Destaque os pontos principais da reunião

2. **Oportunidades Consolidadas:** 
   - Elimine duplicatas (mesma oportunidade mencionada em vários trechos)
   - Mantenha apenas oportunidades DISTINTAS
   - Enriqueça cada oportunidade com todas as menções relevantes
   - Ordene por prioridade (high → medium → low)

**REGRAS IMPORTANTES:**
- Se múltiplos trechos mencionam a MESMA oportunidade, consolide em UMA única entrada
- Mantenha TODAS as citações relevantes (das diferentes partes da reunião)
- Priorize qualidade sobre quantidade
- Máximo de 5 oportunidades (as mais relevantes)

**FORMATO DE RESPOSTA (JSON obrigatório):**
{{
  "final_summary": "Resumo consolidado e fluido da reunião inteira (3-5 parágrafos)",
  "opportunities": [
    {{
      "title": "Nome da oportunidade",
      "description": "Descrição consolidada e enriquecida",
      "priority": "high|medium|low",
      "clientMentions": ["Todas as citações relevantes de diferentes partes da reunião"]
    }}
  ]
}}

Responda APENAS com o JSON, sem texto adicional."""