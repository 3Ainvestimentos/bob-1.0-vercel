'use server';
/**
 * @fileOverview A RAG-enabled chatbot flow that answers questions based on a Vertex AI RAG corpus.
 * This implementation uses the @google-cloud/vertexai library directly.
 */
import { VertexAI, HarmCategory, HarmBlockThreshold } from "@google-cloud/vertexai";
import { z } from 'zod';

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

// Initialize the Vertex AI client.
// It will automatically use Application Default Credentials on Firebase/GCP.
const vertex_ai = new VertexAI({
    project: 'datavisor-44i5m',
    location: 'global'
});
const model = 'gemini-1.5-flash-latest';

const generativeModel = vertex_ai.getGenerativeModel({
    model: model,
    safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ],
    generationConfig: {
      temperature: 1,
      topP: 1,
      maxOutputTokens: 8192,
    },
});

/**
 * Executes a query against the Gemini model using the RAG tool.
 * This uses the @google-cloud/vertexai SDK directly.
 * @param input The user's prompt and the conversation history.
 * @returns The text response from the model.
 */
export async function askChatbot(input: ChatbotInput): Promise<string> {
  console.log('Querying RAG chatbot with prompt (using @google-cloud/vertexai):', input.prompt);

  try {
    // This is the native tool structure, mirroring the Python SDK.
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
    
    // The SDK expects a specific format for history
    const typedHistory = input.history.map(h => ({
        role: h.role,
        parts: h.parts.map(p => ({text: p.text}))
    }));

    const chat = generativeModel.startChat({
        history: typedHistory,
        tools: [ragTool]
    });

    const result = await chat.sendMessage(input.prompt);

    if (!result.response || !result.response.candidates || result.response.candidates.length === 0) {
        console.error("Invalid response structure from AI:", result);
        throw new Error("Received an invalid response structure from the AI model.");
    }

    const response = result.response;
    const text = response.text();

    console.log('RAG chatbot successful. Response received.');
    return text;

  } catch (error) {
    console.error("Error calling Google Vertex AI SDK:", error);
    throw new Error('Failed to get a response from the AI model.');
  }
}
