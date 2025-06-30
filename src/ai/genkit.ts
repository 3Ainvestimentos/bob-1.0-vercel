import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

export const ai = genkit({
  plugins: [googleAI()],
  model: 'googleai/gemini-1.5-flash-latest',
  embedder: 'googleai/text-multilingual-embedding-002',
});

// The RAG retriever is now handled by the Gradio application's backend.
// This file is kept clean to avoid package import issues.
export const corpusRetriever = null;
