/**
 * @fileoverview Firebase Admin SDK Initialization.
 * This file initializes the Firebase Admin SDK for use in server-side environments (like Genkit flows).
 * It uses Application Default Credentials, which work automatically in Google Cloud environments
 * and can be configured for local development.
 */
import * as admin from 'firebase-admin';

// Ensure the app is only initialized once
if (!admin.apps.length) {
  try {
    // Using applicationDefault() is the standard way for server-side code.
    // It automatically finds credentials in a GCloud environment.
    // For local dev, you must be authenticated via `gcloud auth application-default login`.
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
    console.log('Firebase Admin SDK initialized.');
  } catch (e) {
    console.error('Firebase Admin SDK initialization error. ' +
      'Make sure you are in a Google Cloud environment or have authenticated ' +
      'with `gcloud auth application-default login`', e);
  }
}

// Export the initialized services
export const adminDb = admin.firestore();
