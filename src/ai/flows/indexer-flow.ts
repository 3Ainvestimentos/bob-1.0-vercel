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

const indexFileFlow = ai.defineFlow(
  {
    name: 'indexFileFlow',
    inputSchema: IndexFileInputSchema,
    outputSchema: IndexFileOutputSchema,
  },
  async (input) => {
    try {
      // Step 1: Initialize Firebase Admin SDK
      const admin = await import('firebase-admin');
      if (!admin) {
        throw new Error('Critical: Failed to import firebase-admin module.');
      }

      let adminDb;
      if (admin.apps.length === 0) {
        // This block runs only if the app is not already initialized.
        const credential = admin.credential.applicationDefault();
        if (!credential) {
          throw new Error('Critical: admin.credential.applicationDefault() returned null. Ensure server environment has credentials (run "gcloud auth application-default login").');
        }
        admin.initializeApp({ credential });
      }
      adminDb = admin.firestore();
      if (!adminDb) {
        throw new Error('Critical: admin.firestore() returned null or undefined.');
      }

      // Step 2: Download the file content from the URL.
      const response = await fetch(input.fileUrl);
      if (!response.ok) {
        throw new Error(`Failed to download file from URL. Status: ${response.statusText}`);
      }
      const fileContent = await response.text();

      // Step 3: Generate an embedding for the file content.
      const embedResponse = await ai.embed({
        model: 'googleai/text-embedding-004',
        content: fileContent,
      });

      if (!embedResponse?.embedding) {
        throw new Error('Failed to generate embedding. The embedding API returned an invalid or empty response.');
      }
      const { embedding } = embedResponse;

      // Step 4: Save the content and its embedding to Firestore.
      await adminDb.collection('file_chunks').add({
        fileName: input.fileName,
        text: fileContent,
        embedding: embedding,
      });

      return {
        success: true,
        message: `Successfully indexed ${input.fileName}`,
      };
    } catch (e: any) {
      console.error('CRITICAL ERROR in indexFileFlow:', e);
      // Return a clear error message to the client.
      return {
        success: false,
        message: `Failed to index: ${e.message}`,
      };
    }
  }
);
