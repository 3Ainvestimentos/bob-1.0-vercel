
'use server';
/**
 * @fileOverview A chatbot flow that answers questions based on a Vertex AI RAG Corpus.
 *
 * - askChatbot - A function that handles the chatbot interaction.
 * - ChatbotInput - The input type for the askChatbot function.
 * - ChatbotOutput - The return type for the askChatbot function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

// Define the retriever tool that connects to your specific RAG Corpus
const corpusRetrieverTool = ai.defineRetriever(
  {
    name: 'corpusRetriever',
    type: 'googleAI/ragCorpus',
    corpus: 'projects/datavisor-44i5m/locations/us-central1/ragCorpora/6917529027641081856',
  }
);

const ChatbotInputSchema = z.object({
  prompt: z.string().describe('The user prompt for the chatbot.'),
});
export type ChatbotInput = z.infer<typeof ChatbotInputSchema>;

const ChatbotOutputSchema = z.object({
  response: z.string().describe('The chatbot response.'),
});
export type ChatbotOutput = z.infer<typeof ChatbotOutputSchema>;

export async function askChatbot(input: ChatbotInput): Promise<ChatbotOutput> {
  return ragChatFlow(input);
}

// Helper to safely stringify objects, including those with circular references
function safeStringify(obj: any, indent = 2) {
    const cache = new Set();
    return JSON.stringify(
        obj,
        (key, value) => {
            if (typeof value === 'object' && value !== null) {
                if (cache.has(value)) {
                    return '[Circular Reference]';
                }
                cache.add(value);
            }
            return value;
        },
        indent
    );
}


const ragChatFlow = ai.defineFlow(
  {
    name: 'ragChatFlow',
    inputSchema: ChatbotInputSchema,
    outputSchema: ChatbotOutputSchema,
  },
  async (input) => {
    try {
        const fullPrompt = `Você é um assistente especialista. Sua tarefa é responder perguntas usando APENAS as informações encontradas nos documentos fornecidos pela ferramenta de busca.
Se a resposta estiver nos documentos, forneça-a de forma clara e concisa.
Se a resposta não estiver nos documentos, responda EXATAMENTE com a frase: "Não encontrei uma resposta para essa pergunta nos documentos."
Não use nenhum conhecimento externo.

Pergunta do usuário: "${input.prompt}"`;

        const llmResponse = await ai.generate({
          model: 'googleai/gemini-1.5-flash-latest',
          prompt: fullPrompt,
          tools: [corpusRetrieverTool],
          config: {
            temperature: 1,
            topP: 1,
            safetySettings: [
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            ]
          }
        });

        const responseText = llmResponse?.text;

        if (!responseText) {
          console.warn("Model did not return text. Full response:", safeStringify(llmResponse));
          return { response: "Não encontrei uma resposta para essa pergunta nos documentos." };
        }

        return { response: responseText };
    } catch (e) {
        console.error('--- DETAILED ERROR START ---');
        console.error('An unrecoverable error occurred in ragChatFlow.');
        console.error('Timestamp:', new Date().toISOString());

        let detailedMessage = 'Ocorreu um erro crítico ao processar sua solicitação.\n\n';

        if (e instanceof Error) {
            console.error('Error Name:', e.name);
            console.error('Error Message:', e.message);
            console.error('Stack Trace:', e.stack);
            if (e.cause) console.error('Error Cause:', safeStringify(e.cause));

            detailedMessage += `Tipo de Erro: ${e.name}\n`;
            detailedMessage += `Mensagem: ${e.message}\n`;
            if (e.cause) {
                detailedMessage += `Causa Raiz: ${safeStringify(e.cause)}\n`;
            }
        } else {
            console.error('Caught a non-Error value:', e);
            const errorStr = safeStringify(e);
            detailedMessage += `Detalhes do Erro: ${errorStr}\n`;
        }
        
        detailedMessage += '\nVerifique os logs do servidor para mais detalhes. O problema pode ser:\n';
        detailedMessage += '- Conexão: Problemas de rede ou firewall.\n';
        detailedMessage += '- Permissões da API: A conta de serviço não tem o papel `Vertex AI User` ou `Vertex AI Service Agent`.\n';
        detailedMessage += '- Configuração do Corpus: O ID do corpus está incorreto ou a região está errada.\n';
        detailedMessage += '- API do Google: A API pode estar temporariamente indisponível ou rejeitando a chamada por motivos de segurança ou cota.';

        console.error('--- DETAILED ERROR END ---');

        return { response: detailedMessage };
    }
  }
);
