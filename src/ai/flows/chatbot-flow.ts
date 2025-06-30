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

const PROJECT_ID = '629342546806';
const ENGINE_ID = 'datavisorvscoderagtest_1751310702302';
const LOCATION = 'global';

const API_ENDPOINT = `https://discoveryengine.googleapis.com/v1alpha/projects/${PROJECT_ID}/locations/${LOCATION}/collections/default_collection/engines/${ENGINE_ID}/servingConfigs/default_search:search`;

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
        private_key: serviceAccountKey.private_key,
      },
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });

    const accessToken = await auth.getAccessToken();
    if (!accessToken) {
      throw new Error('Não foi possível obter o token de acesso usando a chave de conta de serviço.');
    }

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
    };

    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Erro na API do Discovery Engine:', response.status, data);
      const errorMessage =
        data.error?.message ||
        `A requisição à API falhou com o status ${response.status}`;
      throw new Error(errorMessage);
    }

    let responseText =
      'Não consegui encontrar uma resposta para sua pergunta.';

    // Procure por respostas extrativas na resposta
    if (
      data.results &&
      data.results[0] &&
      data.results[0].document?.derivedStructData?.extractive_answers &&
      data.results[0].document.derivedStructData.extractive_answers[0]?.content
    ) {
      responseText =
        data.results[0].document.derivedStructData.extractive_answers[0].content;
    } else if (data.summary?.summaryText) {
      // Use o resumo como fallback se existir
      responseText = data.summary.summaryText;
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
    // Retorne uma mensagem de erro amigável para o usuário
    return {
      message: {
        id: `assistant-error-${Date.now()}`,
        role: 'assistant',
        text: `Ocorreu um erro ao conectar ao assistente: ${error.message}`,
      },
    };
  }
}
