'use server';
/**
 * @fileOverview A RAG-enabled Gemini chat flow.
 * This flow connects to a Vertex AI RAG corpus to answer questions based on provided documents.
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
  // This tool structure is derived from the Python SDK's `types.Tool` definition
  // and enables Vertex AI RAG retrieval.
  const ragTool = {
    retrieval: {
      vertexRagStore: {
        ragResources: [
          {
            ragCorpus: "projects/datavisor-44i5m/locations/us-central1/ragCorpora/6917529027641081856"
          }
        ],
      }
    }
  };

  const result = await ai.generate({
    model: 'googleai/gemini-1.5-flash-latest',
    prompt: input.prompt,
    config: {
      temperature: 0.5,
      maxOutputTokens: 8192,
      safetySettings: [
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      ],
    },
    tools: [ragTool as any], // Cast as 'any' to match the expected Tool type
  });
  
  return { response: result.text };
}
