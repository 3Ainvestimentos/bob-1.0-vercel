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
 * IMPORTANT: Please replace this placeholder with your actual RAG Corpus ID from Vertex AI Studio.
 * It should look like: projects/<your-project-id>/locations/<your-location>/ragCorpora/<corpus-id>
 */
const RAG_CORPUS_ID = 'YOUR_RAG_CORPUS_ID_HERE';

// Define a prompt that is aware of the RAG tool.
const ragPrompt = ai.definePrompt({
    name: 'ragPrompt',
    input: { schema: GeminiChatInputSchema },
    output: { schema: GeminiChatOutputSchema },
    
    // System instructions guide the model on how to behave and use the tools.
    system: 'Você é um assistente prestativo. Responda à pergunta do usuário com base nas informações encontradas pela ferramenta de busca de documentos. Se a ferramenta não fornecer uma resposta relevante, diga que não conseguiu encontrar a informação nos documentos. Sempre responda em português.',

    // Provide the RAG retriever as a tool for the model to use.
    tools: [
        vertexAIRAGRetriever({
            ragCorpus: RAG_CORPUS_ID,
        }),
    ],

    // The prompt simply passes the user's input.
    prompt: '{{prompt}}',
});


export async function askGemini(input: GeminiChatInput): Promise<GeminiChatOutput> {
    if (!RAG_CORPUS_ID || RAG_CORPUS_ID === 'YOUR_RAG_CORPUS_ID_HERE') {
        return { 
            response: "ERRO DE CONFIGURAÇÃO: A ID do Corpus RAG não foi definida. Por favor, edite o arquivo `src/ai/flows/gemini-chat-flow.ts` e substitua o placeholder `YOUR_RAG_CORPUS_ID_HERE` pela sua ID real do Vertex AI." 
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
