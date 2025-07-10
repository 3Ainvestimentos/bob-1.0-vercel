
'use client';

import {
  ChatInputForm
} from '@/components/chat/ChatInputForm';
import {
  ChatMessageArea
} from '@/components/chat/ChatMessageArea';
import { ChatSidebar } from '@/components/chat/ChatSidebar';
import {
  askAssistant,
  generateSuggestedQuestions,
  generateTitleForConversation,
  regenerateAnswer
} from '@/app/actions';
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
import { auth, db } from '@/lib/firebase';
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


// ---- Data Types ----
export interface Group {
  id: string;
  name: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  fileName?: string | null;
  promptTokenCount?: number | null;
  candidatesTokenCount?: number | null;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  messages: Message[];
  groupId?: string | null;
  totalTokens?: number;
  fileContext?: string | null;
}

export type ConversationSidebarItem = Omit<Conversation, 'messages' | 'totalTokens' | 'fileContext'>;

interface FeedbackDetails {
    messageId: string;
    userQuery: string;
    assistantResponse: string;
}


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


async function logRegeneratedQuestion(
    userId: string,
    chatId: string,
    originalQuery: string,
    originalResponse: string,
    newResponse: string
) {
    if (!userId || !chatId) {
        console.error("User ID or Chat ID is missing, cannot log regenerated answer.");
        return;
    };
    try {
        const regeneratedRef = collection(db, 'users', userId, 'regenerated_answers');
        await addDoc(regeneratedRef, {
            userId,
            chatId,
            originalQuery,
            originalResponse,
            newResponse,
            regeneratedAt: serverTimestamp(),
        });
    } catch (error) {
        console.error("Error logging regenerated question to Firestore:", error);
    }
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

async function getFullConversation(userId: string, chatId: string): Promise<Conversation | null> {
    try {
        const chatRef = doc(db, 'users', userId, 'chats', chatId);
        const chatSnap = await getDoc(chatRef);

        if (chatSnap.exists()) {
            const data = chatSnap.data();
            const firestoreTimestamp = data.createdAt as Timestamp;
            const messagesWithIds = (data.messages || []).map((m: any) => ({
                ...m,
                id: m.id || crypto.randomUUID(),
            }));
            return {
                id: chatSnap.id,
                title: data.title,
                createdAt: firestoreTimestamp.toDate().toISOString(),
                messages: messagesWithIds,
                groupId: data.groupId || null,
                totalTokens: data.totalTokens || 0,
                fileContext: data.fileContext || null,
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
    fileContext?: string | null;
  } = {}
): Promise<string> {
  if (!userId) throw new Error('User ID is required.');
  if (!messages || messages.length === 0)
    throw new Error('Messages are required.');

  const conversationsRef = collection(db, 'users', userId, 'chats');

  const sanitizedMessages = messages.map(msg => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    fileName: msg.fileName ?? null,
    promptTokenCount: msg.promptTokenCount ?? null,
    candidatesTokenCount: msg.candidatesTokenCount ?? null,
  }));

  const totalTokens = sanitizedMessages.reduce((acc, msg) => {
    const promptTokens = msg.promptTokenCount || 0;
    const candidateTokens = msg.candidatesTokenCount || 0;
    return acc + promptTokens + candidateTokens;
  }, 0);

  if (chatId) {
    const chatRef = doc(conversationsRef, chatId);
    const updatePayload: any = { 
      messages: sanitizedMessages,
      totalTokens 
    };
    if (options.fileContext !== undefined) {
      updatePayload.fileContext = options.fileContext;
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
        fileContext: options.fileContext ?? null,
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
            console.warn(`Conversation with ID ${chatId} not found to archive.`);
        }
    } catch (error) {
        console.error("Error archiving and deleting conversation:", error);
        throw new Error("Não foi possível excluir a conversa. Tente novamente.");
    }
}


function ChatPageContent() {
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
  const [lastFailedQuery, setLastFailedQuery] = useState<string | null>(null);

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

  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isSuggestionsLoading, setIsSuggestionsLoading] = useState(false);
  const [regeneratingMessageId, setRegeneratingMessageId] = useState<string | null>(null);

  const [isLegalReportDialogOpen, setIsLegalReportDialogOpen] = useState(false);
  const [messageToReport, setMessageToReport] = useState<Message | null>(null);
  const [legalReportComment, setLegalReportComment] = useState('');

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [activeDragItem, setActiveDragItem] = useState<ConversationSidebarItem | Group | null>(null);
  const [isFaqDialogOpen, setIsFaqDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

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
      setExpandedGroups(userGroups.reduce((acc, group) => {
          acc[group.id] = true;
          return acc;
      }, {} as Record<string, boolean>));
    } catch (err: any) {
      setError(`Erro ao carregar o histórico: ${err.message}`);
    } finally {
      setIsSidebarLoading(false);
    }
  }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [isLoading, activeChatId]);

  const handleNewChat = () => {
    setActiveChat(null);
    setMessages([]);
    setInput('');
    setError(null);
    setLastFailedQuery(null);
    setFeedbacks({});
    setSuggestions([]);
    setIsSuggestionsLoading(false);
    setSelectedFile(null);
  };

  useEffect(() => {
    if (user) {
      fetchSidebarData();
    } else {
      setConversations([]);
      setGroups([]);
      handleNewChat();
    }
  }, [user, fetchSidebarData]);

  const handleSignOut = async () => {
    await signOut(auth);
    router.push('/');
  };

  const handleSelectConversation = async (chatId: string) => {
    if (isLoading || !user) return;
    setIsLoading(true);
    setError(null);
    setLastFailedQuery(null);
    setMessages([]); 
    setFeedbacks({});
    setSuggestions([]);
    setIsSuggestionsLoading(false);
    setSelectedFile(null);
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
      setError(`Erro ao carregar a conversa: ${err.message}`);
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  };

  const readFileAsDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const submitQuery = async (query: string, file: File | null) => {
    if (!query.trim() && !file) return;
    if (isLoading || !user) return;

    const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: query,
        fileName: file?.name,
    };
    const newMessages = [...messages, userMessage];

    setMessages(newMessages);
    setInput('');
    setSelectedFile(null);
    setIsLoading(true);
    setError(null);
    setLastFailedQuery(null);
    setSuggestions([]);
    setIsSuggestionsLoading(false);

    let currentChatId = activeChatId;
    let fileDataUri: string | null = null;
    let fileContextForRequest: string | null = activeChat?.fileContext ?? null;

    try {
        if (file) {
            fileDataUri = await readFileAsDataURL(file);
            // Se um novo arquivo for enviado, o contexto antigo é sobrescrito na requisição.
            // A persistência acontecerá depois da resposta da IA.
            fileContextForRequest = null; 
        }

        const finalQuery = query || `Analise o arquivo ${file?.name || 'anexado'}.`;

        const assistantResponse = await askAssistant(
            finalQuery,
            {
                fileDataUri,
                fileContext: fileContextForRequest,
            },
            user.uid
        );

        const assistantMessage: Message = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: assistantResponse.summary,
            promptTokenCount: assistantResponse.promptTokenCount,
            candidatesTokenCount: assistantResponse.candidatesTokenCount,
        };

        if (assistantResponse.searchFailed) {
            setLastFailedQuery(finalQuery);
        }

        const finalMessages = [...newMessages, assistantMessage];
        setMessages(finalMessages);

        const newFileContext = fileDataUri ? assistantResponse.deidentifiedFileContent : activeChat?.fileContext;

        if (!currentChatId) {
            const newTitle = await generateTitleForConversation(finalQuery, file?.name);
            const newId = await saveConversation(
                user.uid,
                finalMessages,
                null,
                {
                    newChatTitle: newTitle,
                    fileContext: newFileContext,
                }
            );
            currentChatId = newId;
            const newFullChat = await getFullConversation(user.uid, newId);
            setActiveChat(newFullChat);
        } else {
            await saveConversation(
                user.uid,
                finalMessages,
                currentChatId,
                {
                    fileContext: newFileContext
                }
            );
            // Atualiza o estado do chat ativo com o novo contexto do arquivo, se houver.
            if (newFileContext !== activeChat?.fileContext) {
                 setActiveChat(prev => prev ? { ...prev, fileContext: newFileContext } : null);
            }
        }


        const fetchSuggestions = async () => {
            setIsSuggestionsLoading(true);
            try {
                const newSuggestions = await generateSuggestedQuestions(finalQuery, assistantResponse.summary);
                setSuggestions(newSuggestions);
            } catch (err) {
                console.error("Failed to fetch suggestions", err);
                setSuggestions([]);
            } finally {
                setIsSuggestionsLoading(false);
            }
        };
        fetchSuggestions();
      
        await fetchSidebarData();

    } catch (err: any) {
        const errorMessageContent = `Ocorreu um erro: ${err.message}`;
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
    submitQuery(suggestion, null);
  };
  
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    submitQuery(input, selectedFile);
  };

  const handleWebSearch = async () => {
    if (!lastFailedQuery || isLoading || !user) return;

    const query = lastFailedQuery;
    const messagesWithUserQuery = messages.slice(0, -1);

    setLastFailedQuery(null);
    setIsLoading(true);
    setError(null);
    setMessages(messagesWithUserQuery);
    setSuggestions([]);
    setIsSuggestionsLoading(false);

    try {
      const assistantResponse = await askAssistant(
        query,
        { useWebSearch: true },
        user.uid
      );
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: assistantResponse.summary,
        promptTokenCount: assistantResponse.promptTokenCount,
        candidatesTokenCount: assistantResponse.candidatesTokenCount,
      };

      const finalMessages = [...messagesWithUserQuery, assistantMessage];
      setMessages(finalMessages);

      if (activeChatId) {
        await saveConversation(user.uid, finalMessages, activeChatId);
      }
    } catch (err: any) {
      const errorMessageContent = `Ocorreu um erro na busca web: ${err.message}`;
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: errorMessageContent,
      };
      setMessages((prev) => [...messagesWithUserQuery, errorMessage]);
      setError(errorMessageContent);
    } finally {
      setIsLoading(false);
    }
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
      setError(`Erro ao criar o grupo: ${err.message}`);
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
      setError(`Erro ao mover a conversa: ${err.message}`);
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
      setError(`Erro ao excluir o grupo: ${err.message}`);
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
        setError(`Erro ao renomear: ${err.message}`);
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
        setError(`Erro ao excluir a conversa: ${err.message}`);
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
          setError(`Erro ao salvar o feedback: ${err.message}`);
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
    if (isLoading || regeneratingMessageId || !user || !activeChatId) return;

    const messageIndex = messages.findIndex(m => m.id === assistantMessageId);
    if (messageIndex < 1 || messages[messageIndex - 1].role !== 'user') {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível encontrar a pergunta original para regenerar a resposta.',
      });
      return;
    }

    const userQuery = messages[messageIndex - 1].content;
    const assistantResponse = messages[messageIndex].content;

    setRegeneratingMessageId(assistantMessageId);
    setError(null);
    setLastFailedQuery(null);
    setSuggestions([]);
    setIsSuggestionsLoading(false);

    try {
      const { summary: newSummary, searchFailed, promptTokenCount, candidatesTokenCount } = await regenerateAnswer(
        userQuery,
        activeChat?.fileContext ?? null,
        user.uid
      );
      
      await logRegeneratedQuestion(
          user.uid,
          activeChatId,
          userQuery,
          assistantResponse,
          newSummary
      );
      
      const newAssistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: newSummary,
        promptTokenCount: promptTokenCount,
        candidatesTokenCount: candidatesTokenCount,
      };

      if (searchFailed) {
        setLastFailedQuery(userQuery);
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
      setError(`Erro ao regenerar: ${err.message}`);
      setMessages(messages); 
    } finally {
      setRegeneratingMessageId(null);
    }
  };

  const handleOpenFeedbackDialog = (message: Message) => {
    const messageIndex = messages.findIndex(m => m.id === message.id);
     if (messageIndex < 1) return;
    const userQuery = messages[messageIndex - 1].content;
    
    setFeedbackDetails({
        messageId: message.id,
        userQuery: userQuery,
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
        setError(`Erro ao salvar o comentário de feedback: ${err.message}`);
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
        title: 'Erro',
        description: 'Seu navegador não suporta esta funcionalidade.',
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: 'Copiado!',
        description:
          'A resposta do assistente foi copiada para a área de transferência.',
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Falha ao copiar',
        description:
          'Não foi possível copiar o texto. Verifique as permissões do seu navegador.',
      });
      console.error('Falha ao copiar: ', err);
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
            description: `Não foi possível reportar o problema: ${err.message}`,
        });
    } finally {
        setIsLegalReportDialogOpen(false);
        setMessageToReport(null);
        setLegalReportComment('');
    }
  };

  const handleToggleGroup = (groupId: string) => {
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

  if (authLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <p className="text-lg text-muted-foreground">Carregando...</p>
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
        <div className="flex h-screen w-full bg-background text-foreground">
        <Dialog
            open={isNewGroupDialogOpen}
            onOpenChange={setIsNewGroupDialogOpen}
        >
            <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
                <DialogTitle>Criar Novo Projeto</DialogTitle>
                <DialogDescription>
                Dê um nome ao seu novo projeto de conversas.
                </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateGroup}>
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
            setIsRenameDialogOpen(open);
            if (!open) {
                setItemToRename(null);
                setNewItemName('');
            }
        }}>
            <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
                <DialogTitle>Renomear {itemToRename?.type === 'group' ? 'Projeto' : 'Conversa'}</DialogTitle>
                <DialogDescription>
                Digite o novo nome para "{itemToRename?.currentName}".
                </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleRenameSubmit}>
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
            setIsLegalReportDialogOpen(open);
            if (!open) {
                setMessageToReport(null);
                setLegalReportComment('');
            }
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
        
        <FaqDialog open={isFaqDialogOpen} onOpenChange={setIsFaqDialogOpen} />


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
                onToggleGroup={handleToggleGroup}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                activeDragItem={activeDragItem}
                onOpenFaqDialog={() => setIsFaqDialogOpen(true)}
                isAuthenticated={isAuthenticated}
                handleSignOut={handleSignOut}
            />
        </Sidebar>

        <SidebarInset>
            <main className="flex flex-1 flex-col bg-background">
                <ChatMessageArea
                  messages={messages}
                  isLoading={isLoading}
                  error={error}
                  user={user}
                  userName={userName}
                  userInitials={userInitials}
                  lastFailedQuery={lastFailedQuery}
                  feedbacks={feedbacks}
                  suggestions={suggestions}
                  isSuggestionsLoading={isSuggestionsLoading}
                  regeneratingMessageId={regeneratingMessageId}
                  messagesEndRef={messagesEndRef}
                  onFeedback={handleFeedback}
                  onRegenerate={handleRegenerate}
                  onCopyToClipboard={handleCopyToClipboard}
                  onReportLegalIssueRequest={handleReportLegalIssueRequest}
                  onOpenFeedbackDialog={handleOpenFeedbackDialog}
                  onWebSearch={handleWebSearch}
                  onSuggestionClick={handleSuggestionClick}
                  activeChatId={activeChatId}
                />

                <ChatInputForm
                    input={input}
                    setInput={setInput}
                    handleSubmit={handleSubmit}
                    isLoading={isLoading}
                    inputRef={inputRef}
                    selectedFile={selectedFile}
                    setSelectedFile={setSelectedFile}
                />
            </main>
        </SidebarInset>
        </div>
  );
}

export default function ChatPage() {
    return (
        <SidebarProvider>
            <ChatPageContent />
        </SidebarProvider>
    )
}

    