
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
        const isAuthError = e.message?.includes('Could not find Application Default Credentials') || e.code?.includes('auth');
        const errorMessage = isAuthError
            ? 'Falha na autenticação do servidor. Por favor, execute "gcloud auth application-default login" em seu terminal e reinicie o servidor.'
            : `Não foi possível inicializar o Admin SDK. Detalhes: ${e.message}`;
        return { response: `Erro de configuração do servidor: ${errorMessage}` };
    }

    if (!adminDb) {
        return { response: 'Erro no servidor: O objeto do banco de dados Firestore não está disponível após a inicialização.' };
    }
    
    // Step 2. Generate embedding for the user's prompt
    let promptEmbedding;
    try {
        const embedResponse = await ai.embed({
          content: input.prompt,
        });

        if (!embedResponse?.[0]?.embedding) {
            throw new Error('A resposta da API de embedding não continha um vetor.');
        }
        promptEmbedding = embedResponse[0].embedding;
    } catch (e: any) {
        console.error('CRITICAL: Failed to generate prompt embedding.', e);
        return { response: `Desculpe, não consegui processar sua pergunta para buscar no contexto. Detalhes: ${e.message}` };
    }

    // Step 3. Fetch all chunks for the specified file from Firestore
    let allChunks;
    try {
        const chunksSnapshot = await adminDb
            .collection('file_chunks')
            .where('fileName', '==', input.fileName)
            .get();

        if (chunksSnapshot.empty) {
            return { response: `Desculpe, não encontrei nenhum conteúdo indexado para o arquivo "${input.fileName}". Por favor, indexe o arquivo primeiro.` };
        }
        allChunks = chunksSnapshot.docs.map(doc => doc.data() as { text: string; embedding: number[] });
    } catch(e: any) {
        console.error('CRITICAL: Failed to fetch chunks from Firestore.', e);
        if (e.code === 'permission-denied' || e.code === 7) {
             return { response: `Falha ao ler do Firestore: Permissão negada. Verifique as permissões da sua conta de serviço.` };
        }
        return { response: `Erro ao buscar dados do arquivo no banco. Detalhes: ${e.message}`};
    }


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
    try {
        const llmResponse = await ai.generate({ prompt: finalPrompt });
        return { response: llmResponse.text };
    } catch(e: any) {
        console.error('CRITICAL: Failed to generate final response from LLM.', e);
        return { response: `Ocorreu um erro ao gerar a resposta final. Detalhes: ${e.message}` };
    }
  }
);
