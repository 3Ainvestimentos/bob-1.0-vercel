'use server';
/**
 * @fileOverview A flow for indexing file content.
 *
 * - indexFile - A function that takes a file URL, downloads it, generates embeddings, and stores them.
 * - IndexFileInput - The input type for the indexFile function.
 * - IndexFileOutput - The return type for the indexFile function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const IndexFileInputSchema = z.object({
  fileName: z.string().describe('The name of the file being indexed.'),
  fileUrl: z.string().url().describe('The public download URL of the file.'),
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

// For now, we treat the entire file content as a single "chunk".
// For larger files, this should be split into smaller, overlapping chunks.
const indexFileFlow = ai.defineFlow(
  {
    name: 'indexFileFlow',
    inputSchema: IndexFileInputSchema,
    outputSchema: IndexFileOutputSchema,
  },
  async (input) => {
    try {
      // Dynamically import the admin SDK only when the flow is running on the server.
      const { adminDb } = await import('@/lib/firebase-admin');
      
      // 1. Download the file content from the URL.
      const response = await fetch(input.fileUrl);
      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.statusText}`);
      }
      // This works for text-based files. For PDFs, DOCX, etc., a more complex parser would be needed.
      const fileContent = await response.text();

      // 2. Generate an embedding for the file content.
      const embedResponse = await ai.embed({
        model: 'googleai/text-embedding-004',
        content: fileContent,
      });

      if (!embedResponse?.embedding) {
        throw new Error('Failed to generate embedding. The embedding API returned an invalid response.');
      }
      const { embedding } = embedResponse;


      // 3. Save the content and its embedding to Firestore using the Admin SDK.
      const docRef = await adminDb.collection('file_chunks').add({
        fileName: input.fileName,
        text: fileContent,
        embedding: embedding,
      });

      console.log('Document written with ID: ', docRef.id);

      return {
        success: true,
        message: `Successfully indexed ${input.fileName}`,
      };
    } catch (e: any) {
      console.error('Error during indexing flow:', e);
      // Enhance error message to include Firebase error code if available for better diagnostics.
      const errorMessage = e.code ? `[Code: ${e.code}] ${e.message}` : e.message;
      return {
        success: false,
        message: `Failed to index: ${errorMessage}`,
      };
    }
  }
);
