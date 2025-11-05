'use client';

import {
  ChatInputForm
} from '@/components/chat/ChatInputForm';
import {
  ChatMessageArea
} from './ChatMessageArea';
import { ChatSidebar } from '@/components/chat/ChatSidebar';
import {
  askAssistant,
  deidentifyTextOnly,
  generateSuggestedQuestions,
  generateTitleForConversation,
  logRegeneratedQuestion,
  regenerateAnswer,
  removeFileFromConversation,
  transcribeLiveAudio,
  analyzeMeetingTranscript, 
  batchAnalyzeReports,
  ultraBatchAnalyzeReports,
  generateUploadUrls,
} from '@/app/actions';
// Importa a função que foi movida do seu novo local
import { setUserOnboardingStatus } from '@/app/admin/actions';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { SidebarProvider, Sidebar, SidebarInset } from '@/components/ui/sidebar';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { auth, db, storage } from '@/lib/firebase';
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  arrayUnion
} from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import React, {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { FaqDialog } from '@/components/chat/FaqDialog';
import { FileUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AttachedFile, UserRole, Message } from '@/types';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { POSICAO_CONSOLIDADA_PREAMBLE } from './preambles';
import { OnboardingTour } from '@/components/chat/OnboardingTour';
import { PromptBuilderDialog } from '@/components/chat/PromptBuilderDialog';
import { UpdateNotificationManager } from '@/components/chat/UpdateNotificationManager';
import { MeetingInsightsDialog } from "@/components/chat/MeetingInsightsDialog";
import { getAnalytics, logEvent } from "firebase/analytics";




// ---- Data Types ----
export interface RagSource {
  title: string;
  uri: string;
}

export interface Group {
  id: string;
  name: string;
  createdAt: Timestamp;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  messages: Message[];
  groupId?: string | null;
  totalTokens?: number;
  attachedFiles: AttachedFile[];
}

export type ConversationSidebarItem = Omit<Conversation, 'messages' | 'totalTokens' | 'attachedFiles'>;

interface FeedbackDetails {
    messageId: string;
    userQuery: string;
    assistantResponse: string;
}

export type SearchSource = 'rag' | 'web' | 'ultra_batch' | 'transcription' | 'gemini';


// ---- Firestore Functions ----

async function reportLegalIssue(
  userId: string,
  chatId: string,
  messageId: string,
  userQuery: string,
  assistantResponse: string,
  comment?: string
) {
  if (!userId || !chatId || !messageId) {
    throw new Error('User ID, Chat ID, and Message ID are required.');
  }

  const reportRef = collection(db, 'legal_issue_alerts');
  const payload: any = {
    userId,
    chatId,
    messageId,
    userQuery,
    assistantResponse,
    reportedAt: serverTimestamp(),
    status: 'new',
  };

  if (comment && comment.trim()) {
    payload.comment = comment;
  }

  await addDoc(reportRef, payload);
}


async function getFeedbacksForConversation(userId: string, chatId: string): Promise<Record<string, 'positive' | 'negative'>> {
    if (!userId || !chatId) return {};
    const feedbackCollRef = collection(db, 'users', userId, 'feedbacks');
    const q = query(feedbackCollRef, where('chatId', '==', chatId));
    
    try {
        const querySnapshot = await getDocs(q);
        const feedbacks: Record<string, 'positive' | 'negative'> = {};
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.messageId) {
                feedbacks[data.messageId] = data.rating;
            }
        });
        return feedbacks;
    } catch (error) {
        console.error("Error fetching feedbacks (this might require a Firestore index):", error);
        return {};
    }
}

async function setFeedback(
  userId: string,
  chatId: string,
  messageId: string,
  rating: 'positive' | 'negative' | null,
  userQuery: string,
  assistantResponse: string
) {
  if (!userId || !chatId || !messageId) throw new Error('User ID, Chat ID, and Message ID are required for feedback.');
  
  const feedbackRef = doc(db, 'users', userId, 'feedbacks', messageId);

  if (rating === null) {
    await deleteDoc(feedbackRef);
  } else {
    await setDoc(feedbackRef, {
      userId,
      chatId,
      messageId,
      rating,
      userQuery,
      assistantResponse,
      updatedAt: serverTimestamp(),
    });
  }
}


async function getGroups(userId: string): Promise<Group[]> {
  if (!userId) return [];
  const groupsRef = collection(db, 'users', userId, 'groups');
  const q = query(groupsRef, orderBy('createdAt', 'asc'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Group[];
}

async function createGroup(userId: string, name: string): Promise<string> {
  if (!userId || !name) throw new Error('User ID and group name are required.');
  const groupsRef = collection(db, 'users', userId, 'groups');
  const newGroupRef = await addDoc(groupsRef, {
    name,
    createdAt: serverTimestamp(),
  });
  return newGroupRef.id;
}

async function updateGroup(userId: string, groupId: string, newName: string): Promise<void> {
  if (!userId || !groupId || !newName) throw new Error('User ID, Group ID, and new name are required.');
  const groupRef = doc(db, 'users', userId, 'groups', groupId);
  await updateDoc(groupRef, { name: newName });
}

async function deleteGroup(userId: string, groupId: string): Promise<void> {
    if (!userId || !groupId) throw new Error('User ID and Group ID are required.');

    const batch = writeBatch(db);

    const chatsRef = collection(db, 'users', userId, 'chats');
    const q = query(chatsRef, where('groupId', '==', groupId));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => {
        batch.update(doc.ref, { groupId: null });
    });

    const groupRef = doc(db, 'users', userId, 'groups', groupId);
    batch.delete(groupRef);

    await batch.commit();
}

async function updateConversationGroup(
  userId: string,
  chatId: string,
  groupId: string | null
) {
  if (!userId || !chatId)
    throw new Error('User ID and Chat ID are required.');
  const chatRef = doc(db, 'users', userId, 'chats', chatId);
  await updateDoc(chatRef, { groupId });
}

async function getConversations(
  userId: string
): Promise<ConversationSidebarItem[]> {
  if (!userId) {
    console.error('getConversations called without userId');
    return [];
  }
  try {
    const conversationsRef = collection(db, 'users', userId, 'chats');
    const q = query(conversationsRef, orderBy('createdAt', 'desc'));

    const querySnapshot = await getDocs(q);
    const conversations: ConversationSidebarItem[] = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const firestoreTimestamp = data.createdAt as Timestamp;
      conversations.push({
        id: doc.id,
        title: data.title,
        createdAt: firestoreTimestamp.toDate().toISOString(),
        groupId: data.groupId || null,
      });
    });
    return conversations;
  } catch (error) {
    console.error('Error fetching conversations:', error);
    throw new Error('Não foi possível carregar o histórico de conversas.');
  }
}

/**
 * Função auxiliar para agrupar resultados em lotes de tamanho fixo
 * 
 * @param results - Array de resultados para agrupar
 * @param batchSize - Tamanho de cada lote (padrão: 5)
 * @returns Array de objetos { batchNumber, files }
 */
function groupResultsByBatch(results: any[], batchSize = 5) {
  const batches = [];
  for (let i = 0; i < results.length; i += batchSize) {
    batches.push({
      batchNumber: Math.floor(i / batchSize) + 1,
      files: results.slice(i, i + batchSize).map((r: any) => {
        const content = r.finalMessage || r.error;
        const cleanedContent = content ? String(content).replace(/^```|```$/g, '').trim() : '';
        return {
          fileName: r.fileName || r.file_name,
          content: cleanedContent,
          success: r.success
        };
      })
    });
  }
  return batches;
}

/**
 * 🔗 PADRÃO DE PONTEIRO: Carrega resultados de um ultra batch job do Firestore
 * 
 * @param jobId - ID do job de ultra batch
 * @returns Array de resultados ordenados por índice
 */
async function loadUltraBatchResults(jobId: string): Promise<any[]> {
  try {
    console.log(`🔗 Carregando resultados do job ${jobId} do Firestore...`);
    
    const resultsRef = collection(db, 'ultra_batch_jobs', jobId, 'results');
    const resultsSnapshot = await getDocs(resultsRef);
    
    if (resultsSnapshot.empty) {
      //console.log(`⚠️ Nenhum resultado encontrado para o job ${jobId}`);
      return [];
    }
    
    // Ordenar resultados pelo ID do documento (que é o índice numérico)
    const sortedDocs = resultsSnapshot.docs.sort((a, b) => {
      const idA = parseInt(a.id, 10);
      const idB = parseInt(b.id, 10);
      return idA - idB;
    });
    
    // Mapear para o formato esperado
    const results = sortedDocs.map(doc => {
      const data = doc.data();
      return {
        fileName: data.fileName || data.file_name,
        finalMessage: data.final_message || data.finalMessage,
        success: data.success || false,
        error: data.error || null,
        processedAt: data.processedAt
      };
    });
    
    //console.log(`✅ ${results.length} resultados carregados e ordenados`);
    return results;
    
  } catch (error) {
    console.error(`❌ Erro ao carregar resultados do job ${jobId}:`, error);
    return [];
  }
}

