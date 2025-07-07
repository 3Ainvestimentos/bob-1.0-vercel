
'use server';

import { GoogleAuth } from 'google-auth-library';
import { GoogleGenerativeAI } from '@google/generative-ai';

const ASSISTENTE_CORPORATIVO_PREAMBLE = `Você é o 'Assistente Corporativo 3A RIVA', a inteligência artificial de suporte da 3A RIVA. Seu nome é Bob. Seu propósito é ser um parceiro estratégico para todos os colaboradores da 3A Investimentos e 3A RIVA, auxiliando em uma vasta gama de tarefas com informações precisas e seguras.

## REGRAS E DIRETRIZES DE ATUAÇÃO

### 1. IDENTIDADE E TOM DE VOZ
- **Identidade:** Você é Bob, o Assistente Corporativo 3A RIVA.
- **Tom de Voz:** Mantenha um tom profissional, mas adaptável ao contexto da conversa. Seja claro, objetivo e estruturado. Utilize recursos como listas, marcadores e tabelas para organizar informações complexas e facilitar a leitura.

### 2. SEGURANÇA E CONFIDENCIALIDADE (REGRA MÁXIMA E INEGOCIÁVEL)
- **PII (Informações de Identificação Pessoal):** NUNCA, sob nenhuma circunstância, processe, armazene ou solicite dados sensíveis de clientes ou colaboradores. Isso inclui, mas não se limita a: nomes completos, CPFs, RGs, endereços, números de telefone, detalhes de contas bancárias ou de investimento.
- **Ação em Caso de Recebimento de PII:** Se um usuário fornecer dados sensíveis, sua resposta IMEDIATA deve ser: recusar a execução da tarefa e instruir o usuário a reenviar a solicitação com os dados devidamente anonimizados. A segurança é a prioridade absoluta.

### 3. FONTES DE CONHECIMENTO E CITAÇÃO
- **Fonte Primária:** Sua base de conhecimento principal são os dados internos fornecidos especificamente para a consulta atual. Responda ESTRITAMENTE com base nessas informações. Não invente ou infira dados que não foram fornecidos.
- **Conhecimento Externo:** Se a informação não estiver nos dados internos e você precisar usar seu conhecimento geral ou realizar uma busca na web, você DEVE citar a origem de forma explícita. Inicie a resposta com "Segundo fontes públicas..." ou "Após uma busca na web...".
- **Formatação de Links:** Se uma fonte de dados for um link (URL), você deve formatá-lo como um hyperlink em Markdown para fácil acesso. Exemplo: [Título do Artigo](https://...).

### 4. ESCOPO E LIMITAÇÕES
- **Papel:** Você é uma ferramenta de suporte à decisão, não o tomador de decisão final. Suas análises e resumos servem para empoderar os colaboradores.
- **Aconselhamento Financeiro:** Você NÃO DEVE fornecer aconselhamento financeiro ou recomendações de investimento para clientes finais.
- **Opiniões:** Não emita opiniões pessoais ou juízos de valor. Mantenha-se neutro e factual.

### 5. USO DE FERRAMENTAS
- **Busca na Web:** Utilize a ferramenta 'performWebSearch' quando for necessário obter informações de mercado, notícias recentes ou dados públicos que não estão disponíveis nos documentos internos. Ao usar a ferramenta, resuma os resultados encontrados e cite os links de origem conforme a regra de formatação.`;


