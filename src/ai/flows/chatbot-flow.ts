'use server';

import { GoogleAuth } from 'google-auth-library';

// Define the structure for a single message in the chat
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

// Define the structure of the response we expect from our flow
export interface ChatbotResponse {
  message: ChatMessage;
}

// Define the input for our main function
export interface ChatbotInput {
  query: string;
}

const projectId = '629342546806';
const location = 'global';
const collectionId = 'default_collection';
const engineId = 'datavisorvscoderagtest_1751310702302';
const servingConfigId = 'default_search';

const url = `https://discoveryengine.googleapis.com/v1alpha/projects/${projectId}/locations/${location}/collections/${collectionId}/engines/${engineId}/servingConfigs/${servingConfigId}:search`;

export async function askChatbot(input: ChatbotInput): Promise<ChatbotResponse> {
  try {
    if (!process.env.SERVICE_ACCOUNT_KEY) {
      throw new Error(
        'A variável de ambiente SERVICE_ACCOUNT_KEY não está definida. Por favor, verifique o arquivo .env.'
      );
    }
    const serviceAccountKey = JSON.parse(process.env.SERVICE_ACCOUNT_KEY);

    const auth = new GoogleAuth({
      credentials: {
        client_email: serviceAccountKey.client_email,
        private_key: serviceAccountKey.private_key.replace(/\\n/g, '\n'),
      },
      scopes: 'https://www.googleapis.com/auth/cloud-platform',
    });

    const token = await auth.getAccessToken();

    const requestBody = {
      query: input.query,
      pageSize: 10,
      queryExpansionSpec: { condition: 'AUTO' },
      spellCorrectionSpec: { mode: 'AUTO' },
      languageCode: 'pt-BR',
      contentSearchSpec: {
        extractiveContentSpec: {
          maxExtractiveAnswerCount: 1,
        },
      },
      userInfo: {
        timeZone: 'America/Sao_Paulo',
      },
      session: `projects/${projectId}/locations/${location}/collections/${collectionId}/engines/${engineId}/sessions/-`,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      cache: 'no-store',
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('API Error Response:', errorText);
      throw new Error(`A API retornou um erro: ${res.status} ${res.statusText}`);
    }

    const response = await res.json();

    let responseText =
      'Não consegui encontrar uma resposta para sua pergunta.';

    const firstResult = response.results && response.results[0];

    // Priority 1: Direct extractive answer
    const extractiveAnswer =
      firstResult?.document?.derivedStructData?.fields?.extractive_answers?.listValue?.values?.[0]?.structValue?.fields?.content?.stringValue;
    if (extractiveAnswer) {
      responseText = extractiveAnswer;
    }
    // Priority 2: Document snippets
    else {
      const snippetContent =
        firstResult?.document?.derivedStructData?.fields?.snippets?.listValue?.values?.[0]?.structValue?.fields?.snippet?.stringValue;
      if (snippetContent) {
        // Clean HTML tags that might come in snippets
        const snippet = snippetContent.replace(/<[^>]*>/g, '');
        responseText = `Não encontrei uma resposta direta, mas aqui está um trecho relevante do documento:\n\n"${snippet}"`;
      }
    }

    return {
      message: {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: responseText,
      },
    };
  } catch (error: any) {
    console.error('Erro no fluxo askChatbot:', error);
    return {
      message: {
        id: `assistant-error-${Date.now()}`,
        role: 'assistant',
        text: `Ocorreu um erro ao conectar ao assistente: ${error.message}`,
      },
    };
  }
}
