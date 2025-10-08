
export interface AttachedFile {
    id: string;
    fileName: string;
    mimeType: string;
    storagePath: string;
    downloadURL: string;
    deidentifiedContent?: string;
}

export type UserRole = 'admin' | 'beta' | 'user';

export interface Feedback {
  id: string;
  user: { email?: string; displayName?: string };
  updatedAt: string;
  rating: 'positive' | 'negative';
  userQuery: string;
  assistantResponse: string;
  comment?: string;
}

export interface LegalIssueAlert {
  id: string;
  user: { email?: string; displayName?: string };
  reportedAt: string;
  userQuery: string;
  assistantResponse: string;
  comment?: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  latencyMs?: number;
  source?: 'rag' | 'web';
  sources?: {
    title: string;
    uri: string;
  }[];
}

// Primeiro, precisamos definir o que é uma 'ClientRagSource', que é usado dentro da resposta
export interface ClientRagSource {
  title: string;
  uri: string;
  // Adicione outros campos se houver, como 'content' ou 'score'
}

// Agora, a interface correta para a resposta do Gemini
export interface GeminiResponse {
  summary: string;
  searchFailed: boolean;
  sources: ClientRagSource[];
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  error?: string; // Mantemos o 'error' opcional para o tratamento de falhas
}
