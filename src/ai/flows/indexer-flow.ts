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
      // Step 1: Initialize Firebase Admin SDK. This is in its own try/catch
      // to isolate initialization errors, which have been the source of issues.
      let adminDb;
      try {
        const admin = await import('firebase-admin');
        if (admin.apps.length === 0) {
          admin.initializeApp({
            credential: admin.credential.applicationDefault(),
          });
          console.log('Firebase Admin SDK initialized inside flow.');
        }
        adminDb = admin.firestore();
      } catch (e: any) {
        console.error('CRITICAL: Firebase Admin SDK initialization failed.', e);
        // This is a critical failure. We provide a more specific error message.
        throw new Error(`Firebase Admin init failed: ${e.message}. Ensure your server environment has credentials.`);
      }

      // Step 2: Download the file content from the URL.
      const response = await fetch(input.fileUrl);
      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.statusText}`);
      }
      const fileContent = await response.text();

      // Step 3: Generate an embedding for the file content.
      const embedResponse = await ai.embed({
        model: 'googleai/text-embedding-004',
        content: fileContent,
      });

      if (!embedResponse?.embedding) {
        throw new Error('Failed to generate embedding. The embedding API returned an invalid response.');
      }
      const { embedding } = embedResponse;


      // Step 4: Save the content and its embedding to Firestore using the Admin SDK.
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
      const errorMessage = e.code ? `[Code: ${e.code}] ${e.message}` : e.message;
      return {
        success: false,
        message: `Failed to index: ${errorMessage}`,
      };
    }
  }
);
