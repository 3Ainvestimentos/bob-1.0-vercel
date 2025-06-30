'use server';
/**
 * @fileOverview A Gemini chat flow that uses a Vertex AI RAG corpus.
 * This flow connects to a specified RAG corpus to answer user questions
 * based on provided documents.
 *
 * - askGemini - A function that handles the chat interaction with RAG.
 * - GeminiChatInput - The input type for the askGemini function.
 * - GeminiChatOutput - The return type for the askGemini function.
 */

import { ai, corpusRetriever } from '@/ai/genkit';
import { z } from 'zod';

const GeminiChatInputSchema = z.object({
  prompt: z.string().describe('The user prompt for the chatbot.'),
});
export type GeminiChatInput = z.infer<typeof GeminiChatInputSchema>;

const GeminiChatOutputSchema = z.object({
  response: z.string().describe('The chatbot response.'),
});
export type GeminiChatOutput = z.infer<typeof GeminiChatOutputSchema>;

export async function askGemini(input: GeminiChatInput): Promise<GeminiChatOutput> {
  const result = await ai.generate({
    prompt: input.prompt,
    system: 'Você é um assistente prestativo. Responda à pergunta do usuário com base nas informações encontradas nos documentos. Se os documentos não fornecerem uma resposta relevante, diga que não conseguiu encontrar a informação nos documentos fornecidos.',
    retrievers: [corpusRetriever],
  });
  
  return { response: result.text };
}
