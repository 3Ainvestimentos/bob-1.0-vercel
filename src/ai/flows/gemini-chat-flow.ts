'use server';
/**
 * @fileOverview A chatbot flow that uses the Gemini model with a Vertex AI RAG corpus.
 *
 * - askGemini - A function that handles the chatbot interaction.
 * - GeminiChatInput - The input type for the askGemini function.
 * - GeminiChatOutput - The return type for the askGemini function.
 */

import { ai } from '@/ai/genkit';
import { vertexAIRAGRetriever } from '@genkit-ai/googleai';
import { z } from 'zod';

const GeminiChatInputSchema = z.object({
  prompt: z.string().describe('The user prompt for the chatbot.'),
});
type GeminiChatInput = z.infer<typeof GeminiChatInputSchema>;

const GeminiChatOutputSchema = z.object({
  response: z.string().describe('The chatbot response.'),
});
type GeminiChatOutput = z.infer<typeof GeminiChatOutputSchema>;


/**
 * The actual RAG Corpus ID from Vertex AI Studio.
 */
const RAG_CORPUS_ID = 'projects/datavisor-44i5m/locations/us-central1/ragCorpora/6917529027641081856';

// Define a prompt that is aware of the RAG retriever.
const ragPrompt = ai.definePrompt({
    name: 'ragPrompt',
    input: { schema: GeminiChatInputSchema },
    output: { schema: GeminiChatOutputSchema },
    
    // System instructions guide the model on how to behave.
    system: 'Você é um assistente prestativo. Responda à pergunta do usuário com base nas informações dos documentos fornecidos. Se a informação não estiver disponível, diga que não conseguiu encontrar a resposta nos documentos. Sempre responda em português.',

    // Provide the RAG retriever for the model to use for context.
    retrievers: [
        vertexAIRAGRetriever({
            ragCorpus: RAG_CORPUS_ID,
        }),
    ],

    // The prompt simply passes the user's input.
    prompt: '{{prompt}}',
});


export async function askGemini(input: GeminiChatInput): Promise<GeminiChatOutput> {
    if (!RAG_CORPUS_ID || RAG_CORPUS_ID.includes('YOUR_RAG_CORPUS_ID')) {
        return { 
            response: "ERRO DE CONFIGURAÇÃO: A ID do Corpus RAG não foi definida corretamente. Por favor, verifique o arquivo `src/ai/flows/gemini-chat-flow.ts`." 
        };
    }

    const result = await ragPrompt(input);
    const output = result.output;
    
    // The output from a structured prompt is an object. We extract the response text.
    if (output) {
      return { response: output.response };
    }

    // Fallback in case the model doesn't produce the expected output structure.
    return { response: "Desculpe, não consegui processar a resposta do modelo." };
}
