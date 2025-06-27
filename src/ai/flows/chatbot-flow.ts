
'use server';
/**
 * @fileOverview A chatbot flow that can answer questions based on indexed files.
 *
 * - askChatbot - A function that handles the chatbot interaction, performing RAG if a file is provided.
 * - ChatbotInput - The input type for the askChatbot function.
 * - ChatbotOutput - The return type for the askChatbot function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';


const ChatbotInputSchema = z.object({
  prompt: z.string().describe('The user prompt for the chatbot.'),
  fileName: z.string().optional().describe('The name of the file to use as context.'),
});
export type ChatbotInput = z.infer<typeof ChatbotInputSchema>;

const ChatbotOutputSchema = z.object({
  response: z.string().describe('The chatbot response.'),
});
export type ChatbotOutput = z.infer<typeof ChatbotOutputSchema>;

export async function askChatbot(input: ChatbotInput): Promise<ChatbotOutput> {
  if (!input.fileName) {
    return genericChatFlow(input);
  }
  return ragChatFlow(input);
}

// --- Generic Flow (for when no file is selected) ---

const genericChatPrompt = ai.definePrompt({
  name: 'genericChatPrompt',
  input: { schema: z.object({ prompt: z.string() }) },
  output: { schema: ChatbotOutputSchema },
  prompt: `You are a helpful assistant. Respond to the following prompt in a concise and friendly manner.

Prompt: {{{prompt}}}`,
});

const genericChatFlow = ai.defineFlow(
  {
    name: 'genericChatFlow',
    inputSchema: z.object({ prompt: z.string() }),
    outputSchema: ChatbotOutputSchema,
  },
  async (input) => {
    const { output } = await genericChatPrompt(input);
    return output!;
  }
);


// --- RAG Flow (for answering based on a file) ---

function dotProduct(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      return 0; // Or handle error appropriately
    }
    let product = 0;
    for (let i = 0; i < vecA.length; i++) {
      product += vecA[i] * vecB[i];
    }
    return product;
}

const ragChatFlow = ai.defineFlow(
  {
    name: 'ragChatFlow',
    inputSchema: ChatbotInputSchema,
    outputSchema: ChatbotOutputSchema,
  },
  async (input) => {
    try {
        // Step 1: Initialize Firebase Admin
        const admin = await import('firebase-admin');
        if (admin.apps.length === 0) {
            admin.initializeApp();
        }
        const adminDb = admin.firestore();
        
        // Step 2. Generate embedding for the user's prompt
        const embedResponse = await ai.embed({ content: input.prompt });
        const promptEmbedding = embedResponse?.[0]?.embedding;
        if (!promptEmbedding) {
            throw new Error('Failed to generate embedding for the prompt.');
        }

        // Step 3. Fetch all chunks for the specified file from Firestore
        const chunksSnapshot = await adminDb
            .collection('file_chunks')
            .where('fileName', '==', input.fileName)
            .get();

        if (chunksSnapshot.empty) {
            return { response: `Sorry, I couldn't find any indexed content for "${input.fileName}". Please index the file first.` };
        }
        const allChunks = chunksSnapshot.docs.map(doc => doc.data() as { text: string; embedding: number[] });

        // Step 4. Calculate similarity and find the top N most relevant chunks
        const chunksWithSimilarity = allChunks.map(chunk => ({
            text: chunk.text,
            similarity: dotProduct(promptEmbedding, chunk.embedding),
        }));
        
        chunksWithSimilarity.sort((a, b) => b.similarity - a.similarity);

        const topN = 5;
        const relevantChunks = chunksWithSimilarity.slice(0, topN).map(chunk => chunk.text);
        const context = relevantChunks.join('\n---\n');

        // Step 5. Construct the final prompt for the LLM
        const finalPrompt = `You are an expert assistant. Your task is to answer the user's question using ONLY the information from the DOCUMENT CONTEXT below. Do not use any external knowledge. If the answer is not in the context, reply with exactly: "I could not find an answer to that question in the document."

DOCUMENT CONTEXT:
---
${context}
---

USER QUESTION: ${input.prompt}

ANSWER:`;

        // Step 6. Call the LLM with the context-rich prompt
        const llmResponse = await ai.generate({ prompt: finalPrompt });
        return { response: llmResponse.text };

    } catch (e: any) {
        console.error('CRITICAL: An unrecoverable error occurred in ragChatFlow.', e);
        
        // Provide a more direct error message to the client
        const message = e.message || 'An unknown server error occurred.';
        const finalMessage = `Error processing your request. Details: ${message}`;
        return { response: finalMessage };
    }
  }
);