async function callDiscoveryEngine(query: string, userId?: string | null): Promise<{ summary: string; searchFailed: boolean }> {
    const serviceAccountKeyJson = process.env.SERVICE_ACCOUNT_KEY_INTERNAL;
    if (!serviceAccountKeyJson) {
      throw new Error(`A variável de ambiente necessária (SERVICE_ACCOUNT_KEY_INTERNAL) não está definida no arquivo .env.`);
    }

    let serviceAccountCredentials;
    try {
      serviceAccountCredentials = JSON.parse(serviceAccountKeyJson);
      if (serviceAccountCredentials.private_key) {
        serviceAccountCredentials.private_key = serviceAccountCredentials.private_key.replace(/\\n/g, '\n');
      }
    } catch (e: any) {
      console.error(`Falha ao analisar SERVICE_ACCOUNT_KEY_INTERNAL. Verifique o formato do JSON no seu arquivo .env. Erro:`, e.message);
      throw new Error(`Falha ao analisar a chave da conta de serviço (SERVICE_ACCOUNT_KEY_INTERNAL). Verifique se a variável de ambiente está definida e se o valor é um JSON válido e formatado corretamente em uma única linha no arquivo .env.`);
    }

    const projectId = serviceAccountCredentials.project_id;
    const location = 'global';
    const engineId = 'datavisorvscoderagtest_1751310702302';
    const collectionId = 'default_collection';
    const servingConfigId = 'default_search';

    const url = `https://discoveryengine.googleapis.com/v1alpha/projects/${projectId}/locations/${location}/collections/${collectionId}/engines/${engineId}/servingConfigs/${servingConfigId}:search`;
    
    const auth = new GoogleAuth({
      credentials: serviceAccountCredentials,
      scopes: 'https://www.googleapis.com/auth/cloud-platform',
    });

    try {
      const client = await auth.getClient();
      const accessTokenResponse = await client.getAccessToken();
      const accessToken = accessTokenResponse.token;

      if (!accessToken) {
        throw new Error(`Falha ao obter o token de acesso usando a conta de serviço (SERVICE_ACCOUNT_KEY_INTERNAL).`);
      }

      const requestBody: any = {
        query: query,
        pageSize: 5,
        queryExpansionSpec: { condition: 'AUTO' },
        spellCorrectionSpec: { mode: 'AUTO' },
        languageCode: 'pt-BR',
        contentSearchSpec: {
            summarySpec: {
              summaryResultCount: 5,
              ignoreAdversarialQuery: true,
              useSemanticChunks: true,
              modelPromptSpec: {
                preamble: ASSISTENTE_CORPORATIVO_PREAMBLE
              }
            }
        },
        userPseudoId: userId || 'anonymous-user',
      };

      const apiResponse = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        console.error("API Error Response:", errorText);
        throw new Error(`A API retornou um erro: ${apiResponse.status}. Resposta: ${errorText}`);
      }

      const data = await apiResponse.json();
      
      if (!data.results || data.results.length === 0) {
          return { 
              summary: "Com base nos dados internos não consigo realizar essa resposta. Deseja procurar na web?", 
              searchFailed: true 
          };
      }

      const summary = data.summary?.summaryText || "Não foi possível gerar um resumo.";

      const internalSearchFailureKeywords = [
          "não encontrei a informação",
          "não foi possível encontrar",
          "informações públicas de mercado",
          "busca na web",
          "nenhum resultado encontrado",
          "não foi possível gerar um resumo",
          "no results could be found"
      ];
      
      const searchFailed = internalSearchFailureKeywords.some(keyword => 
        summary.toLowerCase().includes(keyword)
      );

      if (searchFailed) {
        return { 
          summary: "Com base nos dados internos não consigo realizar essa resposta. Deseja procurar na web?", 
          searchFailed: true 
        };
      }

      return { summary, searchFailed: false };

    } catch (error: any) {
      console.error("Error in callDiscoveryEngine:", error.message);
      if (error.message.includes('Could not refresh access token') || error.message.includes('permission')) {
         throw new Error(`Erro de permissão. Verifique no IAM se a conta de serviço (SERVICE_ACCOUNT_KEY_INTERNAL) tem o papel "Usuário do Discovery Engine".`);
      }
      throw new Error(`Ocorreu um erro ao se comunicar com o Discovery Engine: ${error.message}`);
    }
}


