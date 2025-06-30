'use server';
/**
 * @fileOverview A flow for interacting with the Google Discovery Engine API using the official Node.js client library.
 */
import { SearchServiceClient } from '@google-cloud/discoveryengine';
import { z } from 'zod';

const SearchInputSchema = z.string();
export type SearchInput = z.infer<typeof SearchInputSchema>;

const SearchOutputSchema = z.string();
export type SearchOutput = z.infer<typeof SearchOutputSchema>;

// The full resource name of the search engine serving config.
const servingConfig = 'projects/629342546806/locations/global/collections/default_collection/engines/datavisorvscoderagtest_1751310702302/servingConfigs/default_search';

// The session resource name. Using a static session for this example.
const session = 'projects/629342546806/locations/global/collections/default_collection/engines/datavisorvscoderagtest_1751310702302/sessions/-';

// Initialize the Discovery Engine client.
// The library will automatically handle authentication using Application Default Credentials.
const searchClient = new SearchServiceClient({
    apiEndpoint: 'global-discoveryengine.googleapis.com',
});

export async function searchDiscoveryEngine(query: SearchInput): Promise<SearchOutput> {
  try {
    const [response] = await searchClient.search({
      servingConfig: servingConfig,
      session: session,
      query: query,
      pageSize: 10,
      queryExpansionSpec: {
        condition: 'AUTO',
      },
      spellCorrectionSpec: {
        mode: 'AUTO',
      },
      contentSearchSpec: {
        summarySpec: {
          summaryResultCount: 3,
          ignoreAdversarialQuery: true,
          useSemanticChunks: true,
        },
        extractiveContentSpec: {
          maxExtractiveAnswerCount: 1,
        },
      },
      userInfo: {
          timeZone: 'America/Sao_Paulo'
      }
      // Note: languageCode 'pt-BR' from the curl example is usually inferred by the service.
    });

    if (response.summary?.summaryText) {
      return response.summary.summaryText;
    }

    // Fallback message if no summary is found.
    return "Não encontrei um resumo para a sua pergunta, mas a busca retornou alguns resultados.";

  } catch (error) {
    console.error('Error calling Discovery Engine API with Node.js client:', error);
    // Propagate a more informative error message to the client.
    throw new Error('Failed to get a response from the Discovery Engine. The connection failed.');
  }
}
