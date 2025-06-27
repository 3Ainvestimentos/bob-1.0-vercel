
'use server';
/**
 * @fileOverview A chatbot flow that answers questions based on a Vertex AI RAG Corpus.
 *
 * - askChatbot - A function that handles the chatbot interaction.
 * - ChatbotInput - The input type for the askChatbot function.
 * - ChatbotOutput - The return type for the askChatbot function.
 */

import { ai } from '@/ai/genkit';
import * as googleAI from '@genkit-ai/googleai';
import { z } from 'genkit';

// Define the retriever tool that connects to your specific RAG Corpus
const corpusRetrieverTool = googleAI.retriever({
  name: 'corpusRetriever',
  type: 'googleAI/ragCorpus',
  corpus: 'projects/datavisor-44i5m/locations/us-central1/ragCorpora/6917529027641081856',
});

const ChatbotInputSchema = z.object({
  prompt: z.string().describe('The user prompt for the chatbot.'),
});
export type ChatbotInput = z.infer<typeof ChatbotInputSchema>;

const ChatbotOutputSchema = z.object({
  response: z.string().describe('The chatbot response.'),
});
export type ChatbotOutput = z.infer<typeof ChatbotOutputSchema>;

export async function askChatbot(input: ChatbotInput): Promise<ChatbotOutput> {
  return ragChatFlow(input);
}

const ragChatFlow = ai.defineFlow(
  {
    name: 'ragChatFlow',
    inputSchema: ChatbotInputSchema,
    outputSchema: ChatbotOutputSchema,
  },
  async (input) => {
    try {
        const llmResponse = await ai.generate({
          prompt: input.prompt,
          tools: [corpusRetrieverTool],
          system: `Você é um assistente especialista. Sua tarefa é responder perguntas usando APENAS as informações encontradas nos documentos fornecidos pela ferramenta de busca.
Se a resposta estiver nos documentos, forneça-a de forma clara e concisa.
Se a resposta não estiver nos documentos, responda EXATAMENTE com a frase: "Não encontrei uma resposta para essa pergunta nos documentos."
Não use nenhum conhecimento externo.`
        });

        return { response: llmResponse.text };
    } catch (e: any) {
        console.error('CRITICAL: An unrecoverable error occurred in ragChatFlow.', e);
        const message = e.message || 'An unknown server error occurred.';
        const finalMessage = `Error processing your request. Details: ${message}`;
        return { response: finalMessage };
    }
  }
);
