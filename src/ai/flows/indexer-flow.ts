
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
    try {
        // Step 1: Initialize Firebase Admin
        const admin = await import('firebase-admin');
        if (admin.apps.length === 0) {
            admin.initializeApp();
        }
        const adminDb = admin.firestore();

        // Step 2: Get content
        let contentToIndex;
        if (input.textContent) {
            contentToIndex = input.textContent;
        } else if (input.fileUrl) {
            const response = await fetch(input.fileUrl);
            if (!response.ok) {
                throw new Error(`Failed to download file: ${response.statusText}`);
            }
            contentToIndex = await response.text();
        } else {
            return { success: false, message: 'No file URL or text content was provided.' };
        }

        if (!contentToIndex) {
            return { success: true, message: `Content for "${input.fileName}" is empty. Nothing to index.` };
        }
        
        // Step 3: Chunk the text
        const chunks = chunkText(contentToIndex, 1500, 150);

        // Step 4: Generate embeddings and save in a batch
        const batch = adminDb.batch();
        for (const chunk of chunks) {
            const embedResponse = await ai.embed({ content: chunk });
            const embedding = embedResponse?.[0]?.embedding;
            
            if (!embedding) {
                throw new Error('Failed to generate embedding for a chunk. The API returned no embedding vector.');
            }
            
            const docRef = adminDb.collection('file_chunks').doc();
            batch.set(docRef, {
                fileName: input.fileName,
                text: chunk,
                embedding: embedding,
            });
        }
        
        await batch.commit();

        return {
            success: true,
            message: `Successfully indexed ${chunks.length} chunks for ${input.fileName}`,
        };
    } catch (e: any) {
        console.error('CRITICAL: An unrecoverable error occurred in indexFileFlow.', e);
        
        // Provide a more direct error message to the client
        const message = e.message || 'An unknown server error occurred.';
        const finalMessage = `Indexing failed. Details: ${message}`;
        
        return { success: false, message: finalMessage };
    }
  }
);
