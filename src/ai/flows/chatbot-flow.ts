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

// The URL for your Gradio application deployed on Cloud Run
const GRADIO_API_URL = "https://genai-app-locatingandassessingola-1-1751046095728-629342546806.us-central1.run.app/";

export async function askChatbot(input: ChatbotInput): Promise<ChatbotOutput> {
  try {
    // Connect to the Gradio API client
    const client = await Client.connect(GRADIO_API_URL);
    
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
    
    let errorMessage = 'Ocorreu um erro ao se conectar com o serviço de chatbot.';

    if (error instanceof Error) {
        console.error('Error Name:', error.name);
        console.error('Error Message:', error.message);
        console.error('Stack Trace:', error.stack);
        errorMessage += `\n\nDetalhes Técnicos: ${error.message}`;
    } else {
        console.error('Caught a non-Error value:', error);
        errorMessage += `\n\nDetalhes Técnicos: ${String(error)}`;
    }
    
    console.error('--- GRADIO ERROR END ---');
    return { response: errorMessage };
  }
}
