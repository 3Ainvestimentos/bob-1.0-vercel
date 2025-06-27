
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
    // Step 1: Dynamic import of firebase-admin
    let admin;
    try {
      admin = await import('firebase-admin');
    } catch (e: any) {
      console.error('CRITICAL: Failed to import firebase-admin module.', e);
      return { success: false, message: `Erro de servidor: Falha ao carregar o módulo Firebase Admin. Detalhes: ${e.message}` };
    }

    // Step 2: Initialize Firebase Admin SDK
    let adminDb;
    try {
      if (admin.apps.length === 0) {
        // In a managed environment (like App Hosting), application default credentials should be available.
        admin.initializeApp();
        console.log('Firebase Admin SDK initialized.');
      }
      adminDb = admin.firestore();
    } catch (e: any) {
      console.error('CRITICAL: Failed to initialize Firebase Admin SDK.', e);
      const isAuthError = e.message?.includes('Could not find Application Default Credentials') || e.code?.includes('auth');
      const errorMessage = isAuthError
        ? 'Credenciais do Firebase Admin não encontradas no servidor. Verifique se a conta de serviço do ambiente de hospedagem tem as permissões corretas.'
        : `Falha ao inicializar o Firebase Admin. Detalhes: ${e.message}`;
      return { success: false, message: errorMessage };
    }

    if (!adminDb) {
      return { success: false, message: 'Erro de servidor: O objeto do banco de dados Firestore não está disponível após a inicialização.' };
    }
    
    // Step 3: Get content to index (from URL or direct text)
    let contentToIndex;
    if (input.textContent) {
        contentToIndex = input.textContent;
    } else if (input.fileUrl) {
        try {
            const response = await fetch(input.fileUrl);
            if (!response.ok) {
                throw new Error(`Download falhou com o status: ${response.status} ${response.statusText}`);
            }
            contentToIndex = await response.text();
        } catch (e: any) {
           console.error('CRITICAL: Failed to download file.', e);
           return { success: false, message: `Falha ao baixar arquivo da URL. Detalhes: ${e.message}` };
        }
    } else {
        return { success: false, message: 'Nenhuma URL de arquivo ou conteúdo de texto foi fornecido para indexar.' };
    }

    if (!contentToIndex) {
        return { success: true, message: `O conteúdo de "${input.fileName}" está vazio. Nada a indexar.` };
    }


    // Step 4: Chunk the text
    const chunks = chunkText(contentToIndex, 1500, 150);
    let chunksProcessed = 0;

    // Step 5: Generate embeddings and save to Firestore for each chunk
    try {
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
        } catch(e: any) {
            console.error('CRITICAL: Failed to generate embedding vector.', e);
            if (e instanceof TypeError && e.message.includes('Cannot convert undefined or null to object')) {
                return { success: false, message: 'Falha na autenticação do servidor ao contatar a API de IA. Verifique se a "Vertex AI API" está ativada no seu projeto Google Cloud e se a conta de serviço possui as permissões necessárias (ex: "Vertex AI User").' };
            }
            throw e; // Re-throw other errors to be caught by the outer block
        }
        
        await adminDb.collection('file_chunks').add({
          fileName: input.fileName,
          text: chunk,
          embedding: embedding,
        });
        chunksProcessed++;
      }
    } catch (e: any) {
      console.error('CRITICAL: Failed during chunk processing (embedding or Firestore write).', e);
      
      // Check for Firestore permission errors specifically
      if (e.code === 'permission-denied' || e.code === 7) {
         return { success: false, message: `Falha ao escrever no Firestore: Permissão negada. Verifique se a conta de serviço do ambiente de hospedagem possui a permissão "Cloud Datastore User".` };
      }
      
      // Fallback for other errors
      const errorMessage = e.message || 'Ocorreu um erro desconhecido';
      return { success: false, message: `Falha ao processar os pedaços para "${input.fileName}" após ${chunksProcessed} pedaços. Detalhes: ${errorMessage}` };
    }

    return {
      success: true,
      message: `Indexado com sucesso ${chunks.length} pedaços para ${input.fileName}`,
    };
  }
);