async function getFullConversation(userId: string, chatId: string): Promise<Conversation | null> {
    try {
        const chatRef = doc(db, 'users', userId, 'chats', chatId);
        const chatSnap = await getDoc(chatRef);

        if (chatSnap.exists()) {
            const data = chatSnap.data();
            const firestoreTimestamp = data.createdAt as Timestamp;
            let messagesWithIds = (data.messages || []).map((m: any) => ({
                ...m,
                id: m.id || crypto.randomUUID(),
            }));
            
            // 🔗 PADRÃO DE PONTEIRO: Carregar resultados de ultra batch jobs do Firestore
            const batchJobId = data.batchJobId; // Ponteiro no nível do documento do chat
            
            if (batchJobId) {
                console.log(`🔗 Encontrado batchJobId no chat: ${batchJobId}`);
                try {
                    // Buscar resultados da coleção ultra_batch_jobs
                    const results = await loadUltraBatchResults(batchJobId);
                    
                    if (results.length > 0) {
                        // Agrupar resultados em batches
                        const batches = groupResultsByBatch(results, 5);
                        
                        // ... (dentro de getFullConversation) ...

                        // "Hidratar" mensagens que têm este jobId
                        messagesWithIds = messagesWithIds.map((msg: any) => {
                          // ----------------- MENSAGEM DO ASSISTENTE -----------------
                          if (msg.ultraBatchJobId === batchJobId && msg.role === 'assistant') {
                              // ✅ CORREÇÃO: Reconstrói o 'content' a partir dos batches carregados
                              const newContent = `# Análise de ${msg.ultraBatchTotal || results.length} relatório(s) XP\n\n` + 
                                  batches.map((batch: any) => 
                                      `## 📁 Lote ${batch.batchNumber} (${batch.files.length} arquivos)\n\n` +
                                      batch.files.map((file: any, index: number) => 
                                          `### Arquivo ${index + 1}: ${file.fileName}\n\n${file.content}`
                                      ).join('\n\n---\n\n')
                                  ).join('\n\n---\n\n');

                              return {
                                  ...msg,
                                  ultraBatchBatches: batches, // Adiciona os batches
                                  ultraBatchProgress: { current: results.length, total: msg.ultraBatchTotal || results.length }, // ✅ CORREÇÃO: Atualiza progresso para final
                                  content: newContent, // ✅ CORREÇÃO: Substitui o 'content' antigo
                              };
                          }

                          // ----------------- MENSAGEM DO USUÁRIO -----------------
                          if (msg.ultraBatchJobId === batchJobId && msg.role === 'user') {
                              // ✅ CORREÇÃO: Atualiza o progresso na mensagem do usuário também
                              return {
                                  ...msg,
                                  ultraBatchProgress: { current: results.length, total: msg.ultraBatchTotal || results.length },
                              };
                          }
                          
                          return msg;
                        });
                        
                        //console.log(`✅ ${results.length} resultados hidratados nas mensagens`);
                    }
                } catch (error) {
                    console.error(`❌ Erro ao carregar resultados do job ${batchJobId}:`, error);
                    // Continuar sem os resultados, não falhar o carregamento do chat
                }
            }
            
           // ========================================================================
        // BLOCO DE COMPATIBILIDADE: Para jobs antigos sem ponteiro no chat
        // ========================================================================
        // Usamos Promise.all para aguardar todas as buscas e reconstruir o array de forma imutável.
        messagesWithIds = await Promise.all(messagesWithIds.map(async (msg: any) => {
          // Se a mensagem não tem um jobId ou se os batches já foram hidratados pelo bloco principal, pula.
          if (!msg.ultraBatchJobId || msg.ultraBatchBatches) {
              return msg;
          }

          //console.log(`🔗 (Compatibilidade) Encontrado jobId na mensagem: ${msg.ultraBatchJobId}`);
          try {
              const results = await loadUltraBatchResults(msg.ultraBatchJobId);
              if (results.length > 0) {
                  const batches = groupResultsByBatch(results, 5);

                  if (msg.role === 'assistant') {
                      const newContent = `# Análise de ${msg.ultraBatchTotal || results.length} relatório(s) XP\n\n` + 
                          batches.map((batch: any) => 
                              `## 📁 Lote ${batch.batchNumber} (${batch.files.length} arquivos)\n\n` +
                              batch.files.map((file: any, index: number) => 
                                  `### Arquivo ${index + 1}: ${file.fileName}\n\n${file.content}`
                              ).join('\n\n---\n\n')
                          ).join('\n\n---\n\n');
                      
                      // Retorna um NOVO objeto de mensagem, hidratado
                      return {
                          ...msg,
                          ultraBatchBatches: batches,
                          ultraBatchProgress: { current: results.length, total: msg.ultraBatchTotal || results.length },
                          content: newContent,
                      };
                  }
                  // A mensagem do usuário correspondente será atualizada em um loop separado se necessário,
                  // mas geralmente a do assistente é a que contém a exibição principal.
              }
          } catch (error) {
              console.error(`❌ (Compatibilidade) Erro ao carregar resultados do job ${msg.ultraBatchJobId}:`, error);
          }
          // Se algo falhar ou não houver resultados, retorna a mensagem original
          return msg;
      }));
            
            return {
                id: chatSnap.id,
                title: data.title,
                createdAt: firestoreTimestamp.toDate().toISOString(),
                messages: messagesWithIds,
                groupId: data.groupId || null,
                totalTokens: data.totalTokens || 0,
                attachedFiles: data.attachedFiles || [],
            } as Conversation;
        } else {
            console.log('No such document!');
            return null;
        }
    } catch (err: any) {
        console.error('Error fetching full conversation:', err);
        throw new Error('Não foi possível carregar a conversa completa.');
    }
}

async function saveConversation(
  userId: string,
  messages: Message[],
  chatId?: string | null,
  options: {
    newChatTitle?: string;
    attachedFiles?: AttachedFile[];
  } = {}
): Promise<string> {
  if (!userId) throw new Error('User ID is required.');
  if (!messages || messages.length === 0)
    throw new Error('Messages are required.');

  const conversationsRef = collection(db, 'users', userId, 'chats');

  const sanitizedMessages = messages.map(msg => {
    // 🔗 LÓGICA DE DESIDRATAÇÃO:
    // Se esta é uma mensagem do assistente de um job ultra lote,
    // NÃO devemos salvar seu conteúdo hidratado. Substituímos por um placeholder.
    // O conteúdo real será re-hidratado pela getFullConversation ao carregar.
    let contentToSave = msg.content;
    if (msg.role === 'assistant' && msg.ultraBatchJobId) {
        // Este placeholder é o que fica salvo no banco de dados.
        contentToSave = `# Análise Ultra Lote - ${msg.ultraBatchTotal || 'múltiplos'} arquivos\n\nProcessando...`;
    }

    return {
      id: msg.id,
      role: msg.role,
      content: contentToSave, // ✅ Usar o conteúdo desidratado
      fileNames: msg.fileNames ?? null,
      source: msg.source ?? null,
      sources: msg.sources?.map(s => ({ title: s.title, uri: s.uri })) ?? null,
      promptTokenCount: msg.promptTokenCount ?? null,
      candidatesTokenCount: msg.candidatesTokenCount ?? null,
      latencyMs: msg.latencyMs ?? null,
      originalContent: msg.originalContent ?? null,
      isStandardAnalysis: msg.isStandardAnalysis ?? false,

      // 🔗 PADRÃO DE PONTEIRO: Salvar apenas metadados do ultra batch, não o conteúdo completo
      ultraBatchJobId: msg.ultraBatchJobId ?? null,
      ultraBatchTotal: msg.ultraBatchTotal ?? null,
      ultraBatchProgress: msg.ultraBatchProgress ?? null,
      // ultraBatchBatches: NÃO SALVAR - será carregado do Firestore usando o jobId
      ultraBatchEstimatedTimeMinutes: msg.ultraBatchEstimatedTimeMinutes ?? null,
    };
  });

  const totalTokens = sanitizedMessages.reduce((acc, msg) => {
    const promptTokens = msg.promptTokenCount || 0;
    const candidateTokens = msg.candidatesTokenCount || 0;
    return acc + promptTokens + candidateTokens;
  }, 0);

  if (chatId) {
    const chatRef = doc(conversationsRef, chatId);
    const updatePayload: any = {
      messages: sanitizedMessages,
      totalTokens,
    };

    if (options.attachedFiles && options.attachedFiles.length > 0) {
      updatePayload.attachedFiles = arrayUnion(...options.attachedFiles);
    }
    
    await updateDoc(chatRef, updatePayload);
    return chatId;
  } else {
    const firstUserMessage = sanitizedMessages.find((m) => m.role === 'user');
    const title = options.newChatTitle || (firstUserMessage?.content || 'Nova Conversa').substring(0, 30);
    
    const newChatPayload: any = {
        title,
        messages: sanitizedMessages,
        totalTokens,
        createdAt: serverTimestamp(),
        groupId: null,
        attachedFiles: options.attachedFiles || [],
    };

    const newChatRef = await addDoc(conversationsRef, newChatPayload);
    return newChatRef.id;
  }
}

async function updateConversationTitle(userId: string, chatId: string, newTitle: string): Promise<void> {
    if (!userId || !chatId || !newTitle) throw new Error('User ID, Chat ID, and new title are required.');
    const chatRef = doc(db, 'users', userId, 'chats', chatId);
    await updateDoc(chatRef, { title: newTitle });
}

