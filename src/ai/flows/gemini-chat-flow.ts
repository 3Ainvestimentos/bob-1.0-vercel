'use server';
/**
 * @fileOverview A standard chatbot flow that uses the Gemini model.
 *
 * - askGemini - A function that handles the chatbot interaction.
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
    const response = await ai.generate({
        prompt: input.prompt,
    });
    return { response: response.text };
}
