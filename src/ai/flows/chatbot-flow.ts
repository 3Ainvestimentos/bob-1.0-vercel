'use server';
/**
 * @fileOverview A RAG-enabled chatbot flow that answers questions based on a Vertex AI RAG corpus.
 */
import { ai } from '@/ai/genkit';
import { z } from 'zod';

// This is the critical part: defining the RAG tool as a plain JavaScript object,
// using snake_case to match the underlying Google API.
const ragTool = {
  retrieval: {
    vertex_rag_store: {
      rag_resources: [
        {
          rag_corpus: "projects/datavisor-44i5m/locations/us-central1/ragCorpora/6917529027641081856"
        }
      ],
    }
  }
};

const ChatbotInputSchema = z.object({
  history: z.array(z.object({
    role: z.enum(['user', 'model']),
    parts: z.array(z.object({
      text: z.string()
    }))
  })),
  prompt: z.string(),
});
export type ChatbotInput = z.infer<typeof ChatbotInputSchema>;


/**
 * Executes a query against the Gemini model using the RAG tool.
 * @param input The user's prompt and the conversation history.
 * @returns The text response from the model.
 */
export async function askChatbot(input: ChatbotInput): Promise<string> {
  console.log('Querying RAG chatbot with prompt:', input.prompt);
  
  const result = await ai.generate({
    model: 'googleai/gemini-1.5-flash-latest',
    history: input.history,
    prompt: input.prompt,
    tools: [ragTool as any], // Using 'as any' to bypass Genkit's strict tool type checking.
    config: {
      temperature: 0.1, // Low temperature for more deterministic, fact-based answers
    },
  });

  console.log('RAG chatbot successful. Response received.');
  return result.text;
}
