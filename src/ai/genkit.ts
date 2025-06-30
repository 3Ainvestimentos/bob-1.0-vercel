import {genkit} from 'genkit';
import {googleAI, vertexAIRAGRetriever} from '@genkit-ai/googleai';

export const ai = genkit({
  plugins: [googleAI()],
  model: 'googleai/gemini-1.5-flash-latest',
  embedder: 'googleai/text-multilingual-embedding-002',
});

// Define and export the RAG retriever for your specific corpus.
export const corpusRetriever = vertexAIRAGRetriever({
  corpus: 'projects/datavisor-44i5m/locations/us-central1/ragCorpora/6917529027641081856',
});
