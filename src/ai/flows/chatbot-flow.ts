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

// A simple interface for the user object passed from the client
interface AuthUser {
    uid: string;
}

// These constants now exactly match the user's working curl command.
const projectNumber = '629342546806';
const location = 'global';
const engineId = 'datavisorvscoderagtest_1751310702302';

// The endpoint is now built using the project number to match the working curl command.
const endpoint = `https://discoveryengine.googleapis.com/v1alpha/projects/${projectNumber}/locations/${location}/collections/default_collection/engines/${engineId}/servingConfigs/default_search:search`;

export async function askChatbot(input: ChatbotInput, user: AuthUser): Promise<ChatbotResponse> {
  try {
    // This uses Application Default Credentials (ADC).
    // - Locally: ADC uses credentials from `gcloud auth application-default login`.
    // - In Production (App Hosting): ADC uses the attached service account.
    const auth = new GoogleAuth({
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
        // Pass the logged-in user's ID for potential personalization
        userId: user.uid,
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
        throw new Error(`A API retornou um erro: ${response.status} ${response.statusText}. Verifique se a conta autenticada possui a permissão "Discovery Engine User". Detalhes: ${JSON.stringify(errorBody.error?.message)}`);
    }

    const data = await response.json();

    let responseText = 'Não consegui encontrar uma resposta para sua pergunta.';

    const firstResult = data.results && data.results[0];
    if (firstResult) {
      // First, try to get the direct extractive answer. This is likely the best response.
      const extractiveAnswer =
        firstResult.document?.derivedStructData?.fields?.extractive_answers
          ?.listValue?.values?.[0]?.structValue?.fields?.content?.stringValue;

      if (extractiveAnswer) {
        responseText = extractiveAnswer;
      } else {
        // If there's no direct answer, fall back to a snippet.
        const snippet = firstResult.document?.derivedStructData?.fields?.snippets?.listValue?.values?.[0]?.structValue?.fields?.snippet?.stringValue;
        if (snippet) {
            responseText = snippet.replace(/\n/g, ' ');
        } else {
          // If we reach here, we have a result but no answer. Log it for debugging.
          console.warn("API returned results but no parsable answer. Full data:", JSON.stringify(data, null, 2));
        }
      }
    } else {
      console.warn("API returned no results for query:", input.query);
    }

    return {
      message: {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: responseText,
      },
    };
  } catch (error: any) {
    console.error('Erro detalhado no fluxo askChatbot:', error);

    // Provide a more actionable error message to the user.
    const errorMessage = `A autenticação com o Google falhou. Se estiver desenvolvendo localmente, tente executar 'gcloud auth application-default login' em seu terminal. Detalhe do erro: ${error.message}`;

    return {
      message: {
        id: `assistant-error-${Date.now()}`,
        role: 'assistant',
        text: errorMessage,
      },
    };
  }
}
