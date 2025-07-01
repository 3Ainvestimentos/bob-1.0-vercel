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

const projectId = 'datavisor-44i5m';
const location = 'global';
const engineId = 'datavisorvscoderagtest_1751310702302';

const endpoint = `https://discoveryengine.googleapis.com/v1alpha/projects/${projectId}/locations/${location}/collections/default_collection/engines/${engineId}/servingConfigs/default_search:search`;

export async function askChatbot(input: ChatbotInput): Promise<ChatbotResponse> {
  try {
    if (!process.env.SERVICE_ACCOUNT_KEY) {
      throw new Error(
        'A variável de ambiente SERVICE_ACCOUNT_KEY não está definida.'
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

    const accessToken = await auth.getAccessToken();

    // This request body mirrors the exact structure of the working curl command.
    const requestBody = {
      query: input.query,
      pageSize: 10,
      queryExpansionSpec: {
        condition: 'AUTO',
      },
      spellCorrectionSpec: {
        mode: 'AUTO',
      },
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

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      cache: 'no-store',
    });

    if (!response.ok) {
        const errorBody = await response.json();
        console.error('API Error:', errorBody);
        throw new Error(`A API retornou um erro: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    let responseText = 'Não consegui encontrar uma resposta para sua pergunta.';

    const firstResult = data.results && data.results[0];

    // Check for a direct extractive answer, which is what the working curl command asks for.
    const extractiveAnswer =
      firstResult?.document?.derivedStructData?.fields?.extractive_answers
        ?.listValue?.values?.[0]?.structValue?.fields?.content?.stringValue;

    if (extractiveAnswer) {
      responseText = extractiveAnswer;
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
