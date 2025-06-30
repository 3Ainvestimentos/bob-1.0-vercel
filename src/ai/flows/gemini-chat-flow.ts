'use server';
/**
 * @fileOverview A standard Gemini chat flow.
 * This flow provides a direct, general-purpose chat with the Gemini model.
 * The RAG-enabled chat is available via the Gradio interface on the main page.
 *
 * - askGemini - A function that handles the chat interaction.
 * - GeminiChatInput - The input type for the askGemini function.
 * - GeminiChatOutput - The return type for the askGemini function.
 */

import { ai } from '@/ai/genkit';
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
    system: 'Você é um assistente prestativo. Responda diretamente à pergunta do usuário.',
  });
  
  return { response: result.text };
}
