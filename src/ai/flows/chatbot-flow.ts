
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
      console.error("Vectors have different lengths, cannot compute dot product.");
      return 0;
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
    // Step 1: Dynamic import and initialization of Firebase Admin
    let adminDb;
    try {
      const admin = await import('firebase-admin');
      if (admin.apps.length === 0) {
        admin.initializeApp({ credential: admin.credential.applicationDefault() });
      }
      adminDb = admin.firestore();
    } catch (e: any) {
        console.error('CRITICAL: Failed to initialize Firebase Admin SDK for RAG.', e);
        return { response: "Desculpe, não consegui me conectar ao banco de dados para buscar o contexto. Verifique a configuração do servidor." };
    }

    if (!adminDb) {
        return { response: 'Server-side error: Firestore database object is not available after initialization.' };
    }
    
    // Step 2. Generate embedding for the user's prompt
    const embedResponse = await ai.embed({
      model: 'googleai/embedding-001',
      content: input.prompt,
    });
    const promptEmbedding = embedResponse?.embedding;
    if (!promptEmbedding) {
        return { response: "Desculpe, não consegui processar sua pergunta para buscar o contexto." };
    }

    // Step 3. Fetch all chunks for the specified file from Firestore
    const chunksSnapshot = await adminDb
        .collection('file_chunks')
        .where('fileName', '==', input.fileName)
        .get();

    if (chunksSnapshot.empty) {
        return { response: `Desculpe, não encontrei nenhum conteúdo indexado para o arquivo "${input.fileName}". Por favor, indexe o arquivo primeiro.` };
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
    const finalPrompt = `Você é um assistente especialista no documento fornecido. Sua tarefa é responder à pergunta do usuário estritamente com base no contexto abaixo. Seja conciso e direto. Se a resposta não estiver no contexto, diga "Com base no documento fornecido, não encontrei a resposta para esta pergunta.". Não use nenhum conhecimento prévio.

Contexto do documento:
---
${context}
---

Pergunta do usuário: ${input.prompt}

Resposta:`;

    // Step 6. Call the LLM with the context-rich prompt
    const llmResponse = await ai.generate({ prompt: finalPrompt });
    return { response: llmResponse.text };
  }
);