async function deleteConversation(userId: string, chatId: string): Promise<void> {
    if (!userId || !chatId) throw new Error('User ID and Chat ID are required.');

    const chatRef = doc(db, 'users', userId, 'chats', chatId);
    const archivedChatRef = doc(db, 'archived_chats', chatId);

    try {
        const chatSnap = await getDoc(chatRef);
        if (chatSnap.exists()) {
            const chatData = chatSnap.data();
            
            const archivedData = {
                ...chatData,
                archivedAt: serverTimestamp(),
                deletedBy: userId,
            };
            
            const batch = writeBatch(db);
            batch.set(archivedChatRef, archivedData);
            batch.delete(chatRef);
            
            await batch.commit();

        } else {
            console.warn(`Conversation with ID ${'' + chatId} not found to archive.`);
        }
    } catch (error) {
        console.error("Error archiving and deleting conversation:", error);
        throw new Error("Não foi possível excluir a conversa. Tente novamente.");
    }
}

const FileDropOverlay = () => (
    <div className="pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/80 backdrop-blur-sm">
        <FileUp className="h-16 w-16 text-primary" />
        <p className="text-xl font-semibold text-foreground">
            Arraste e solte os arquivos aqui
        </p>
    </div>
);

export default function ChatPageContent() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [conversations, setConversations] = useState<ConversationSidebarItem[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isSidebarLoading, setIsSidebarLoading] = useState(true);
  const [activeChat, setActiveChat] = useState<Conversation | null>(null);
  const [lastMessageCount, setLastMessageCount] = useState(0);
  
  const [isNewGroupDialogOpen, setIsNewGroupDialogOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<string | null>(null);

  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [itemToRename, setItemToRename] = useState<{ id: string; type: 'group' | 'conversation'; currentName: string } | null>(null);
  const [newItemName, setNewItemName] = useState('');

  const [isDeleteConvoDialogOpen, setIsDeleteConvoDialogOpen] = useState(false);
  const [convoToDelete, setConvoToDelete] = useState<string | null>(null);

  const [feedbacks, setFeedbacks] = useState<Record<string, 'positive' | 'negative'>>({});
  const [isFeedbackDialogOpen, setIsFeedbackDialogOpen] = useState(false);
  const [feedbackDetails, setFeedbackDetails] = useState<FeedbackDetails | null>(null);
  const [feedbackComment, setFeedbackComment] = useState('');

  const [regeneratingMessageId, setRegeneratingMessageId] = useState<string | null>(null);

  const [isLegalReportDialogOpen, setIsLegalReportDialogOpen] = useState(false);
  const [messageToReport, setMessageToReport] = useState<Message | null>(null);
  const [legalReportComment, setLegalReportComment] = useState('');

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [activeDragItem, setActiveDragItem] = useState<ConversationSidebarItem | Group | null>(null);
  const [isFaqDialogOpen, setIsFaqDialogOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  
  const [isCheckingTerms, setIsCheckingTerms] = useState(true);
  const [showTermsDialog, setShowTermsDialog] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const [searchSource, setSearchSource] = useState<SearchSource>('rag');
  const [isPromptBuilderOpen, setIsPromptBuilderOpen] = useState(false);
  const [isMeetingInsightsOpen, setIsMeetingInsightsOpen] = useState(false);

  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeChatId = activeChat?.id ?? null;

  const theme = user?.email?.endsWith('@3ainvestimentos.com.br')
    ? 'theme-blue'
    : user?.email?.endsWith('@3ariva.com.br')
    ? 'theme-green'
    : '';

  useEffect(() => {
    document.body.classList.remove('theme-blue', 'theme-green');
    if (theme) {
      document.body.classList.add(theme);
    }
  }, [theme]);

  const handleSignOut = useCallback(async () => {
    await signOut(auth);
    router.push('/');
  }, [router]);

  const fetchSidebarData = useCallback(async () => {
    if (!user) return;
    setIsSidebarLoading(true);
    try {
      const [userConversations, userGroups] = await Promise.all([
        getConversations(user.uid),
        getGroups(user.uid),
      ]);
      setConversations(userConversations);
      setGroups(userGroups);
      setExpandedGroups(prev => {
        const newExpanded = { ...prev };
        userGroups.forEach(group => {
            if (!(group.id in newExpanded)) {
                newExpanded[group.id] = false; // Default to collapsed
            }
        });
        return newExpanded;
      });
    } catch (err: any) {
      setError(`Erro ao carregar o histórico: ${'' + err.message}`);
      toast({
          variant: "destructive",
          title: "Erro de Carregamento",
          description: err.message,
      });
    } finally {
      setIsSidebarLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    if (messages.length > lastMessageCount) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setLastMessageCount(messages.length);
    }
  }, [messages, isLoading, lastMessageCount]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [isLoading, activeChatId]);

  const handleNewChat = () => {
    setActiveChat(null);
    setMessages([]);
    setInput('');
    setError(null);
    setFeedbacks({});
    setSelectedFiles([]);
  };

 useEffect(() => {
    if (authLoading) {
      return;
    }
    if (!user) {
      router.push('/');
      return;
    }
    
    const checkUserStatus = async () => {
      setIsCheckingTerms(true);
      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        
        if (!userDocSnap.exists()) {
             toast({
                variant: 'destructive',
                title: 'Erro de Autenticação',
                description: 'Seu usuário não foi encontrado. Por favor, faça login novamente.',
            });
            await handleSignOut();
            return;
        }

        const userData = userDocSnap.data();
        await fetchSidebarData();

        if (userData?.termsAccepted !== true) {
            setShowTermsDialog(true);
        } else if (userData?.hasCompletedOnboarding !== true) {
             setTimeout(() => setShowOnboarding(true), 150);
        }

      } catch (err: any) {
        toast({
          variant: 'destructive',
          title: 'Erro ao verificar o usuário',
          description: err.message,
        });
        await handleSignOut();
      } finally {
        setIsCheckingTerms(false);
      }
    };
    checkUserStatus();
  }, [user, authLoading, router, toast, handleSignOut, fetchSidebarData]);


  const handleSelectConversation = async (chatId: string) => {
    if (isLoading || !user) return;
    setIsLoading(true);
    setError(null);
    setMessages([]); 
    setFeedbacks({});
    setSelectedFiles([]);
    try {
        const fullChat = await getFullConversation(user.uid, chatId);
        if (fullChat) {
            setActiveChat(fullChat);
            setMessages(fullChat.messages);
            const fetchedFeedbacks = await getFeedbacksForConversation(user.uid, chatId);
            setFeedbacks(fetchedFeedbacks);
        } else {
            // If chat not found, start a new one.
            handleNewChat();
            toast({
                variant: "destructive",
                title: "Erro",
                description: "A conversa selecionada não foi encontrada. Iniciando um novo chat.",
            });
        }
    } catch (err: any) {
      setError(`Erro ao carregar a conversa: ${'' + err.message}`);
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  };

  const readFileAsDataURL = (file: File): Promise<{name: string, mimeType: string, dataUri: string}> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({
        name: file.name,
        mimeType: file.type,
        dataUri: reader.result as string
      });
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const submitQuery = async (
    query: string, 
    filesToUpload: File[], 
    mensagemVisivelParaUsuario?: string
  ) => {
    if (!query.trim() && filesToUpload.length === 0) return;
    if (isLoading || !user) return;
  
    const originalQuery = mensagemVisivelParaUsuario || query;
    setInput('');
    setSelectedFiles([]);
    setError(null);
    setIsLoading(true);

    try {
      const deidentifiedQuery = await deidentifyTextOnly(originalQuery);
      // A lógica para análise padrão agora verifica a query INTERNA.
      const useStandardAnalysis = query === POSICAO_CONSOLIDADA_PREAMBLE;      const fileNames = filesToUpload.map(f => f.name);
        
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: deidentifiedQuery,
        originalContent: originalQuery,
        fileNames: fileNames.length > 0 ? fileNames : null,
        isStandardAnalysis: useStandardAnalysis,
        source: searchSource,
      };

      const currentMessages = [...messages, userMessage];
      setMessages(currentMessages);

      let currentChatId = activeChatId;
      const attachedFiles: AttachedFile[] = [];
  
      if (!currentChatId) {
        const tempTitle = await generateTitleForConversation(deidentifiedQuery, fileNames.join(', '));
        const newId = await saveConversation(user.uid, currentMessages, null, { newChatTitle: tempTitle });
        currentChatId = newId;
        const newFullChat = await getFullConversation(user.uid, newId);
        setActiveChat(newFullChat);
        await fetchSidebarData();
      } else {
        await saveConversation(user.uid, currentMessages, currentChatId);
      }
  
      if (filesToUpload.length > 0) {
        for (const file of filesToUpload) {
          const storageRef = ref(storage, `users/${user.uid}/${currentChatId}/${file.name}`);
          const snapshot = await uploadBytes(storageRef, file);
          const downloadURL = await getDownloadURL(snapshot.ref);
          attachedFiles.push({
            id: crypto.randomUUID(),
            fileName: file.name,
            mimeType: file.type,
            storagePath: snapshot.ref.fullPath,
            downloadURL: downloadURL,
          });
        }
      }
      
      const fileDataUris = await Promise.all(filesToUpload.map(readFileAsDataURL));
  
      const assistantResponse = await askAssistant(
        query,
        {
          fileDataUris,
          useStandardAnalysis,
          source: searchSource === 'rag' || searchSource === 'web' ? searchSource : 'rag',
        }
      );
  
      if (assistantResponse.error) {
        throw new Error(assistantResponse.error);
      }
  
      if (!assistantResponse.summary) {
        throw new Error("A resposta do assistente foi indefinida. Verifique o backend.");
      }
      
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: assistantResponse.summary,
        source: assistantResponse.source,
        sources: assistantResponse.sources,
        promptTokenCount: assistantResponse.promptTokenCount,
        candidatesTokenCount: assistantResponse.candidatesTokenCount,
        latencyMs: assistantResponse.latencyMs,
      };
      
      const finalMessages = [...currentMessages, assistantMessage];
      setMessages(finalMessages);
      await saveConversation(user.uid, finalMessages, currentChatId, { attachedFiles });
  
    } catch (err: any) {
      const errorMessageContent = `Ocorreu um erro: ${'' + err.message}`;
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: errorMessageContent,
      };
      setMessages((prev) => [...prev, errorMessage]);
      setError(errorMessageContent);
    } finally {
      setIsLoading(false);
    }
  };
  
  
  const handleSuggestionClick = (suggestion: string) => {
      if (suggestion === 'open_prompt_builder') {
          setIsPromptBuilderOpen(true);
          return;
      }

      //if (suggestion === 'open_meeting_insights') {
        //setIsMeetingInsightsOpen(true);
        //return;
    //}
      setInput(suggestion);
      inputRef.current?.focus();
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleBatchSubmit = async (files: File[]) => {
    if (files.length === 0) {
        toast({
            variant: 'destructive',
            title: 'Nenhum Arquivo',
            description: 'Por favor, anexe um ou mais relatórios para análise em lote.',
        });
        return;
    }
    try {
      setIsPromptBuilderOpen(false);
      
      // Converter todos os arquivos para base64 no frontend
      const batchFiles = await Promise.all(
        files.map(async (file) => {
          const base64Content = await fileToBase64(file);
          return {
            name: file.name,
            dataUri: base64Content
          };
        })
      );
      
      // Usar nova API de batch
      const result = await batchAnalyzeReports(batchFiles, user?.uid || 'anonymous');
      
      if (!result.success) {
        throw new Error(result.error || 'Erro no processamento em lote');
      }
      
      // Processar resultados do batch
      const messages = result.results.map((reportResult, index) => {
        if (reportResult.success && reportResult.final_message) {
          return {
            fileName: reportResult.file_name,
            content: reportResult.final_message
          };
        } else {
          return {
            fileName: reportResult.file_name,
            content: `**Erro:** ${reportResult.error || 'Processamento falhou'}`
          };
        }
      });
      
      const joinedMessages = messages.map(msg => 
        `## Análise do ${msg.fileName}\n\n${msg.content}`
      ).join('\n\n');
      const batchPrompt = `# Análise de ${files.length} relatórios XP\n\n${joinedMessages}`;

      const fileNames = result.results
      .map(reportResult => reportResult.file_name)
      .filter((fileName): fileName is string => fileName !== undefined);
      //console.log('🔍 DEBUG ChatPage.tsx- result.results:', result.results);
      //console.log('🔍 DEBUG ChatPage.tsx - fileNames mapeados:', result.results.map(r => r.file_name));
      //console.log('🔍 DEBUG ChatPage.tsx- fileNames filtrados:', fileNames);
      //console.log('🔍 DEBUG ChatPage.tsx- fileNames length:', fileNames.length);

      
      // Usar o handleAnalysisResult existente, antigo handlePromptGenerated
      handleAnalysisResult(batchPrompt, fileNames);
      
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro na Análise',
        description: err.message || 'Erro desconhecido',
      });
    }
  };

