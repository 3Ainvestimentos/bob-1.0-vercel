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
id: string;
role: 'user' | 'assistant';
content: string;
fileNames?: string[] | null;
source?: 'rag' | 'web' | 'transcription' | 'gemini' | 'ultra_batch' | null;
sources?: {
  title: string;
  uri: string;
}[] | null;
promptTokenCount?: number | null;
candidatesTokenCount?: number | null;
latencyMs?: number | null;
originalContent?: string | undefined | null;
isStandardAnalysis?: boolean;
ultraBatchJobId?: string; 
ultraBatchTotal?: number; 
ultraBatchProgress?: { current: number; total: number };
ultraBatchBatches?: Array<{
  batchNumber: number;
  files: Array<{
    fileName: string;
    content: string;
    success: boolean;
  }>;
}>;
ultraBatchEstimatedTimeMinutes?: number;
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


// ============= TYPES PARA API DE RELATÓRIOS =============

// Request types
export interface ReportAnalyzeAutoRequest {
file_content: string; // base64
file_name: string;
user_id: string;
}

export interface ReportAnalyzePersonalizedRequest {
file_content: string; // base64
file_name: string;
user_id: string;
selected_fields: {
  monthlyReturn?: boolean;
  yearlyReturn?: boolean;
  classPerformance?: { [className: string]: boolean };
};
}

export interface BatchReportRequest {
files: Array<{
  name: string;
  dataUri: string; // base64
}>;
user_id: string;
}

// Response types
export interface ReportAnalyzeResponse {
success: boolean;
extracted_data?: any;
file_name?: string;
highlights?: Array<{
  className: string;
  classReturn: string;  // ← Mudar de return para classReturn
  classBenchmark?: string;  // ← Adicionar se necessário
  classBenchmarkValue?: string;  // ← Adicionar se necessário
  benchmarkDifference?: string;  // ← Mudar de difference para benchmarkDifference
  drivers?: Array<{
    assetName: string;  // ← Adicionar se necessário
    assetReturn: string;  // ← Adicionar se necessário
    assetType?: string;  // ← Adicionar se necessário
  }>;
}>;
detractors?: Array<{
  className: string;
  classReturn: string;  // ← Mudar de return para classReturn
  classBenchmark?: string;  // ← Adicionar se necessário
  classBenchmarkValue?: string;  // ← Adicionar se necessário
  benchmarkDifference?: string;  // ← Adicionar se necessário
}>;
final_message?: string;
metadata?: any;
error?: string;
}

export interface BatchReportResponse {
success: boolean;
results: ReportAnalyzeResponse[];
metadata?: {
  total_files: number;
  success_count: number;
  failure_count: number;
};
error?: string;
}

export interface Asset {
assetName: string;
assetReturn: string;
cdiPercentage: string;
reason?: string;
}


// Types para compatibilidade com PromptBuilderDialog existente
export interface ExtractedData {
accountNumber: string;
reportMonth: string;
grossEquity: string;
monthlyReturn: string;
monthlyCdi: string;
monthlyGain: string;
yearlyReturn: string;
yearlyCdi: string;
yearlyGain: string;
highlights: Record<string, Array<{
  assetName: string;
  assetReturn: string;
  cdiPercentage: string;
  reason?: string;
}>>;
detractors: Record<string, Array<{
  assetName: string;
  assetReturn: string;
  cdiPercentage: string;
}>>;
classPerformance: Array<{
  className: string;
  classReturn: string;
  cdiPercentage: string;
}>;
benchmarkValues: { [key in 'CDI' | 'Ibovespa' | 'IPCA' | 'Dólar']?: string };
allAssets: Record<string, Asset[]>;
}

export interface SelectedFields {
grossEquity?: boolean;
monthlyReturn?: boolean;
monthlyCdi?: boolean;
monthlyGain?: boolean;
yearlyReturn?: boolean;
yearlyCdi?: boolean;
yearlyGain?: boolean;
highlights?: { [category: string]: { [index: number]: boolean } };
detractors?: { [category: string]: { [index: number]: boolean } };
allAssets?: { [category: string]: { [index: number]: boolean } };
classPerformance?: { [className: string]: boolean };
}

// Interafces da analise ultra batch

// Job que é salvo no Firestore
export interface UltraBatchJob {
userId: string;
status: 'processing' | 'completed' | 'failed';
totalFiles: number;
processedFiles: number;
successCount: number;
failureCount: number;
createdAt: any; // Firebase Timestamp
completedAt: any | null; // Firebase Timestamp ou null
error?: string | null;
}

// Resultado individual de cada arquivo
export interface UltraBatchResult {
fileName: string;
success: boolean;
final_message: string | null; // null se falhou
error: string | null; // null se sucesso
processedAt: any; // Firebase Timestamp
}

// Request que enviamos ao backend
export interface UltraBatchReportRequest {
batch_id: string; // ID do batch (retornado pelo endpoint /generate-upload-urls)
user_id: string;
chat_id?: string; // 🔗 PADRÃO DE PONTEIRO: ID do chat (opcional)
}

// Response que recebemos do backend
export interface UltraBatchReportResponse {
success: boolean;
job_id: string;
total_files: number;
estimated_time_minutes: number;
error?: string | null;
}

// ============= GENERATE UPLOAD URLS TYPES =============

// Request para gerar Signed URLs
export interface GenerateUploadUrlsRequest {
file_names: string[];
user_id: string;
chat_id?: string; // 🔗 PADRÃO DE PONTEIRO: ID do chat (opcional)
}

// Response com Signed URLs
export interface GenerateUploadUrlsResponse {
batch_id: string;
upload_urls: Array<{
  fileName: string;
  signedUrl: string;
  storagePath: string;
}>;
}