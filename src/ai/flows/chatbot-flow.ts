'use server';
/**
 * @fileOverview A chatbot flow that answers questions by connecting to a Gradio API.
 *
 * - askChatbot - A function that handles the chatbot interaction.
 * - ChatbotInput - The input type for the askChatbot function.
 * - ChatbotOutput - The return type for the askChatbot function.
 */

import { Client } from "@gradio/client";
import { z } from 'zod';

const ChatbotInputSchema = z.object({
  prompt: z.string().describe('The user prompt for the chatbot.'),
});
export type ChatbotInput = z.infer<typeof ChatbotInputSchema>;

const ChatbotOutputSchema = z.object({
  response: z.string().describe('The chatbot response.'),
});
export type ChatbotOutput = z.infer<typeof ChatbotOutputSchema>;

// The base URL for your Gradio application deployed on Cloud Run
const GRADIO_API_URL = "https://genai-app-locatingandassessingola-1-1751046095728-629342546806.us-central1.run.app";
const GRADIO_API_KEY = process.env.GRADIO_API_KEY;

export async function askChatbot(input: ChatbotInput): Promise<ChatbotOutput> {
  if (!GRADIO_API_KEY || GRADIO_API_KEY.includes('YOUR_SECRET_KEY')) {
    const errorMessage = 'ERRO DE CONFIGURAÇÃO: A chave da API do Gradio (GRADIO_API_KEY) não foi encontrada no arquivo .env. Por favor, obtenha a chave no Vertex AI Studio e adicione-a ao seu arquivo .env.';
    console.error(errorMessage);
    return { response: errorMessage };
  }

  const fullApiUrl = `${GRADIO_API_URL}?key=${GRADIO_API_KEY}`;

  try {
    // Connect to the Gradio API client
    const client = await Client.connect(fullApiUrl);
    
    // Send the prompt to the /chat endpoint
    // We send an empty array for `files` as the current UI only supports text.
    const result = await client.predict("/chat", {
      message: { text: input.prompt, files: [] }, 
    });

    // Gradio client typically returns results in `result.data`. For many chatbots, 
    // this is an array where the first element is the text response.
    if (result && Array.isArray(result.data) && typeof result.data[0] === 'string') {
      return { response: result.data[0] };
    } 
    
    // Handle cases where the prediction might return an unexpected data structure
    console.warn("Received an unexpected data structure from Gradio. Full result:", result);
    const responseText = result?.data ? JSON.stringify(result.data) : "No data received.";
    return { response: `A resposta do assistente não estava no formato esperado. Dados recebidos: ${responseText}` };

  } catch (error) {
    console.error('--- ERROR CONNECTING TO GRADIO API ---');
    console.error('Timestamp:', new Date().toISOString());
    console.error('Raw error object for debugging:', error); // Log the raw object for server-side debugging

    const baseMessage = 'Ocorreu um erro ao se conectar com o serviço de chatbot.';
    let technicalDetails = 'Não foi possível determinar a causa específica.';

    if (error instanceof Error) {
      // Standard Error object
      technicalDetails = error.message;
      console.error('Error Name:', error.name);
      console.error('Error Message:', technicalDetails);
      console.error('Stack Trace:', error.stack);
    } else if (error && typeof error === 'object') {
      // Non-standard error object, try to stringify it
      try {
        technicalDetails = JSON.stringify(error, null, 2); // Pretty print for readability
      } catch (stringifyError) {
        // Fallback if stringify fails (e.g., circular structure)
        technicalDetails = 'Não foi possível serializar o objeto de erro. Verifique os logs do servidor.';
      }
      console.error('Caught a non-standard error object:', error);
    } else {
      // Primitives like strings or numbers
      technicalDetails = String(error);
      console.error('Caught a primitive error value:', error);
    }

    const fullErrorMessage = `${baseMessage}\n\nDetalhes Técnicos: ${technicalDetails}`;
    
    console.error('--- GRADIO ERROR END ---');
    return { response: fullErrorMessage };
  }
}
