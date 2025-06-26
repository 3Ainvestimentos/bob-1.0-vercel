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
    // Step 1: Dynamic import of firebase-admin
    let admin;
    try {
      admin = await import('firebase-admin');
    } catch (e: any) {
      console.error('CRITICAL: Failed to import firebase-admin module.', e);
      return { success: false, message: `Server-side error: Failed to load Firebase Admin module. Details: ${e.message}` };
    }

    // Step 2: Initialize Firebase Admin SDK
    let adminDb;
    try {
      if (admin.apps.length === 0) {
        const credential = admin.credential.applicationDefault();
        admin.initializeApp({ credential });
        console.log('Firebase Admin SDK initialized.');
      }
      adminDb = admin.firestore();
    } catch (e: any) {
      console.error('CRITICAL: Failed to initialize Firebase Admin SDK.', e);
      const isAuthError = e.message?.includes('Could not find Application Default Credentials') || e.code?.includes('auth');
      const errorMessage = isAuthError
        ? 'Firebase Admin credentials not found. Please run "gcloud auth application-default login" in your terminal and restart the server.'
        : `Failed to initialize Firebase Admin. Details: ${e.message}`;
      return { success: false, message: errorMessage };
    }

    if (!adminDb) {
      return { success: false, message: 'Server-side error: Firestore database object is not available after initialization.' };
    }

    // Step 3: Download file
    let fileContent;
    try {
      const response = await fetch(input.fileUrl);
      if (!response.ok) {
        throw new Error(`Download failed with status: ${response.status} ${response.statusText}`);
      }
      fileContent = await response.text();
    } catch (e: any) {
       console.error('CRITICAL: Failed to download file.', e);
       return { success: false, message: `Failed to download file from URL. Details: ${e.message}` };
    }

    // Step 4: Generate embedding
    let embedding;
    try {
      const embedResponse = await ai.embed({
        model: 'googleai/text-embedding-004',
        content: fileContent,
      });

      if (!embedResponse?.embedding) {
        throw new Error('Embedding API returned an invalid or empty response.');
      }
      embedding = embedResponse.embedding;
    } catch (e: any) {
      console.error('CRITICAL: Failed to generate embedding.', e);
      return { success: false, message: `Failed to generate embedding. Details: ${e.message}` };
    }

    // Step 5: Save to Firestore
    try {
      await adminDb.collection('file_chunks').add({
        fileName: input.fileName,
        text: fileContent,
        embedding: embedding,
      });
    } catch (e: any) {
      console.error('CRITICAL: Failed to save to Firestore.', e);
      // Check for permission errors specifically
      if (e.code === 'permission-denied' || e.code === 7) {
         return { success: false, message: `Failed to write to Firestore: Permission Denied. Please check your service account permissions.` };
      }
      return { success: false, message: `Failed to write to Firestore. Details: ${e.message}` };
    }

    return {
      success: true,
      message: `Successfully indexed ${input.fileName}`,
    };
  }
);