async function callGemini(query: string): Promise<{ summary: string; searchFailed: boolean; promptTokenCount?: number; candidatesTokenCount?: number }> {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    throw new Error("A variável de ambiente GEMINI_API_KEY não está definida. Por favor, adicione-a ao seu arquivo .env.");
  }
  
  try {
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-pro-latest",
      generationConfig: {
        temperature: 0.2
      } 
    });
    
    const prompt = `Você é um assistente de pesquisa prestativo. Responda à seguinte pergunta do usuário da forma mais completa e precisa possível com base em seu conhecimento geral.

Pergunta: "${query}"`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    const promptTokenCount = response.usageMetadata?.promptTokenCount;
    const candidatesTokenCount = response.usageMetadata?.candidatesTokenCount;

    return { summary: text, searchFailed: false, promptTokenCount, candidatesTokenCount };

  } catch (error: any) {
    console.error("Error calling Gemini API:", error);
    if (error.message.includes('API key not valid')) {
      throw new Error(`A chave da API do Gemini (GEMINI_API_KEY) parece ser inválida. Verifique a chave no seu arquivo .env e no Google AI Studio.`);
    }
    throw new Error(`Ocorreu um erro ao se comunicar com o Gemini: ${error.message}`);
  }
}


export async function askAssistant(
  query: string,
  options: { useWebSearch?: boolean } = {},
  userId?: string | null
): Promise<{ summary: string; searchFailed: boolean; promptTokenCount?: number; candidatesTokenCount?: number }> {
  const { useWebSearch = false } = options;

  try {
    if (useWebSearch) {
      return await callGemini(query);
    } else {
      return await callDiscoveryEngine(query, userId);
    }
  } catch (error: any) {
    console.error("Error in askAssistant:", error.message);
    // Re-throw a user-friendly error
    throw new Error(`Ocorreu um erro ao se comunicar com o assistente: ${error.message}`);
  }
}

export async function regenerateAnswer(
  originalQuery: string,
  previousAnswer: string
): Promise<{ summary: string; searchFailed: boolean; promptTokenCount?: number; candidatesTokenCount?: number }> {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    throw new Error(
      'A variável de ambiente GEMINI_API_KEY não está definida.'
    );
  }

  try {
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-pro-latest',
      generationConfig: {
        temperature: 0.5, // Aumenta um pouco a criatividade para obter uma resposta diferente
      },
    });

    const prompt = `Você é o "Assistente Corporativo 3A RIVA".
Um colaborador fez a seguinte pergunta:
---
PERGUNTA ORIGINAL:
"${originalQuery}"
---

Sua resposta anterior foi:
---
RESPOSTA ANTERIOR (INSATISFATÓRIA):
"${previousAnswer}"
---

O colaborador não ficou satisfeito com a resposta anterior e solicitou uma nova.
Gere uma nova resposta para a PERGUNTA ORIGINAL. Tente uma abordagem diferente, talvez com mais detalhes, um formato distinto ou uma perspectiva alternativa. Lembre-se de seguir todas as suas diretrizes de identidade e princípios de atuação.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    const promptTokenCount = response.usageMetadata?.promptTokenCount;
    const candidatesTokenCount = response.usageMetadata?.candidatesTokenCount;


    return { summary: text, searchFailed: false, promptTokenCount, candidatesTokenCount };
  } catch (error: any) {
    console.error('Error calling Gemini API for regeneration:', error);
    if (error.message.includes('API key not valid')) {
      throw new Error(
        `A chave da API do Gemini (GEMINI_API_KEY) parece ser inválida.`
      );
    }
    throw new Error(
      `Ocorreu um erro ao se comunicar com o Gemini para regenerar a resposta: ${error.message}`
    );
  }
}


export async function generateSuggestedQuestions(
  query: string,
  answer: string
): Promise<string[]> {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    console.error("A variável de ambiente GEMINI_API_KEY não está definida. Não é possível gerar sugestões.");
    return [];
  }

  const prompt = `Baseado na pergunta do usuário e na resposta do assistente, gere 3 perguntas de acompanhamento curtas e relevantes que o usuário poderia fazer a seguir. Retorne APENAS um array JSON de strings, sem nenhum outro texto ou formatação. As perguntas devem ser concisas e em português.

  Pergunta do Usuário: "${query}"
  Resposta do Assistente: "${answer}"`;

  try {
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-pro-latest",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1
      },
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const suggestions = JSON.parse(response.text());

    if (Array.isArray(suggestions) && suggestions.every(s => typeof s === 'string')) {
      return suggestions;
    }

    console.warn("A resposta da IA para sugestões não era um array de strings:", suggestions);
    return [];
  } catch (error: any) {
    console.error("Erro ao gerar sugestões:", error.message);
    return []; 
  }
}
