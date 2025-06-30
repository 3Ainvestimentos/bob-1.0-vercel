'use server';
/**
 * @fileOverview A minimal flow to test the RAG connection to Vertex AI.
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod';

// This is the critical part: defining the RAG tool as a plain JavaScript object,
// mirroring the structure from the Python SDK. We are using snake_case to match
// the underlying Google API, as this seems to be a requirement.
const ragTool = {
  retrieval: {
    vertex_rag_store: {
      rag_resources: [
        {
          rag_corpus: "projects/datavisor-44i5m/locations/us-central1/ragCorpora/6917529027641081856"
        }
      ],
    }
  }
};

/**
 * Executes a single test call to the Gemini model with the RAG tool.
 * @returns The text response from the model if successful.
 * @throws An error if the API call fails.
 */
export async function testRagConnection(): Promise<string> {
  console.log('Iniciando teste de conexão RAG...');
  
  const result = await ai.generate({
    model: 'googleai/gemini-1.5-flash-latest',
    prompt: 'O que é DataVisor? Responda em uma frase com base no corpus.',
    tools: [ragTool as any], // Using 'as any' to bypass Genkit's strict tool type checking for this specific test case.
    config: {
      temperature: 0.1, // Low temperature for a more deterministic test response
    },
  });

  console.log('Teste de conexão RAG bem-sucedido. Resposta recebida.');
  return result.text;
}
