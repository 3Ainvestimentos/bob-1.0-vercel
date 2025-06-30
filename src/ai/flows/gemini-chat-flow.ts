'use server';
/**
 * @fileOverview A simple flow for a direct conversation with the Gemini model.
 *
 * - askGemini - A function that handles a standard chatbot interaction.
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


/**
 * Asks the Gemini model a question.
 * @param input The user's prompt.
 * @returns The response from the model.
 */
export async function askGemini(input: GeminiChatInput): Promise<GeminiChatOutput> {
  const result = await ai.generate({
    prompt: input.prompt,
  });

  return { response: result.text };
}
