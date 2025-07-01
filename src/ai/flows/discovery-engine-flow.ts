'use server';
/**
 * @fileOverview A Genkit flow for querying Google Cloud Discovery Engine.
 *
 * This flow authenticates using Application Default Credentials (ADC) and makes a direct
 * REST API call to the Discovery Engine's search endpoint. It's designed to be called
 * from a server-side component or another server action.
 *
 * - searchDiscoveryEngine - The primary function to query the engine.
 * - DiscoveryEngineInput - The Zod schema for the input.
 * - DiscoveryEngineOutput - The Zod schema for the output.
 */

import {z} from 'zod';
import {GoogleAuth} from 'google-auth-library';
import {ai} from '@/ai/genkit';

// Input schema for the flow, expecting a user's query and a unique ID.
const DiscoveryEngineInputSchema = z.object({
  query: z.string().describe('The search query from the user.'),
  userPseudoId: z.string().describe('A unique identifier for the end user.'),
});
export type DiscoveryEngineInput = z.infer<typeof DiscoveryEngineInputSchema>;

// Schema for a single search result document.
const SearchResultSchema = z.object({
  id: z.string(),
  title: z.string().optional().describe('The title of the search result document.'),
  link: z.string().optional().describe('A direct link to the document source.'),
  snippet: z.string().optional().describe('A snippet of content from the result.'),
});

// Output schema for the flow, containing the summarized answer and a list of results.
const DiscoveryEngineOutputSchema = z.object({
  summary: z.string().describe('The summarized text answer from the search.'),
  results: z.array(SearchResultSchema).describe('A list of source documents for the summary.'),
});
export type DiscoveryEngineOutput = z.infer<typeof DiscoveryEngineOutputSchema>;

// This is the exported function that our React component will call.
export async function searchDiscoveryEngine(input: DiscoveryEngineInput): Promise<DiscoveryEngineOutput> {
  return await discoveryEngineFlow(input);
}

// Define the Genkit flow.
const discoveryEngineFlow = ai.defineFlow(
  {
    name: 'discoveryEngineFlow',
    inputSchema: DiscoveryEngineInputSchema,
    outputSchema: DiscoveryEngineOutputSchema,
  },
  async (input) => {
    // These values are from the user's provided curl command.
    const projectId = '629342546806';
    const engineId = 'datavisorvscoderagtest_1751310702302';
    const location = 'global';
    const collectionId = 'default_collection';
    const servingConfigId = 'default_search';

    const url = `https://discoveryengine.googleapis.com/v1alpha/projects/${projectId}/locations/${location}/collections/${collectionId}/engines/${engineId}/servingConfigs/${servingConfigId}:search`;

    const payload = {
      query: input.query,
      userPseudoId: input.userPseudoId,
      pageSize: 5,
      queryExpansionSpec: {condition: 'AUTO'},
      spellCorrectionSpec: {mode: 'AUTO'},
      languageCode: 'pt-BR',
      contentSearchSpec: {
        extractiveContentSpec: {
          maxExtractiveAnswerCount: 1,
        },
      },
      session: `projects/${projectId}/locations/${location}/collections/${collectionId}/engines/${engineId}/sessions/-`,
    };

    const auth = new GoogleAuth({
      scopes: 'https://www.googleapis.com/auth/cloud-platform',
    });

    try {
      // Step 1: Explicitly get the access token. The original error happened here.
      const client = await auth.getClient();
      const accessTokenResponse = await client.getAccessToken();
      const accessToken = accessTokenResponse.token;

      if (!accessToken) {
        throw new Error('Falha ao obter o token de acesso da conta de serviço.');
      }

      // Step 2: Make the API call using the token and the global fetch API.
      const apiResponse = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await apiResponse.json();

      if (!apiResponse.ok) {
        const errorDetail = data?.error?.message || `Status: ${apiResponse.status}`;
        console.error('Discovery Engine API returned an error:', errorDetail);
        throw new Error(`A API do Discovery Engine retornou um erro: ${errorDetail}`);
      }

      const results: z.infer<typeof SearchResultSchema>[] =
        data.results?.map((res: any) => ({
          id: res.document.id,
          title: res.document.derivedStructData?.title,
          link: res.document.derivedStructData?.link,
          snippet: res.document.derivedStructData?.snippets?.[0]?.snippet,
        })) || [];
        
      const summary = data.summary?.summaryText || "Não foi possível gerar um resumo.";

      return {
        summary,
        results,
      };

    } catch (error: any) {
      console.error("Error in discoveryEngineFlow:", error.message);
      // Provide a more helpful error message to the frontend.
      const detail = error.message || 'Erro desconhecido.';
      throw new Error(`A autenticação com a API do Google falhou. Verifique as permissões e a configuração. Detalhe: ${detail}`);
    }
  }
);
