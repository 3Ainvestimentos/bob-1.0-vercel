'use server';
/**
 * @fileOverview A flow that acts as a proxy to the main RAG-enabled Gradio chatbot.
 * This avoids duplicating RAG logic and resolves Genkit import issues by leveraging
 * the existing functional Gradio connection.
 *
 * - askGemini - A function that proxies the chatbot interaction to the Gradio flow.
 * - GeminiChatInput - The input type for the askGemini function.
 * - GeminiChatOutput - The return type for the askGemini function.
 */

import { z } from 'zod';
import { askChatbot, type ChatbotInput, type ChatbotOutput } from './chatbot-flow';

const GeminiChatInputSchema = z.object({
  prompt: z.string().describe('The user prompt for the chatbot.'),
});
export type GeminiChatInput = z.infer<typeof GeminiChatInputSchema>;

// The output schema remains the same.
const GeminiChatOutputSchema = z.object({
  response: z.string().describe('The chatbot response.'),
});
export type GeminiChatOutput = z.infer<typeof GeminiChatOutputSchema>;


/**
 * Asks the RAG-enabled chatbot by proxying the request to the `askChatbot` flow,
 * which communicates with the Gradio backend.
 * @param input The user's prompt.
 * @returns The response from the Gradio chatbot.
 */
export async function askGemini(input: GeminiChatInput): Promise<GeminiChatOutput> {
  // We just need to satisfy the input/output types.
  // The core logic is now handled by the Gradio chatbot flow.
  const chatbotInput: ChatbotInput = { prompt: input.prompt };
  const chatbotOutput: ChatbotOutput = await askChatbot(chatbotInput);
  
  return { response: chatbotOutput.response };
}
