'use server';
/**
 * @fileOverview A flow for interacting with the Google Discovery Engine API.
 */

import { GoogleAuth } from 'google-auth-library';
import { z } from 'zod';

const SearchInputSchema = z.string();
export type SearchInput = z.infer<typeof SearchInputSchema>;

const SearchOutputSchema = z.string();
export type SearchOutput = z.infer<typeof SearchOutputSchema>;

export async function searchDiscoveryEngine(query: SearchInput): Promise<SearchOutput> {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });

  const accessToken = await auth.getAccessToken();

  if (!accessToken) {
    throw new Error('Could not obtain access token.');
  }

  const url = "https://discoveryengine.googleapis.com/v1alpha/projects/629342546806/locations/global/collections/default_collection/engines/datavisorvscoderagtest_1751310702302/servingConfigs/default_search:search";
  
  const requestBody = {
    query: query,
    pageSize: 10,
    queryExpansionSpec: { condition: "AUTO" },
    spellCorrectionSpec: { mode: "AUTO" },
    languageCode: "pt-BR",
    contentSearchSpec: {
      summarySpec: {
        summaryResultCount: 3,
        ignoreAdversarialQuery: true,
        useSemanticChunks: true,
      },
      extractiveContentSpec: {
        maxExtractiveAnswerCount: 1
      }
    },
    // For conversational context, a unique session ID should be managed per user conversation.
    // For this example, we use a static session that resets with each query.
    session: "projects/629342546806/locations/global/collections/default_collection/engines/datavisorvscoderagtest_1751310702302/sessions/-"
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error("Discovery Engine API Error:", errorBody);
        throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();
    
    if (data.summary && data.summary.summaryText) {
      return data.summary.summaryText;
    }

    return "Não encontrei um resumo para a sua pergunta, mas a busca retornou alguns resultados.";

  } catch (error) {
    console.error('Error calling Discovery Engine API:', error);
    throw new Error('Failed to get a response from the Discovery Engine.');
  }
}
