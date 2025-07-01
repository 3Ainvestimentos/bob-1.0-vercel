'use server';

import { SearchServiceClient } from '@google-cloud/discoveryengine';
import type { protos } from '@google-cloud/discoveryengine';
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
const collectionId = 'default_collection';
const engineId = 'datavisorvscoderagtest_1751310702302';
const servingConfigId = 'default_search';

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

    const client = new SearchServiceClient({ auth });

    // Manually construct the serving config path, as shown in the Python example
    const servingConfig = `projects/${projectId}/locations/${location}/collections/${collectionId}/engines/${engineId}/servingConfigs/${servingConfigId}`;

    const request: protos.google.cloud.discoveryengine.v1.ISearchRequest = {
      servingConfig: servingConfig,
      query: input.query,
      pageSize: 10,
      queryExpansionSpec: {
        condition: 'AUTO',
      },
      spellCorrectionSpec: {
        mode: 'AUTO',
      },
      contentSearchSpec: {
        extractiveContentSpec: {
          maxExtractiveAnswerCount: 1,
        },
        snippetSpec: {
          returnSnippet: true,
        },
      },
    };

    const [response] = await client.search(request);
    const firstResult = response.results && response.results[0];

    let responseText = 'Não consegui encontrar uma resposta para sua pergunta.';

    const extractiveAnswer =
      firstResult?.document?.derivedStructData?.fields?.extractive_answers
        ?.listValue?.values?.[0]?.structValue?.fields?.content?.stringValue;

    if (extractiveAnswer) {
      responseText = extractiveAnswer;
    } else {
      const snippetContent =
        firstResult?.document?.derivedStructData?.fields?.snippets?.listValue
          ?.values?.[0]?.structValue?.fields?.snippet?.stringValue;
      if (snippetContent) {
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
