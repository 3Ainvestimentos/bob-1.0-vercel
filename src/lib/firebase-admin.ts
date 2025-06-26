/**
 * @fileoverview Firebase Admin SDK Initialization.
 * This file initializes the Firebase Admin SDK for use in server-side environments (like Genkit flows).
 * It uses Application Default Credentials, which work automatically in Google Cloud environments
 * and can be configured for local development.
 */
import * as admin from 'firebase-admin';

// Ensure the app is only initialized once.
// The `try...catch` block which previously suppressed errors has been removed.
// If this initialization fails, it's critical that the error is not suppressed.
//
// The most common cause of failure is missing Application Default Credentials.
// For local development, you MUST authenticate by running the following command in your terminal:
//
// gcloud auth application-default login
//
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
  console.log('Firebase Admin SDK initialized.');
}

// Export the initialized services
export const adminDb = admin.firestore();
