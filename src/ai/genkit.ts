import {genkit} from 'genkit';
import * as googleAI from '@genkit-ai/googleai';

export const ai = genkit({
  plugins: [googleAI.default()],
  model: 'googleai/gemini-1.5-flash-latest',
  embedder: 'googleai/text-multilingual-embedding-002',
});
