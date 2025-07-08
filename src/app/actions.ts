
'use server';

import { GoogleAuth } from 'google-auth-library';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from '@/lib/firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

const ASSISTENTE_CORPORATIVO_PREAMBLE = `Você é o 'Assistente Corporativo 3A RIVA', a inteligência artificial de suporte da 3A RIVA. Seu nome é Bob. Seu propósito é ser um parceiro estratégico para todos os colaboradores da 3A RIVA, auxiliando em uma vasta gama de tarefas com informações precisas e seguras.

## REGRAS E DIRETRIZES DE ATUAÇÃO (SEGUIR ESTRITAMENTE)

### 1. IDENTIDADE E TOM DE VOZ
- **Identidade:** Você é Bob, o Assistente Corporativo 3A RIVA.
- **Tom de Voz:** Profissional, claro, objetivo e estruturado. Use listas, marcadores e tabelas para organizar informações.

### 2. SEGURANÇA E CONFIDENCIALIDADE (REGRA MÁXIMA E INEGOCIÁVEL)
- **PII (Informações de Identificação Pessoal):** NUNCA, sob nenhuma circunstância, processe, armazene ou solicite dados sensíveis de clientes ou colaboradores (nomes, CPFs, RGs, endereços, telefones, dados bancários, etc.).
- **Ação em Caso de Recebimento de PII:** Se um usuário fornecer dados sensíveis, sua resposta IMEDIATA deve ser: recusar a execução da tarefa e instruir o usuário a reenviar a solicitação com os dados anonimizados. A segurança é a prioridade absoluta.

### 3. FONTES DE CONHECIMENTO (REGRA CRÍTICA E INEGOCIÁVEL)
- **Fonte Única:** Sua ÚNICA fonte de conhecimento são os documentos internos fornecidos nesta consulta. Responda ESTRITAMENTE e APENAS com base nessas informações.
- **PROIBIÇÃO TOTAL DE CONHECIMENTO EXTERNO:** É TOTALMENTE PROIBIDO usar seu conhecimento pré-treinado ou qualquer informação externa. Não invente, não infira, não adivinhe, nem complemente informações que não estão explicitamente nos documentos.
- **PROCEDIMENTO EM CASO DE FALHA:** Se a resposta para a pergunta do usuário não puder ser encontrada de forma clara e direta nos documentos fornecidos, sua única e exclusiva resposta DEVE SER a seguinte frase, sem nenhuma alteração ou acréscimo: "Com base nos dados internos não consigo realizar essa resposta. Deseja procurar na web?"
- **Links:** Se a fonte de dados for um link, formate-o como um hyperlink em Markdown. Exemplo: [Título](url).

### 4. ESCOPO E LIMITAÇÕES
- **Papel:** Você é um suporte à decisão, não o tomador de decisão final.
- **Aconselhamento Financeiro:** Você NÃO DEVE fornecer aconselhamento financeiro ou recomendações de investimento para clientes finais.
- **Opiniões:** Não emita opiniões pessoais ou juízos de valor. Mantenha-se neutro e factual.`;

function estimateTokens(text: string): number {
  // Uma aproximação comum é que 1 token equivale a cerca de 4 caracteres.
  return Math.ceil((text || '').length / 4);
}

async function callDiscoveryEngine(query: string, userId?: string | null): Promise<{ summary: string; searchFailed: boolean; promptTokenCount?: number; candidatesTokenCount?: number }> {
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
      const promptTokenCount = estimateTokens(ASSISTENTE_CORPORATIVO_PREAMBLE + query);
      const failureMessage = "Com base nos dados internos não consigo realizar essa resposta. Deseja procurar na web?";
      
      if (!data.summary || !data.summary.summaryText || !data.results || data.results.length === 0) {
          const candidatesTokenCount = estimateTokens(failureMessage);
          return { 
              summary: failureMessage, 
              searchFailed: true,
              promptTokenCount,
              candidatesTokenCount
          };
      }

      const summary = data.summary.summaryText;
      const searchFailed = summary.trim() === failureMessage.trim();

      if (searchFailed) {
        const candidatesTokenCount = estimateTokens(summary);
        return { 
          summary, 
          searchFailed: true,
          promptTokenCount,
          candidatesTokenCount
        };
      }

      const candidatesTokenCount = estimateTokens(summary);
      return { summary, searchFailed: false, promptTokenCount, candidatesTokenCount };

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
  userId?: string | null
): Promise<{ summary: string; searchFailed: boolean; promptTokenCount?: number; candidatesTokenCount?: number }> {
  try {
    return await callDiscoveryEngine(originalQuery, userId);
  } catch (error: any) {
    console.error("Error in regenerateAnswer (internal):", error.message);
    throw new Error(`Ocorreu um erro ao se comunicar com o assistente para regenerar a resposta: ${error.message}`);
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


export async function generateTitleForConversation(
  query: string
): Promise<string> {
  const fallbackTitle = query.length > 30 ? query.substring(0, 27) + '...' : query;
  
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    console.error("A variável de ambiente GEMINI_API_KEY não está definida. Não é possível gerar título.");
    return fallbackTitle;
  }

  const prompt = `Gere um título curto e descritivo em português com no máximo 5 palavras para a seguinte pergunta. Retorne APENAS o título, sem aspas, marcadores ou qualquer outro texto.

Pergunta: "${query}"`;

  try {
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash-latest",
      generationConfig: {
        temperature: 0.1,
      },
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const title = response.text().trim().replace(/"/g, '');

    if (title && title.length > 0 && title.length < 60) {
      return title;
    }
    
    return fallbackTitle;

  } catch (error: any) {
    console.error("Erro ao gerar título da conversa:", error.message);
    return fallbackTitle;
  }
}


export async function logDlpAlert(
  userId: string,
  chatId: string,
  originalQuery: string,
  findings: any[]
) {
  if (!userId || !findings || findings.length === 0) {
    return;
  }
  try {
    const alertRef = collection(db, 'dlp_alerts');
    await addDoc(alertRef, {
      userId,
      chatId,
      originalQuery,
      findings: findings.map((f) => ({
        infoType: f.infoType?.name || 'Desconhecido',
        likelihood: f.likelihood || 'Desconhecido',
        quote: f.quote || 'N/A',
      })),
      detectedAt: serverTimestamp(),
      status: 'new',
    });
  } catch (error) {
    console.error('Error logging DLP alert to Firestore:', error);
    // Fail silently. Alert logging should not interrupt the user experience.
  }
}
