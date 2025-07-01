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

// Input schema for the flow, expecting a user's query.
export const DiscoveryEngineInputSchema = z.object({
  query: z.string().describe('The search query from the user.'),
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
export const DiscoveryEngineOutputSchema = z.object({
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
  async ({query}) => {
    // These values are from the user's provided curl command.
    const projectId = '629342546806';
    const engineId = 'datavisorvscoderagtest_1751310702302';
    const location = 'global';
    const collectionId = 'default_collection';
    const servingConfigId = 'default_search';

    const url = `https://discoveryengine.googleapis.com/v1alpha/projects/${projectId}/locations/${location}/collections/${collectionId}/engines/${engineId}/servingConfigs/${servingConfigId}:search`;

    // Construct the request payload based on the curl command.
    const payload = {
      query: query,
      pageSize: 5,
      queryExpansionSpec: {condition: 'AUTO'},
      spellCorrectionSpec: {mode: 'AUTO'},
      languageCode: 'pt-BR',
      contentSearchSpec: {
        extractiveContentSpec: {
          maxExtractiveAnswerCount: 1,
        },
      },
      // Create a new session for each query.
      session: `projects/${projectId}/locations/${location}/collections/${collectionId}/engines/${engineId}/sessions/-`,
    };

    // Authenticate using Application Default Credentials (ADC).
    // This will automatically use the credentials from `gcloud auth application-default login`
    // when running locally, or the attached service account when deployed.
    const auth = new GoogleAuth({
      scopes: 'https://www.googleapis.com/auth/cloud-platform',
    });

    try {
      const client = await auth.getClient();
      const response = await client.request({
        url,
        method: 'POST',
        data: payload,
      });

      // The actual data is in the `data` property of the response.
      const data = response.data as any;

      // Map the raw API response to our clean output schema.
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
      console.error("Error calling Discovery Engine API:", error.response?.data || error.message);
      // Provide a more helpful error message to the frontend.
      const detail = error.response?.data?.error?.message || error.message || 'Unknown error.';
      throw new Error(`A autenticação com a API do Google falhou. Verifique as permissões e a configuração. Detalhe: ${detail}`);
    }
  }
);