// Simplificar a função
const handleMeetingAnalyzed = async (files: File[]) => {
  if (files.length === 0) {
    toast({
      variant: 'destructive',
      title: 'Nenhum Arquivo',
      description: 'Por favor, anexe uma transcrição de reunião para análise.',
    });
    return;
  }

  if (!user) {
    toast({
      variant: 'destructive',
      title: 'Erro de Autenticação',
      description: 'Usuário não autenticado.',
    });
    return;
  }

  const file = files[0];
  setIsLoading(true);
  setError(null);

  try {
    const result = await analyzeMeetingTranscript(file);

    //console.log('🔍 DEBUG ChatPage.tsx- Result from Python:', result); // ✅ Adicionar este log

    
    if (!result.success) {
      throw new Error('Falha na análise da transcrição');
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: `Analisando transcrição da reunião (Análise Geral)...`,
      fileNames: [file.name],
      source: 'transcription',
    };

    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: result.summary + (result.opportunities && result.opportunities.length > 0 
        ? `\n\n**Oportunidades Identificadas:**\n${result.opportunities.map((opp: any, index: number) => 
            `${index + 1}. **${opp.title}:**\n\n   ${opp.description}`
          ).join('\n')}`
        : ''),
      source: 'transcription',
    };
    const newMessages = [...messages, userMessage, assistantMessage];
    setMessages(newMessages);

    // Salvar conversa
    let currentChatId = activeChatId;
    if (!currentChatId) {
      const tempTitle = await generateTitleForConversation(userMessage.content, file.name);
      const newId = await saveConversation(user.uid, newMessages, null, { newChatTitle: tempTitle });
      currentChatId = newId;
      const newFullChat = await getFullConversation(user.uid, newId);
      setActiveChat(newFullChat);
      await fetchSidebarData();
    } else {
      await saveConversation(user.uid, newMessages, currentChatId);
    }

  } catch (err: any) {
    const errorMessageContent = `Ocorreu um erro na análise: ${err.message}`;
    const errorMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: errorMessageContent,
    };
    setMessages((prev) => [...prev, errorMessage]);
    setError(errorMessageContent);
  } finally {
    setIsLoading(false);
    setIsMeetingInsightsOpen(false);
  }
};

  
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    // Interceptar comandos especiais ANTES do submitQuery - comando especial para abrir análise de reunião
    if (input === '/hiding_meeting') {
      setIsMeetingInsightsOpen(true);
      setInput(''); // Limpar a caixa de texto
      return;
    }

    submitQuery(input, selectedFiles);
  };
  
  const handleCreateGroup = async (e: FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim() || !user) return;
    try {
      await createGroup(user.uid, newGroupName);
      setNewGroupName('');
      setIsNewGroupDialogOpen(false);
      await fetchSidebarData();
    } catch (err: any) {
      setError(`Erro ao criar o grupo: ${'' + err.message}`);
    }
  };

  const handleMoveConversation = async (
    chatId: string,
    groupId: string | null
  ) => {
    if (!user) return;
    try {
      setConversations((convos) =>
        convos.map((c) => (c.id === chatId ? { ...c, groupId } : c))
      );
      await updateConversationGroup(user.uid, chatId, groupId);
    } catch (err: any) {
      setError(`Erro ao mover a conversa: ${'' + err.message}`);
      fetchSidebarData();
    }
  };
  
  const handleDeleteRequest = (groupId: string) => {
    setGroupToDelete(groupId);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteGroupConfirm = async () => {
    if (!groupToDelete || !user) return;
    try {
      await deleteGroup(user.uid, groupToDelete);
      await fetchSidebarData(); 
    } catch (err: any)      {
      setError(`Erro ao excluir o grupo: ${'' + err.message}`);
    } finally {
      setIsDeleteDialogOpen(false);
      setGroupToDelete(null);
    }
  };

  const handleRenameRequest = (id: string, type: 'group' | 'conversation', currentName: string) => {
    setItemToRename({ id, type, currentName });
    setNewItemName(currentName);
    setIsRenameDialogOpen(true);
  };

  const handleRenameSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim() || !user || !itemToRename) return;

    try {
        if (itemToRename.type === 'group') {
            await updateGroup(user.uid, itemToRename.id, newItemName);
        } else {
            await updateConversationTitle(user.uid, itemToRename.id, newItemName);
        }
        setIsRenameDialogOpen(false);
        setItemToRename(null);
        setNewItemName('');
        await fetchSidebarData();
    } catch (err: any) {
        setError(`Erro ao renomear: ${'' + err.message}`);
    }
  };

  const handleDeleteConvoRequest = (chatId: string) => {
    setConvoToDelete(chatId);
    setIsDeleteConvoDialogOpen(true);
  };

  const handleDeleteConvoConfirm = async () => {
    if (!convoToDelete || !user) return;
    try {
        await deleteConversation(user.uid, convoToDelete);
        await fetchSidebarData();
        if (activeChatId === convoToDelete) {
            handleNewChat();
        }
    } catch (err: any) {
        setError(`Erro ao excluir a conversa: ${'' + err.message}`);
    } finally {
        setIsDeleteConvoDialogOpen(false);
        setConvoToDelete(null);
    }
  };

  const handleFeedback = async (message: Message, newRating: 'positive' | 'negative') => {
      if (!user || !activeChatId) return;

      const messageIndex = messages.findIndex(m => m.id === message.id);
      if (messageIndex < 1 || messages[messageIndex - 1].role !== 'user') {
        setError("O feedback só pode ser dado a uma resposta que segue diretamente uma pergunta do usuário.");
        return;
      }
      
      const userQuery = messages[messageIndex - 1].content;
      const assistantResponse = message.content;

      const currentRating = feedbacks[message.id];
      const finalRating = currentRating === newRating ? null : newRating;

      setFeedbacks(prev => {
          const newFeedbacks = { ...prev };
          if (finalRating) {
              newFeedbacks[message.id] = finalRating;
          } else {
              delete newFeedbacks[message.id];
          }
          return newFeedbacks;
      });

      try {
          await setFeedback(user.uid, activeChatId, message.id, finalRating, userQuery, assistantResponse);
      } catch (err: any) {
          console.error("Error saving feedback:", err);
          setError(`Erro ao salvar o feedback: ${'' + err.message}`);
          setFeedbacks(prev => {
              const revertedFeedbacks = { ...prev };
              if (currentRating) {
                  revertedFeedbacks[message.id] = currentRating;
              } else {
                  delete revertedFeedbacks[message.id];
              }
              return revertedFeedbacks;
          });
      }
  };

  const handleRegenerate = async (assistantMessageId: string) => {
    if (isLoading || regeneratingMessageId || !user || !activeChatId || !activeChat) return;

    const messageIndex = messages.findIndex(m => m.id === assistantMessageId);
    if (messageIndex < 1 || messages[messageIndex - 1].role !== 'user') {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível encontrar a pergunta original para regenerar a resposta.',
      });
      return;
    }

    const userMessage = messages[messageIndex - 1];
    const userQuery = userMessage.originalContent || userMessage.content;
    const originalSource = userMessage.source || 'rag';
    const newAssistantMessageId = crypto.randomUUID();

    setRegeneratingMessageId(assistantMessageId);
    setError(null);

    try {
      const result = await regenerateAnswer(
        userQuery,
        activeChat.attachedFiles,
        { 
          isStandardAnalysis: userMessage.isStandardAnalysis,
          source: originalSource === 'rag' || originalSource === 'web' ? originalSource : 'rag'
        },
        user.uid,
        activeChatId
      );

      if (result.error) {
        throw new Error(result.error);
      }
      
      const newAssistantMessage: Message = {
        id: newAssistantMessageId,
        role: 'assistant',
        content: result.summary!,
        source: result.source,
        sources: result.sources,
        promptTokenCount: result.promptTokenCount,
        candidatesTokenCount: result.candidatesTokenCount,
        latencyMs: result.latencyMs,
      };

      if (result.deidentifiedQuery) {
          const userMsg = messages[messageIndex - 1];
          userMsg.originalContent = userMsg.originalContent ?? userMsg.content;
          userMsg.content = result.deidentifiedQuery;
      }
      
      await logRegeneratedQuestion(
        user.uid,
        activeChatId,
        userQuery,
        result.summary!
      );

      if (result.searchFailed) {
        toast({ title: 'Regeneração Falhou', description: 'Não foi possível gerar uma nova resposta.' });
      }

      const updatedMessages = [
        ...messages.slice(0, messageIndex),
        newAssistantMessage
      ];

      setMessages(updatedMessages);

      if (feedbacks[assistantMessageId]) {
        setFeedbacks(prev => {
            const newFeedbacks = { ...prev };
            delete newFeedbacks[assistantMessageId];
            return newFeedbacks;
        });
      }
      
      await saveConversation(user.uid, updatedMessages, activeChatId);

    } catch (err: any) {
      setMessages(messages);
      const errorMessageContent = `Ocorreu um erro: ${'' + err.message}`;
      const errorMessage: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: errorMessageContent,
      };
      setMessages((prev) => [...prev, errorMessage]);
      setError(errorMessageContent);
    } finally {
      setRegeneratingMessageId(null);
    }
  };

  const handleOpenFeedbackDialog = (message: Message) => {
    const messageIndex = messages.findIndex(m => m.id === message.id);
     if (messageIndex < 1) return;
    const userMessage = messages[messageIndex - 1];

    if (userMessage.role !== 'user') {
        toast({
            variant: "destructive",
            title: "Erro de Feedback",
            description: "O feedback só pode ser dado a uma resposta do assistente que segue diretamente uma pergunta do usuário.",
        });
        return;
    }
    
    setFeedbackDetails({
        messageId: message.id,
        userQuery: userMessage.content,
        assistantResponse: message.content,
    });
    setFeedbackComment('');
    setIsFeedbackDialogOpen(true);
  };
  
  const handleSaveFeedbackComment = async (e: FormEvent) => {
    e.preventDefault();
    if (!feedbackDetails || !user || !activeChatId) return;

    try {
        const feedbackRef = doc(db, 'users', user.uid, 'feedbacks', feedbackDetails.messageId);
        await updateDoc(feedbackRef, {
            comment: feedbackComment
        });

        toast({
            title: "Feedback enviado!",
            description: "Obrigado por nos ajudar a melhorar.",
        });

    } catch (err: any) {
        console.error("Error saving feedback comment:", err);
        setError(`Erro ao salvar o comentário de feedback: ${'' + err.message}`);
    } finally {
        setIsFeedbackDialogOpen(false);
        setFeedbackDetails(null);
        setFeedbackComment('');
    }
  };

  const handleCopyToClipboard = async (text: string) => {
    if (!navigator.clipboard) {
        toast({
            variant: 'destructive',
            title: 'Falha ao copiar',
            description: 'A área de transferência não está disponível neste navegador ou a página não é segura (HTTPS).',
        });
        return;
    }

    try {
        await navigator.clipboard.writeText(text);
        toast({
            title: 'Copiado!',
            description: 'A resposta do assistente foi copiada para a área de transferência.',
        });
    } catch (err) {
        console.error('Falha ao copiar: ', err);
        toast({
            variant: 'destructive',
            title: 'Falha ao copiar',
            description: 'Não foi possível copiar o texto.',
        });
    }
};

  const handleReportLegalIssueRequest = (message: Message) => {
      setMessageToReport(message);
      setLegalReportComment('');
      setIsLegalReportDialogOpen(true);
  };

  const handleConfirmLegalReport = async (e: FormEvent) => {
    e.preventDefault();

    if (!messageToReport || !user || !activeChatId) {
        toast({
            variant: 'destructive',
            title: 'Erro',
            description: 'Não foi possível enviar o alerta. Faltam informações essenciais.',
        });
        return;
    }

    try {
        const messageIndex = messages.findIndex(m => m.id === messageToReport.id);
        if (messageIndex < 1) {
            throw new Error("Não foi possível encontrar a pergunta do usuário associada a esta resposta.");
        }
        const userQuery = messages[messageIndex - 1].content;

        await reportLegalIssue(
            user.uid,
            activeChatId,
            messageToReport.id,
            userQuery,
            messageToReport.content,
            legalReportComment
        );

        toast({
            title: "Alerta Enviado",
            description: "O problema jurídico foi reportado à equipe de conformidade com sucesso.",
        });

    } catch (err: any) {
        console.error("Error reporting legal issue:", err);
        toast({
            variant: 'destructive',
            title: 'Erro ao Enviar',
            description: `Não foi possível reportar o problema: ${'' + err.message}`,
        });
    } finally {
        setIsLegalReportDialogOpen(false);
        setMessageToReport(null);
        setLegalReportComment('');
    }
  };

  const onToggleGroup = (groupId: string) => {
    setExpandedGroups(prev => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const activeId = active.id.toString();

    if (activeId.startsWith('convo-')) {
      const conversationId = activeId.replace('convo-', '');
      const draggedConvo = conversations.find((c) => c.id === conversationId);
      if (draggedConvo) {
        setActiveDragItem(draggedConvo);
      }
    } else if (activeId.startsWith('group-')) {
      const groupId = activeId.replace('group-', '');
      const draggedGroup = groups.find((g) => g.id === groupId);
      if (draggedGroup) {
        setActiveDragItem(draggedGroup);
      }
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    setActiveDragItem(null);

    if (!over || active.id === over.id) {
        return;
    }

    const activeId = active.id as string;
    const overId = over.id as string;
    
    if (activeId.startsWith('group-') && overId.startsWith('group-')) {
        const activeGroupId = activeId.replace('group-', '');
        const overGroupId = overId.replace('group-', '');
        
        setGroups((items) => {
            const oldIndex = items.findIndex((item) => item.id === activeGroupId);
            const newIndex = items.findIndex((item) => item.id === overGroupId);
            if (oldIndex !== -1 && newIndex !== -1) {
                return arrayMove(items, oldIndex, newIndex);
            }
            return items;
        });
        return;
    }

    if (activeId.startsWith('convo-')) {
        const conversationId = activeId.replace('convo-', '');
        const conversation = conversations.find((c) => c.id === conversationId);
        if (!conversation) return;

        if (overId.startsWith('group-')) {
            const groupId = overId.replace('group-', '');
            if (conversation.groupId !== groupId) {
                await handleMoveConversation(conversationId, groupId);
            }
            return;
        }
        
        if (overId === 'ungrouped-area') {
            if (conversation.groupId !== null) {
                await handleMoveConversation(conversationId, null);
            }
            return;
        }

        if (overId.startsWith('convo-')) {
            const overConversationId = overId.replace('convo-', '');
            
            const activeIndex = conversations.findIndex(c => c.id === conversationId);
            const overIndex = conversations.findIndex(c => c.id === overConversationId);

            if (activeIndex === -1 || overIndex === -1) return;

            if (conversations[activeIndex].groupId === conversations[overIndex].groupId) {
                setConversations(items => arrayMove(items, activeIndex, overIndex));
            } else {
                const targetGroupId = conversations[overIndex].groupId || null;
                await handleMoveConversation(conversationId, targetGroupId);
            }
        }
    }
  };

  const handleRemoveFile = async (fileId: string) => {
    if (!user || !activeChatId || !activeChat) {
        toast({ variant: 'destructive', title: 'Erro', description: 'Não há uma conversa ativa para remover o arquivo.' });
        return;
    }

    const fileToRemove = activeChat.attachedFiles.find(f => f.id === fileId);
    if (!fileToRemove) return;

    try {
        const updatedFiles = await removeFileFromConversation(user.uid, activeChatId, fileId);
        setActiveChat(prev => prev ? { ...prev, attachedFiles: updatedFiles } : null);
        toast({ title: 'Arquivo removido', description: `"${fileToRemove.fileName}" foi removido do contexto da conversa.` });
    } catch (error: any) {
        toast({ variant: 'destructive', title: 'Erro ao remover arquivo', description: error.message });
    }
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
        setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget as Node)) {
        return;
    }
    setIsDraggingOver(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      setSelectedFiles(prev => [...prev, ...droppedFiles].filter(
        (file, index, self) => index === self.findIndex(f => f.name === file.name && f.size === file.size)
      ));
      e.dataTransfer.clearData();
    }
  };
  
    const handleAcceptTerms = async () => {
        if (!user) return;
        try {
            const userDocRef = doc(db, 'users', user.uid);
            await updateDoc(userDocRef, { termsAccepted: true });
            setShowTermsDialog(false);
            
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists() && userDocSnap.data()?.hasCompletedOnboarding !== true) {
                // Use a timeout to ensure the UI has rendered before starting the tour
                setTimeout(() => setShowOnboarding(true), 150);
            }
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Erro',
                description: `Não foi possível salvar sua preferência: ${'' + error.message}`,
            });
            await handleSignOut();
        }
    };
    
    const handleDeclineTerms = async () => {
        setShowTermsDialog(false);
        await handleSignOut();
    };
    
    const handleFinishOnboarding = async () => {
        if (!user) return;
        try {
            await setUserOnboardingStatus(user.uid, true);
            setShowOnboarding(false);
        } catch (error: any) {
            toast({
                variant: 'destructive',
                title: 'Erro',
                description: 'Não foi possível salvar o progresso do onboarding.',
            });
        }
    };

    const handleAnalysisResult = async (prompt: string, fileNames?: string[]) => {
      if (!user) {
        //console.log('🔍 DEBUG ChatPage.tsx- Usuário não encontrado, retornando');
        return;
      }
      
      try {
        //console.log('🔍 DEBUG ChatPage.tsx- Criando mensagens...');
          // Criar mensagem do usuário
          const userMessage: Message = {
              id: crypto.randomUUID(),
              role: 'user',
              content: 'Análise de relatório XP',
              fileNames: fileNames || [],
              source: 'gemini',
              sources: [],
              promptTokenCount: null,
              candidatesTokenCount: null,
              latencyMs: null,
              originalContent: null,
              isStandardAnalysis: true
          };
          
          // Criar mensagem do assistente
          const assistantMessage: Message = {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: prompt,
              fileNames: fileNames || [],
              source: 'gemini',
              sources: [],
              promptTokenCount: null,
              candidatesTokenCount: null,
              latencyMs: null,
              originalContent: null,
              isStandardAnalysis: true
          };
          
          // Adicionar ambas as mensagens ao chat
          const newMessages = [...messages, userMessage, assistantMessage];
          //console.log('🔍 DEBUG ChatPage.tsx- newMessages:', newMessages);
          setMessages(newMessages);
          
          // Salvar no Firestore
          if (activeChatId) {
            // Validar mensagens antes de salvar
            const validMessages = [userMessage, assistantMessage].filter(msg => 
                msg && 
                msg.content && 
                msg.content.trim() !== '' &&
                msg.id &&
                msg.role
            );
            
            if (validMessages.length > 0) {
                await updateDoc(doc(db, 'users', user.uid, 'chats', activeChatId), {
                    messages: arrayUnion(...validMessages),
                    updatedAt: serverTimestamp()
                });
            }
        }
            else {
              // Novo chat - usar saveConversation
              const newChatId = await saveConversation(user.uid, newMessages);
              const newFullChat = await getFullConversation(user.uid, newChatId);
                setActiveChat(newFullChat);
                await fetchSidebarData();
          }
          
          // Fechar o dialog
          setIsPromptBuilderOpen(false);
          
          // Scroll para a última mensagem
          setTimeout(() => {
              messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
          
      } catch (err: any) {
          console.error('Erro ao salvar mensagem:', err);
          setError('Erro ao salvar a conversa no histórico');
      }
  };

// (groupResultsByBatch foi movida para o topo do arquivo, antes de getFullConversation)

const handleUltraBatchResults = async (results: any[], totalFiles: number, jobId: string, estimatedTimeMinutes?: number, chatIdToUpdate?: string) => {
  if (!user) return;

  console.log('🔍 DEBUG - handleUltraBatchResults chamado:',
    { 
    resultsLength: results.length, 
    jobId, 
    estimatedTimeMinutes,
    currentMessagesLength: messages.length 
  });

  // ⚠️ VERIFICAR se já existe mensagem ultra batch
  setMessages(prevMessages => {
    const existingUltraBatchMessage = prevMessages.find(msg => 
      msg.ultraBatchJobId === jobId && msg.role === 'assistant'
    );

  if (existingUltraBatchMessage) {
      // ============================================
      // CENÁRIO 1: ATUALIZAR mensagem existente
      // ============================================
      //console.log('🔍 DEBUG - Atualizando mensagem existente');

    // ---- NOVA LÓGICA DE VERIFICAÇÃO ----
    // 1. Contar quantos resultados já temos na tela
    const existingBatches = existingUltraBatchMessage.ultraBatchBatches || [];
    const existingResultsCount = existingBatches.reduce((acc, batch) => acc + batch.files.length, 0);

    // 2. Contar quantos resultados a API acabou de nos enviar
    const newResultsCount = results.length;

    // 3. Se a contagem for a mesma, não há nada de novo para mostrar.
    //    Então, retornamos o array de mensagens *original* sem tocar nele.
    //    Isso diz ao React: "Não mude nada", e o "pisca-pisca" é evitado.
    if (newResultsCount === existingResultsCount) {
        //console.log('🔍 DEBUG - Sem novos resultados, pulando atualização de estado.');
        return prevMessages; // <-- Ponto-chave da correção!
    }
    // ---- FIM DA NOVA LÓGICA ----

    // Se o código chegou até aqui, significa que HÁ novos resultados.
    // Agora, fazemos o que o código já fazia: criar um novo array atualizado.
    // Agrupar resultados em lotes
    const batches = groupResultsByBatch(results, 5);
    const updatedContent = `# Análise Ultra Lote - ${totalFiles} arquivos\n\n${batches.map(batch => 
      `## 📁 Lote ${batch.batchNumber} (${batch.files.length} arquivos)\n\n${batch.files.map((file, index) => {
        `### Arquivo ${index + 1}: ${file.fileName}\n\n${file.content}`;
    }
      ).join('\n\n---\n\n')}`
    ).join('\n\n---\n\n')}`;

    const updatedMessages = prevMessages.map(msg => {
      if (msg.ultraBatchJobId === jobId && msg.role === 'assistant') {
        return {
          ...msg,
          content: updatedContent,
          ultraBatchProgress: { current: results.length, total: totalFiles },
          ultraBatchBatches: batches,
          ultraBatchEstimatedTimeMinutes: estimatedTimeMinutes
        };
      }
      if (msg.ultraBatchJobId === jobId && msg.role === 'user') {
        return {
          ...msg,
          ultraBatchProgress: { current: results.length, total: totalFiles }
        };
      }
      return msg;
    });
    
    // 🔗 PADRÃO DE PONTEIRO: NÃO salvar batches completos no Firestore
    // Os resultados já estão na coleção ultra_batch_jobs/{jobId}/results
    // Apenas mantemos o estado local atualizado para a UI
    //console.log('🔍 DEBUG - Estado atualizado localmente (sem salvar batches no chat)');
    
    // Retorna o novo estado para o React
    return updatedMessages;

} else {
      // ============================================
      // CENÁRIO 2: PRIMEIRA CHAMADA - Criar novas mensagens
      // ============================================
  //console.log('🔍 DEBUG - Criando novas mensagens para Ultra Lote');

    const batches = groupResultsByBatch(results, 5);
    
    // Criar mensagem do usuário
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: `Análise Ultra Lote - ${totalFiles} arquivos`,
      fileNames: results.map(r => r.fileName || r.file_name).filter(Boolean),
      source: 'ultra_batch',
      ultraBatchJobId: jobId,
      ultraBatchTotal: totalFiles,
      ultraBatchProgress: { current: results.length || 0, total: totalFiles }
    };

      // Criar mensagem do assistente - SEMPRE com estrutura de progresso
    let assistantContent = `# Análise Ultra Lote - ${totalFiles} arquivos\n\n`;
    
    if (batches.length > 0) {
      // Se há resultados, mostrar lotes
      assistantContent += batches.map(batch => 
        `## 📁 Lote ${batch.batchNumber} (${batch.files.length} arquivos)\n\n${batch.files.map((file, index) => 
          `### Arquivo ${index + 1}: ${file.fileName}\n\n${file.content}`
        ).join('\n\n---\n\n')}`
      ).join('\n\n---\n\n');
    } else {
      // Se não há resultados ainda, mostrar mensagem de processamento
      assistantContent += `🔄 **Processando ${totalFiles} arquivos...**\n\n`;
      if (estimatedTimeMinutes) {
        assistantContent += `⏱️ **Tempo estimado:** ${estimatedTimeMinutes} minutos\n\n`;
      }
      assistantContent += `Os resultados aparecerão aqui conforme forem sendo processados.`;
    }
    
    // Criar mensagem do assistente com resultados em lotes
    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: assistantContent,
      fileNames: results.map(r => r.fileName || r.file_name).filter(Boolean),
      source: 'ultra_batch',
      ultraBatchJobId: jobId,
      ultraBatchTotal: totalFiles,
      ultraBatchProgress: { current: results.length || 0, total: totalFiles },
      ultraBatchBatches: batches,
      ultraBatchEstimatedTimeMinutes: estimatedTimeMinutes
    };
    
    // 🔗 REFATORADO: NÃO salvamos mais no Firestore aqui
    // O chat já foi criado/atualizado em handleStartUltraBatch
    // Apenas retornamos o novo estado local para a UI
    const newMessages = [...prevMessages, userMessage, assistantMessage];

    // 🔗 CORREÇÃO: Salvar os placeholders no Firestore para que o histórico carregue corretamente
    if (chatIdToUpdate) {
      saveConversation(user.uid, newMessages, chatIdToUpdate).catch(err => {
        //console.error('Erro ao salvar mensagens placeholder:', err);
      });
    }
    
    //console.log('🔍 DEBUG - Mensagens de placeholder criadas (apenas estado local)');
    return newMessages;
  }
}); // ✅ AQUI fecha o setMessages corretamente!

// ✅ Setar o jobId FORA do setMessages
if (!messages.find(msg => msg.ultraBatchJobId === jobId)) {
  setUltraBatchJobId(jobId);
}
};

// 🔗 NOVA FUNÇÃO: Orquestrar o início do ultra batch job
// Garante que o chat exista antes de criar o job no backend
// 🔗 NOVA FUNÇÃO: Orquestrar o início do ultra batch job com Signed URLs
// Garante que o chat exista antes de criar o job no backend
// Faz upload direto para GCS usando Signed URLs (bypass do Next.js)
const handleStartUltraBatch = async (files: File[]) => {
  if (!user) {
    setError('Usuário não autenticado');
    return;
  }

  if (files.length === 0) {
    toast({
      title: 'Erro',
      description: 'Nenhum arquivo selecionado',
      variant: 'destructive',
    });
    return;
  }

  setIsLoading(true);
  let chatId = activeChatId;

  try {
    // 1️⃣ Se for um novo chat, criar o documento primeiro
    if (!chatId) {
      console.log('📦 [UPLOAD] Criando novo chat antes de iniciar ultra batch...');
      
      const tempTitle = `Análise de ${files.length} relatórios`;
      const userMessage: Message = { 
        id: crypto.randomUUID(), 
        role: 'user', 
        content: tempTitle 
      };
      
      // Criar o chat e obter o ID
      const newId = await saveConversation(user.uid, [userMessage], null, { 
        newChatTitle: tempTitle 
      });
      chatId = newId;
      
      console.log('✅ [UPLOAD] Novo chat criado:', chatId);
      
      // Atualizar o estado da UI para refletir o novo chat
      const newFullChat = await getFullConversation(user.uid, newId);
      setActiveChat(newFullChat);
      await fetchSidebarData();
    }

    // 2️⃣ Solicitar Signed URLs ao backend
    console.log('🔗 [UPLOAD] Solicitando Signed URLs para', files.length, 'arquivos...');
    
    const fileNames = files.map(f => f.name);
    const { batch_id, upload_urls } = await generateUploadUrls(fileNames, user.uid, chatId);
    
    console.log('✅ [UPLOAD] Signed URLs recebidas, batch_id:', batch_id);
    console.log(`✅ [UPLOAD] ${upload_urls.length} URLs geradas com sucesso`);

    // 3️⃣ Fazer upload paralelo dos arquivos para GCS usando Signed URLs
    console.log('📤 [UPLOAD] Iniciando upload paralelo para GCS...');
    
    let uploadSuccessCount = 0;
    let uploadErrorCount = 0;
    const uploadErrors: string[] = [];

    await Promise.all(
      upload_urls.map(async ({ fileName, signedUrl, storagePath }) => {
        try {
          // Encontrar o arquivo correspondente
          const file = files.find(f => f.name === fileName);
          if (!file) {
            throw new Error(`Arquivo não encontrado: ${fileName}`);
          }

          // Fazer upload direto para GCS usando Signed URL
          console.log(`📤 [UPLOAD] Iniciando upload de ${fileName}...`);
          console.log(`📤 [UPLOAD] URL: ${signedUrl.substring(0, 150)}...`);
          console.log(`📤 [UPLOAD] Tamanho do arquivo: ${file.size} bytes`);
          console.log(`📤 [UPLOAD] Tipo do arquivo: ${file.type || 'não especificado'}`);

          const response = await fetch(signedUrl, {
            method: 'PUT',
            body: file,
          });

          console.log(`📤 [UPLOAD] Response status: ${response.status} ${response.statusText}`);
          console.log(`📤 [UPLOAD] Response headers:`, [...response.headers.entries()]);


          if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            console.error(`❌ [UPLOAD] Response error:`, errorText);
            throw new Error(`Upload falhou para ${fileName}: ${response.status} ${response.statusText}`);
          }

          uploadSuccessCount++;
          console.log(`✅ [UPLOAD] Upload concluído para: ${fileName}`);
        } catch (error: any) {
          uploadErrorCount++;
          const errorMsg = `Erro no upload de ${fileName}: ${error.message}`;
          uploadErrors.push(errorMsg);
          console.error(`❌ [UPLOAD] ${errorMsg}`);
        }
      })
    );

    // 4️⃣ Validar que todos os uploads foram bem-sucedidos
    if (uploadErrorCount > 0) {
      const errorMessage = `${uploadErrorCount} arquivo(s) falharam no upload:\n${uploadErrors.join('\n')}`;
      console.error('❌ [UPLOAD] Erros no upload:', errorMessage);
      
      toast({
        title: 'Erro no Upload',
        description: `${uploadErrorCount} arquivo(s) falharam no upload. Verifique o console para detalhes.`,
        variant: 'destructive',
      });
      
      // Continuar mesmo com erros? Ou parar aqui?
      // Decisão: Parar se TODOS falharam, continuar se alguns falharam
      if (uploadSuccessCount === 0) {
        throw new Error('Todos os uploads falharam. Não é possível continuar.');
      }
    }

    console.log(`✅ [UPLOAD] Upload concluído: ${uploadSuccessCount} sucessos, ${uploadErrorCount} erros`);

    // 5️⃣ Notificar backend que uploads concluíram (iniciar processamento)
    console.log('🚀 [UPLOAD] Notificando backend para iniciar processamento, batch_id:', batch_id);
    
    const result = await ultraBatchAnalyzeReports(batch_id, user.uid, chatId);
    
    if (!result.success) {
      throw new Error(result.error || 'Erro ao criar job de ultra lote');
    }

    console.log('✅ [UPLOAD] Job criado com sucesso:', result.job_id);

    // 6️⃣ Mostrar toast de confirmação
    toast({
      title: 'Processamento Iniciado',
      description: `Analisando ${result.total_files} relatórios. Tempo estimado: ${result.estimated_time_minutes} minutos.`,
    });

    // 7️⃣ Iniciar a UI e o polling
    // Chamamos handleUltraBatchResults que criará as mensagens de placeholder
    // e iniciará o polling automático
    await handleUltraBatchResults([], result.total_files, result.job_id, result.estimated_time_minutes, chatId);

  } catch (err: any) {
    console.error('❌ [UPLOAD] Erro ao iniciar ultra batch:', err);
    setError(`Erro ao iniciar análise: ${err.message}`);
    toast({
      title: 'Erro',
      description: err.message || 'Não foi possível iniciar a análise',
      variant: 'destructive',
    });
  } finally {
    setIsLoading(false);
  }
};

  const [ultraBatchJobId, setUltraBatchJobId] = useState<string | null>(null);

  // Polling contínuo para ultra batch
  useEffect(() => {
    if (!ultraBatchJobId) return;
    
    let intervalId: NodeJS.Timeout;
    const pythonServiceUrl = process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL || 'http://localhost:8000';
    
    const pollJobStatus = async () => {
      try {
        const response = await fetch(`${pythonServiceUrl}/api/report/ultra-batch-status/${ultraBatchJobId}`);
        const data = await response.json();
        
        if (data.success && data.progress) {
          handleUltraBatchResults(
            data.results || [],
            data.progress.totalFiles, 
            ultraBatchJobId, 
            data.estimated_time_minutes
          );
        }
        
        if (data.status === 'completed' || data.status === 'failed' || (data.progress && data.progress.processedFiles >= data.progress.totalFiles)) {
          if (intervalId) {
            clearInterval(intervalId);
          }
          setUltraBatchJobId(null);
        }
      } catch (error) {
        console.error('Erro ao consultar status do job:', error);
      }
    };
    
    intervalId = setInterval(pollJobStatus, 20000);
    pollJobStatus();
    
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [ultraBatchJobId]);


  const handleStartTour = () => {
      setIsFaqDialogOpen(false);
      setTimeout(() => {
          setShowOnboarding(true);
      }, 150);
  };

  const createNewChat = async (userId: string, title: string): Promise<string> => {
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: title,
    };
    const newId = await saveConversation(userId, [userMessage], null, { newChatTitle: title });
    const newFullChat = await getFullConversation(userId, newId);
    setActiveChat(newFullChat);
    await fetchSidebarData();
    return newId;
  };

  if (authLoading || isCheckingTerms) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <p className="text-lg text-muted-foreground">Carregando Bob 1.0...</p>
      </div>
    );
  }
  
  if (error && !isSidebarLoading && conversations.length === 0) {
    return (
        <div className="flex h-screen w-full items-center justify-center bg-background text-center">
            <div>
                <h1 className="text-2xl font-bold text-destructive">Erro Crítico</h1>
                <p className="text-muted-foreground">{error}</p>
                <Button onClick={() => window.location.reload()} className="mt-4">
                    Recarregar a Página
                </Button>
            </div>
        </div>
    );
  }

  const isAuthenticated = !!user;
  const userName = user?.displayName ?? 'Usuário';
  const userInitials =
    userName
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase() ?? 'U';

  return (
    <SidebarProvider>
        <div 
            className="flex h-screen w-full bg-background text-foreground relative"
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
        {isDraggingOver && <FileDropOverlay />}

        <Dialog
            open={isNewGroupDialogOpen}
            onOpenChange={setIsNewGroupDialogOpen}
        >
            <DialogContent className="sm:max-w-[425px]">
            <form onSubmit={handleCreateGroup}>
                <DialogHeader>
                    <DialogTitle>Criar Novo Projeto</DialogTitle>
                    <DialogDescription>
                    Dê um nome ao seu novo projeto de conversas.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                <Input
                    id="name"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="Ex: Projetos Q4"
                />
                </div>
                <DialogFooter>
                <Button type="submit" disabled={!newGroupName.trim() || isLoading}>
                    Criar Projeto
                </Button>
                </DialogFooter>
            </form>
            </DialogContent>
        </Dialog>

        <Dialog open={isRenameDialogOpen} onOpenChange={(open) => {
            if (!open) {
                setItemToRename(null);
                setNewItemName('');
            }
            setIsRenameDialogOpen(open);
        }}>
            <DialogContent className="sm:max-w-[425px]">
                <form onSubmit={handleRenameSubmit}>
                    <DialogHeader>
                        <DialogTitle>Renomear {itemToRename?.type === 'group' ? 'Projeto' : 'Conversa'}</DialogTitle>
                        <DialogDescription>
                            Digite o novo nome para "{itemToRename?.currentName}".
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                    <Input
                        id="newName"
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                        placeholder="Novo nome"
                    />
                    </div>
                    <DialogFooter>
                    <Button type="submit" disabled={!newItemName.trim() || isLoading}>
                        Salvar
                    </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
        
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Esta ação não pode ser desfeita. O projeto será excluído e todas as conversas dentro dele serão movidas para fora do grupo.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setGroupToDelete(null)}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteGroupConfirm} className={buttonVariants({ variant: "destructive" })}>
                        Excluir
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={isDeleteConvoDialogOpen} onOpenChange={setIsDeleteConvoDialogOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Excluir conversa?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Esta ação não pode ser desfeita. A conversa será excluída permanentemente.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setConvoToDelete(null)}>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteConvoConfirm} className={buttonVariants({ variant: "destructive" })}>
                        Excluir
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
        
        <Dialog open={isLegalReportDialogOpen} onOpenChange={(open) => {
            if (!open) {
                setMessageToReport(null);
                setLegalReportComment('');
            }
            setIsLegalReportDialogOpen(open);
        }}>
            <DialogContent className="sm:max-w-[425px]">
                <form onSubmit={handleConfirmLegalReport}>
                    <DialogHeader>
                        <DialogTitle>Informar Problema Jurídico</DialogTitle>
                        <DialogDescription>
                            Descreva o problema jurídico que você identificou nesta resposta. Sua contribuição é confidencial e será enviada à equipe de conformidade.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <Textarea
                            placeholder="Opcional: Descreva o problema aqui..."
                            value={legalReportComment}
                            onChange={(e) => setLegalReportComment(e.target.value)}
                            rows={4}
                        />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => setIsLegalReportDialogOpen(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" variant="destructive">
                            Enviar Alerta
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>


        <Dialog open={isFeedbackDialogOpen} onOpenChange={setIsFeedbackDialogOpen}>
            <DialogContent className="sm:max-w-[425px]">
                <form onSubmit={handleSaveFeedbackComment}>
                    <DialogHeader>
                        <DialogTitle>Fornecer Feedback</DialogTitle>
                        <DialogDescription>
                            Sua opinião é importante. Por favor, descreva por que a resposta não foi útil.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <Textarea
                            placeholder="Escreva seu comentário aqui..."
                            value={feedbackComment}
                            onChange={(e) => setFeedbackComment(e.target.value)}
                            rows={4}
                        />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={() => setIsFeedbackDialogOpen(false)}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={!feedbackComment.trim()}>
                            Enviar Feedback
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
        
        <FaqDialog 
            open={isFaqDialogOpen} 
            onOpenChange={setIsFaqDialogOpen} 
            onStartTour={handleStartTour}
        />
        
        <AlertDialog open={showTermsDialog}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Termos de Uso e Política de Privacidade</AlertDialogTitle>
                    <AlertDialogDescription>
                        Para continuar, você deve concordar com os Termos de Uso e a Política de Privacidade do Bob. Ao aceitar, você reconhece que o sistema pode cometer erros e que as informações devem ser verificadas.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="flex items-center space-x-2 my-4">
                    <Checkbox
                        id="terms"
                        checked={termsAccepted}
                        onCheckedChange={(checked) => setTermsAccepted(!!checked)}
                    />
                    <Label htmlFor="terms">Eu li e aceito os Termos de Uso</Label>
                </div>
                <AlertDialogFooter>
                    <AlertDialogCancel onClick={handleDeclineTerms}>Recusar e Sair</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleAcceptTerms}
                        disabled={!termsAccepted}
                    >
                        Continuar
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>

        {showOnboarding && <OnboardingTour onFinish={handleFinishOnboarding} />}

        <PromptBuilderDialog
            open={isPromptBuilderOpen}
            onOpenChange={setIsPromptBuilderOpen}
            onAnalysisResult={handleAnalysisResult}
            onBatchSubmit={handleBatchSubmit}
            onStartUltraBatch={handleStartUltraBatch} // 🔗 REFATORADO: Usar nova função de orquestração
            activeChatId={activeChatId} // 🔗 PADRÃO DE PONTEIRO: Passar activeChatId
        />
        <UpdateNotificationManager />

        <MeetingInsightsDialog 
          isOpen={isMeetingInsightsOpen}
          onClose={() => setIsMeetingInsightsOpen(false)}
          onMeetingAnalyzed={handleMeetingAnalyzed}
        />

        {isAuthenticated && !showTermsDialog && (
        <>
            <Sidebar>
                <ChatSidebar
                    conversations={conversations}
                    groups={groups}
                    activeChatId={activeChatId}
                    isSidebarLoading={isSidebarLoading}
                    expandedGroups={expandedGroups}
                    onNewChat={handleNewChat}
                    onSelectConversation={handleSelectConversation}
                    onMoveConversation={handleMoveConversation}
                    onRenameRequest={handleRenameRequest}
                    onDeleteConvoRequest={handleDeleteConvoRequest}
                    setIsNewGroupDialogOpen={setIsNewGroupDialogOpen}
                    onDeleteGroupRequest={handleDeleteRequest}
                    onToggleGroup={onToggleGroup}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    activeDragItem={activeDragItem}
                    onOpenFaqDialog={() => setIsFaqDialogOpen(true)}
                    isAuthenticated={isAuthenticated}
                    handleSignOut={handleSignOut}
                    user={user}
                />
            </Sidebar>

            <SidebarInset>
                <main className="flex h-full flex-1 flex-col bg-background">
                    <ChatMessageArea
                        messages={messages}
                        isLoading={isLoading}
                        error={error}
                        user={user}
                        userName={userName}
                        userInitials={userInitials}
                        lastFailedQuery={null}
                        feedbacks={feedbacks}
                        regeneratingMessageId={regeneratingMessageId}
                        messagesEndRef={messagesEndRef}
                        onFeedback={handleFeedback}
                        onRegenerate={handleRegenerate}
                        onCopyToClipboard={handleCopyToClipboard}
                        onReportLegalIssueRequest={handleReportLegalIssueRequest}
                        onOpenFeedbackDialog={handleOpenFeedbackDialog}
                        onWebSearch={() => {}}
                        onSuggestionClick={handleSuggestionClick}
                        activeChat={activeChat}
                        onRemoveFile={handleRemoveFile}
                    />

                    <ChatInputForm
                        input={input}
                        setInput={setInput}
                        handleSubmit={handleSubmit}
                        isLoading={isLoading}
                        inputRef={inputRef}
                        selectedFiles={selectedFiles}
                        setSelectedFiles={setSelectedFiles}
                        searchSource={searchSource}
                        setSearchSource={setSearchSource}
                        onSuggestionClick={handleSuggestionClick}
                    />
                </main>
            </SidebarInset>
        </>
        )}
        </div>
    </SidebarProvider>
  );
}