
'use server';
/**
 * @fileOverview A flow for indexing file or text content.
 *
 * - indexFile - A function that takes file URL or raw text, chunks it, generates embeddings, and stores them.
 * - IndexFileInput - The input type for the indexFile function.
 * - IndexFileOutput - The return type for the indexFile function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const IndexFileInputSchema = z.object({
  fileName: z.string().describe('The identifier for the content being indexed (e.g., file name or "Manual Text").'),
  fileUrl: z.string().url().optional().describe('The public download URL of the file.'),
  textContent: z.string().optional().describe('The raw text content to index directly.'),
});
export type IndexFileInput = z.infer<typeof IndexFileInputSchema>;

const IndexFileOutputSchema = z.object({
  success: z.boolean().describe('Whether the indexing was successful.'),
  message: z.string().describe('A message indicating the result.'),
});
export type IndexFileOutput = z.infer<typeof IndexFileOutputSchema>;

export async function indexFile(
  input: IndexFileInput
): Promise<IndexFileOutput> {
  return indexFileFlow(input);
}

// Simple text chunker
function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  if (text.length <= chunkSize) {
    return [text];
  }
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(i + chunkSize, text.length);
    chunks.push(text.substring(i, end));
    i += chunkSize - overlap;
    if (i >= text.length) break;
  }
  return chunks;
}


const indexFileFlow = ai.defineFlow(
  {
    name: 'indexFileFlow',
    inputSchema: IndexFileInputSchema,
    outputSchema: IndexFileOutputSchema,
  },
  async (input) => {
    const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '[SEU-ID-DE-PROJETO]';
    const serviceAccount = `firebase-adminsdk-fbsvc@${projectId}.iam.gserviceaccount.com`;
    let adminDb;
    let chunksProcessed = 0;

    // Step 1: Initialize Firebase Admin
    try {
      const admin = await import('firebase-admin');
      if (admin.apps.length === 0) {
        admin.initializeApp();
        console.log('Firebase Admin SDK initialized.');
      }
      adminDb = admin.firestore();
    } catch (e: any) {
      console.error('CRITICAL: Failed to initialize Firebase Admin SDK.', e);
      const isAuthError = e.message?.includes('Could not find Application Default Credentials') || e.code?.includes('auth');
      const errorMessage = isAuthError
        ? `Falha na autenticação do servidor ao inicializar o Admin SDK. Verifique as permissões da conta de serviço '${serviceAccount}'.`
        : `Falha ao inicializar o Firebase Admin. Detalhes: ${e.message}`;
      return { success: false, message: errorMessage };
    }

    if (!adminDb) {
      return { success: false, message: 'Erro de servidor: O objeto do banco de dados Firestore não está disponível após a inicialização.' };
    }
    
    // Step 2: Get content to index (from URL or direct text)
    let contentToIndex;
    try {
      if (input.textContent) {
          contentToIndex = input.textContent;
      } else if (input.fileUrl) {
          const response = await fetch(input.fileUrl);
          if (!response.ok) {
              throw new Error(`Download do arquivo falhou com o status: ${response.status} ${response.statusText}`);
          }
          contentToIndex = await response.text();
      } else {
          return { success: false, message: 'Nenhuma URL de arquivo ou conteúdo de texto foi fornecido para indexar.' };
      }
    } catch (e: any) {
        return { success: false, message: `Erro ao obter conteúdo para "${input.fileName}". Detalhes: ${e.message}`};
    }


    if (!contentToIndex) {
        return { success: true, message: `O conteúdo de "${input.fileName}" está vazio. Nada a indexar.` };
    }

    // Step 3: Chunk the text
    const chunks = chunkText(contentToIndex, 1500, 150);

    // Step 4: Generate embeddings and save to Firestore for each chunk
    for (const chunk of chunks) {
      let embedding;
      try {
        const embedResponse = await ai.embed({
          content: chunk,
        });
        if (!embedResponse?.[0]?.embedding) {
          throw new Error('A resposta da API de embedding não continha um vetor de embedding.');
        }
        embedding = embedResponse[0].embedding;
      } catch (e: any) {
        console.error('CRITICAL: Failed to generate embedding for a chunk.', e);
        const message = `Falha ao gerar embedding para um pedaço do texto com a Vertex AI API. Verifique as permissões de "Vertex AI User" para a conta '${serviceAccount}'. Detalhes: ${e.message}`;
        return { success: false, message: message };
      }
      
      try {
        await adminDb.collection('file_chunks').add({
          fileName: input.fileName,
          text: chunk,
          embedding: embedding,
        });
        chunksProcessed++;
      } catch (e: any) {
          console.error('CRITICAL: Failed to save chunk to Firestore.', e);
          const message = `Falha ao salvar um pedaço do texto no Firestore. Verifique as permissões de "Cloud Datastore User" para a conta '${serviceAccount}'. Detalhes: ${e.message}`;
          return { success: false, message: message };
      }
    }

    return {
      success: true,
      message: `Indexado com sucesso ${chunks.length} pedaços para ${input.fileName}`,
    };
  }
);
