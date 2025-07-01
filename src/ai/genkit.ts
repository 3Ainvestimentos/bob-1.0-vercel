'use server';

import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

/**
 * @fileoverview This file initializes the Genkit AI instance with the Google AI plugin.
 * This centralized `ai` object is used by all flows to define prompts, models, and other Genkit functionalities.
 */
export const ai = genkit({
  plugins: [
    googleAI(),
  ],
  // Note: For debugging, you can set GENKIT_LOG_LEVEL="debug" in your .env file.
  // enableTracingAndMetrics: true, // Uncomment to enable Cloud Trace and Monitoring.
});
