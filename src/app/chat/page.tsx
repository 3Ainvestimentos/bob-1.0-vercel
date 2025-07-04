
'use client';

import { askAssistant, generateSuggestedQuestions } from '@/app/actions';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAuth } from '@/context/AuthProvider';
import { auth, db } from '@/lib/firebase';
import { useToast } from "@/hooks/use-toast";
import {
  FileText,
  Folder,
  FolderPlus,
  HelpCircle,
  Lightbulb,
  LogIn,
  LogOut,
  Mail,
  MessageSquare,
  MessageSquareText,
  Mic,
  Moon,
  MoreHorizontal,
  Newspaper,
  Pencil,
  Paperclip,
  RefreshCw,
  Search,
  SendHorizontal,
  Settings,
  Sun,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  doc,
  updateDoc,
  serverTimestamp,
  getDoc,
  Timestamp,
  where,
  deleteDoc,
  writeBatch,
  setDoc,
} from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import React, {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import ReactMarkdown from 'react-markdown';
import TextareaAutosize from 'react-textarea-autosize';
import { useTheme } from 'next-themes';

// ---- Data Types ----
export interface Group {
  id: string;
  name: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  messages: Message[];
  groupId?: string | null;
}

type ConversationSidebarItem = Omit<Conversation, 'messages'>;

interface FeedbackDetails {
    messageId: string;
    userQuery: string;
    assistantResponse: string;
}


// ---- Firestore Functions ----

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
        // Inform the user that an index might be needed. The console error from Firebase is more useful.
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
    // Overwrite the document completely. This ensures that if we switch from
    // negative to positive, any existing comment is removed.
    // The comment will be added separately if the user provides one.
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

async function getConversationMessages(
  userId: string,
  chatId: string
): Promise<Message[]> {
  try {
    const chatRef = doc(db, 'users', userId, 'chats', chatId);
    const chatSnap = await getDoc(chatRef);

    if (chatSnap.exists()) {
      const messagesWithIds = (chatSnap.data().messages || []).map((m: any) => ({
          ...m,
          id: m.id || crypto.randomUUID(),
      }));
      return messagesWithIds as Message[];
    } else {
      console.log('No such document!');
      return [];
    }
  } catch (err: any) {
    console.error('Error fetching messages:', err);
    throw new Error('Não foi possível carregar as mensagens da conversa.');
  }
}

async function saveConversation(
  userId: string,
  messages: Message[],
  chatId?: string | null
): Promise<string> {
  if (!userId) throw new Error('User ID is required.');
  if (!messages || messages.length === 0)
    throw new Error('Messages are required.');

  const conversationsRef = collection(db, 'users', userId, 'chats');

  if (chatId) {
    const chatRef = doc(conversationsRef, chatId);
    await updateDoc(chatRef, { messages });
    return chatId;
  } else {
    const firstUserMessage =
      messages.find((m) => m.role === 'user')?.content || 'Nova Conversa';
    const title =
      firstUserMessage.length > 30
        ? firstUserMessage.substring(0, 27) + '...'
        : firstUserMessage;

    const newChatRef = await addDoc(conversationsRef, {
      title,
      messages,
      createdAt: serverTimestamp(),
      groupId: null,
    });
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
            
            // Use a batch write to make the move atomic
            const batch = writeBatch(db);
            batch.set(archivedChatRef, archivedData); // Copy to archive
            batch.delete(chatRef); // Delete original
            
            await batch.commit();

        } else {
            console.warn(`Conversation with ID ${chatId} not found to archive. It might have been already deleted.`);
        }
    } catch (error) {
        console.error("Error archiving and deleting conversation:", error);
        throw new Error("Não foi possível excluir a conversa. Tente novamente.");
    }
}


function ChatPageContent() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { setTheme } = useTheme();
  const { state: sidebarState, isMobile } = useSidebar();
  const { toast } = useToast();


  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [conversations, setConversations] = useState<ConversationSidebarItem[]>(
    []
  );
  const [groups, setGroups] = useState<Group[]>([]);
  const [isSidebarLoading, setIsSidebarLoading] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
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


  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
    setActiveChatId(null);
    setMessages([]);
    setInput('');
    setError(null);
    setLastFailedQuery(null);
    setFeedbacks({});
    setSuggestions([]);
    setIsSuggestionsLoading(false);
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
    setActiveChatId(chatId);
    setMessages([]); 
    setFeedbacks({});
    setSuggestions([]);
    setIsSuggestionsLoading(false);
    try {
        const [fetchedMessages, fetchedFeedbacks] = await Promise.all([
            getConversationMessages(user.uid, chatId),
            getFeedbacksForConversation(user.uid, chatId)
        ]);
        setMessages(fetchedMessages);
        setFeedbacks(fetchedFeedbacks);
    } catch (err: any) {
      setError(`Erro ao carregar a conversa: ${err.message}`);
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  };

  const submitQuery = async (query: string) => {
    if (!query.trim() || isLoading || !user) return;

    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content: query };
    const newMessages = [...messages, userMessage];

    setMessages(newMessages);
    setInput('');
    setIsLoading(true);
    setError(null);
    setLastFailedQuery(null);
    setSuggestions([]);
    setIsSuggestionsLoading(false);

    let currentChatId = activeChatId;

    try {
      if (!currentChatId) {
        const newId = await saveConversation(user.uid, newMessages, null);
        setActiveChatId(newId);
        currentChatId = newId;
      } else {
        await saveConversation(user.uid, newMessages, currentChatId);
      }

      const assistantResponse = await askAssistant(query, {}, user.uid);
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: assistantResponse.summary,
      };

      if (assistantResponse.searchFailed) {
        setLastFailedQuery(query);
      }

      const finalMessages = [...newMessages, assistantMessage];
      setMessages(finalMessages);

      await saveConversation(user.uid, finalMessages, currentChatId);

      const fetchSuggestions = async () => {
        setIsSuggestionsLoading(true);
        try {
          const newSuggestions = await generateSuggestedQuestions(query, assistantResponse.summary);
          setSuggestions(newSuggestions);
        } catch (err) {
          console.error("Failed to fetch suggestions", err);
          setSuggestions([]);
        } finally {
          setIsSuggestionsLoading(false);
        }
      };
      fetchSuggestions();

      if (!activeChatId) {
         await fetchSidebarData();
      } else {
        const currentConvo = conversations.find(c => c.id === activeChatId);
        if (currentConvo && currentConvo.title === 'Nova Conversa') {
            await fetchSidebarData();
        }
      }

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
    submitQuery(suggestion);
  };
  
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    submitQuery(input);
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


  if (authLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <p className="text-lg text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  const isAuthenticated = !!user;
  const userName = user?.displayName ?? 'Usuário';
  const userEmail = user?.email ?? '';
  const userInitials =
    userName
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase() ?? 'U';

  const ungroupedConversations = conversations.filter(
    (c) => !c.groupId
  );

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


        <Sidebar>
            <SidebarContent className="pt-2">
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton onClick={() => setIsNewGroupDialogOpen(true)} tooltip="Novo Projeto" variant="secondary">
                            <FolderPlus />
                            <span className="font-bold">Novo Projeto</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                        <SidebarMenuButton 
                            onClick={handleNewChat}
                            tooltip="Nova Conversa"
                            variant="secondary"
                        >
                            <Pencil />
                            <span className="font-bold">Nova conversa</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>

                <div className="mt-4 flex-1 space-y-1 overflow-y-auto px-3">
                {isSidebarLoading ? (
                    <div className="space-y-2 px-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    </div>
                ) : (
                    <>
                    <div className="group-data-[collapsible=icon]:hidden">
                         {groups.map((group) => (
                            <div key={group.id} className="space-y-1">
                                <div className="group/trigger relative flex w-full items-center rounded-md px-2 py-1.5 text-sm font-medium text-foreground hover:bg-accent">
                                    <Folder className="mr-2 h-4 w-4 shrink-0" />
                                    <span className="truncate font-bold">{group.name}</span>
                                     <div className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover/trigger:pointer-events-auto group-hover/trigger:opacity-100">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-6 w-6">
                                                <MoreHorizontal className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent>
                                            <DropdownMenuItem onClick={() => handleRenameRequest(group.id, 'group', group.name)}>
                                                <Pencil className="mr-2 h-4 w-4" />
                                                <span>Renomear Projeto</span>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                onClick={() => handleDeleteRequest(group.id)}
                                                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                                            >
                                                <Trash2 className="mr-2 h-4 w-4" />
                                                <span>Excluir Projeto</span>
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1 pl-6">
                                    {conversations
                                    .filter((c) => c.groupId === group.id)
                                    .map((convo) => (
                                        <ConversationItem
                                        key={convo.id}
                                        conversation={convo}
                                        isActive={activeChatId === convo.id}
                                        groups={groups}
                                        onSelect={handleSelectConversation}
                                        onMove={handleMoveConversation}
                                        onRename={(id, name) => handleRenameRequest(id, 'conversation', name)}
                                        onDelete={handleDeleteConvoRequest}
                                        />
                                    ))}
                                </div>
                            </div>
                         ))}
                        
                        {ungroupedConversations.length > 0 && (
                            <div className="flex flex-col gap-1 pt-2">
                                {ungroupedConversations.map((convo) => (
                                <ConversationItem
                                    key={convo.id}
                                    conversation={convo}
                                    isActive={activeChatId === convo.id}
                                    groups={groups}
                                    onSelect={handleSelectConversation}
                                    onMove={handleMoveConversation}
                                    onRename={(id, name) => handleRenameRequest(id, 'conversation', name)}
                                    onDelete={handleDeleteConvoRequest}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                    
                    <div className="hidden flex-col gap-1 pt-2 group-data-[collapsible=icon]:flex">
                      {groups.map((group) => (
                          <React.Fragment key={group.id}>
                            {conversations
                              .filter((c) => c.groupId === group.id)
                              .map((convo) => (
                                <ConversationItem
                                  key={convo.id}
                                  conversation={convo}
                                  isActive={activeChatId === convo.id}
                                  groups={groups}
                                  onSelect={handleSelectConversation}
                                  onMove={handleMoveConversation}
                                  onRename={(id, name) => handleRenameRequest(id, 'conversation', name)}
                                  onDelete={handleDeleteConvoRequest}
                                />
                              ))}
                            <Separator className="my-1" />
                          </React.Fragment>
                        ))}
                      {ungroupedConversations.map((convo) => (
                        <ConversationItem
                          key={convo.id}
                          conversation={convo}
                          isActive={activeChatId === convo.id}
                          groups={groups}
                          onSelect={handleSelectConversation}
                          onMove={handleMoveConversation}
                          onRename={(id, name) => handleRenameRequest(id, 'conversation', name)}
                          onDelete={handleDeleteConvoRequest}
                        />
                      ))}
                    </div>

                    {conversations.length === 0 && !isSidebarLoading && (
                        <p className="px-2 text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">
                            Nenhuma conversa ainda.
                        </p>
                    )}
                    </>
                )}
                </div>
            </SidebarContent>

            <SidebarFooter>
                <SidebarMenu className="items-center group-data-[collapsible=expanded]:items-start">
                    <SidebarMenuItem>
                        <SidebarMenuButton asChild tooltip="Guias e FAQ">
                            <a href="#">
                                <HelpCircle />
                                <span className="min-w-0 flex-1">Guias e FAQ</span>
                            </a>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <DropdownMenu>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DropdownMenuTrigger asChild>
                              <SidebarMenuButton>
                                <Settings />
                                <span className="min-w-0 flex-1">Configurações</span>
                              </SidebarMenuButton>
                            </DropdownMenuTrigger>
                          </TooltipTrigger>
                          <TooltipContent
                            side="right"
                            align="center"
                            hidden={sidebarState !== 'collapsed' || isMobile}
                          >
                            Configurações
                          </TooltipContent>
                        </Tooltip>
                        <DropdownMenuContent side="top" align="start">
                          <DropdownMenuLabel>Tema</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setTheme('light')}>
                            <Sun className="mr-2 h-4 w-4" />
                            <span>Claro</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setTheme('dark')}>
                            <Moon className="mr-2 h-4 w-4" />
                            <span>Escuro</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setTheme('system')}>
                            <Settings className="mr-2 h-4 w-4" />
                            <span>Sistema</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </SidebarMenuItem>
                     <SidebarMenuItem>
                       {isAuthenticated ? (
                        <SidebarMenuButton onClick={handleSignOut} tooltip="Sair">
                            <LogOut />
                            <span className="min-w-0 flex-1">Sair</span>
                        </SidebarMenuButton>
                        ) : (
                        <SidebarMenuButton onClick={() => router.push('/')} tooltip="Ir para Login">
                            <LogIn />
                            <span className="min-w-0 flex-1">Ir para Login</span>
                        </SidebarMenuButton>
                        )}
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
        </Sidebar>

        <main className="flex flex-1 flex-col bg-background">
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            <div className="mx-auto flex h-full max-w-5xl flex-col">
                {messages.length === 0 && !isLoading ? (
                <div className="flex h-full flex-col items-center justify-center">
                    <div>
                    <div className="text-left">
                        <h1 className="text-4xl font-bold">
                        Olá, {userName.split(' ')[0]}! 👋
                        </h1>
                        <p className="mt-2 text-lg text-muted-foreground">
                        Como posso te ajudar hoje?
                        </p>
                    </div>

                    <div className="mt-12">
                        <div className="flex items-center justify-between">
                        <p className="text-muted-foreground">
                            Você também pode me perguntar assim:
                        </p>
                        <Button variant="ghost" size="icon">
                            <RefreshCw className="h-4 w-4" />
                        </Button>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                        <Card className="cursor-pointer p-4 transition-colors hover:bg-accent">
                            <div className="flex items-start gap-4">
                            <Newspaper className="h-6 w-6 text-chart-1" />
                            <div>
                                <p className="font-semibold">
                                Buscar notícias sobre IA
                                </p>
                                <p className="text-sm text-muted-foreground">
                                Explorar os últimos acontecimentos no mundo da IA
                                </p>
                            </div>
                            </div>
                        </Card>
                        <Card className="cursor-pointer p-4 transition-colors hover:bg-accent">
                            <div className="flex items-start gap-4">
                            <Mail className="h-6 w-6 text-chart-1" />
                            <div>
                                <p className="font-semibold">
                                Criar campanha de e-mail
                                </p>
                                <p className="text-sm text-muted-foreground">
                                para vendas de fim de ano
                                </p>
                            </div>
                            </div>
                        </Card>
                        <Card className="cursor-pointer p-4 transition-colors hover:bg-accent">
                            <div className="flex items-start gap-4">
                            <Lightbulb className="h-6 w-6 text-chart-1" />
                            <div>
                                <p className="font-semibold">Preparar tópicos</p>
                                <p className="text-sm text-muted-foreground">
                                para uma entrevista sobre vida de nômade digital
                                </p>
                            </div>
                            </div>
                        </Card>
                        <Card className="cursor-pointer p-4 transition-colors hover:bg-accent">
                            <div className="flex items-start gap-4">
                            <FileText className="h-6 w-6 text-chart-1" />
                            <div>
                                <p className="font-semibold">
                                Analisar um novo artigo
                                </p>
                                <p className="text-sm text-muted-foreground">
                                Resumir e destacar pontos chave de um artigo
                                científico
                                </p>
                            </div>
                            </div>
                        </Card>
                        </div>
                    </div>
                    </div>
                </div>
                ) : (
                <div className="space-y-6">
                    {messages.map((msg, index) => (
                    <div
                        key={msg.id}
                        className={`flex items-start gap-4 ${
                        msg.role === 'user' ? 'justify-end' : ''
                        }`}
                    >
                        {msg.role === 'assistant' && (
                          <Avatar>
                              <AvatarFallback>AI</AvatarFallback>
                          </Avatar>
                        )}
                        <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                          <div
                            className={`max-w-[80%] rounded-lg p-3 ${
                                msg.role === 'user'
                                ? 'bg-user-bubble text-user-bubble-foreground'
                                : 'bg-muted'
                            }`}
                          >
                            <ReactMarkdown className="prose prose-sm dark:prose-invert max-w-none">
                                {msg.content}
                            </ReactMarkdown>
                          </div>
                          {msg.role === 'assistant' && activeChatId && (
                            <div className="mt-2 flex items-center gap-1">
                                <Button variant="ghost" size="icon" className={`h-7 w-7 text-muted-foreground hover:text-primary ${feedbacks[msg.id] === 'positive' ? 'bg-primary/10 text-primary' : ''}`} onClick={() => handleFeedback(msg, 'positive')}>
                                    <ThumbsUp className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className={`h-7 w-7 text-muted-foreground hover:text-destructive ${feedbacks[msg.id] === 'negative' ? 'bg-destructive/10 text-destructive' : ''}`} onClick={() => handleFeedback(msg, 'negative')}>
                                    <ThumbsDown className="h-4 w-4" />
                                </Button>
                                {feedbacks[msg.id] === 'negative' && (
                                    <Button variant="link" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => handleOpenFeedbackDialog(msg)}>
                                        Adicionar feedback
                                    </Button>
                                )}
                            </div>
                          )}
                        </div>
                        {msg.role === 'user' && (
                          <Avatar>
                              <AvatarFallback>{userInitials}</AvatarFallback>
                          </Avatar>
                        )}
                    </div>
                    ))}

                    {isLoading && (
                    <div className="flex items-start gap-4">
                        <Avatar>
                        <AvatarFallback>AI</AvatarFallback>
                        </Avatar>
                        <div className="rounded-lg bg-muted p-3">
                        <p className="animate-pulse text-sm">Pensando...</p>
                        </div>
                    </div>
                    )}
                    {lastFailedQuery && !isLoading && (
                    <div className="flex justify-center pt-4">
                        <Button onClick={handleWebSearch} disabled={isLoading}>
                        <Search className="mr-2 h-4 w-4" />
                        Pesquisar na Web
                        </Button>
                    </div>
                    )}
                    {error && !isLoading && (
                    <div className="flex items-start gap-4">
                        <Avatar>
                        <AvatarFallback>AI</AvatarFallback>
                        </Avatar>
                        <div className="rounded-lg bg-destructive p-3 text-destructive-foreground">
                        <p className="text-sm">{error}</p>
                        </div>
                    </div>
                    )}

                    {(isSuggestionsLoading || suggestions.length > 0) && !isLoading && (
                        <div className="mt-6 flex flex-col items-start gap-3">
                            <p className="text-sm text-muted-foreground">Sugestões:</p>
                            <div className="flex flex-wrap gap-2">
                                {isSuggestionsLoading ? (
                                    <>
                                        <Skeleton className="h-9 w-48 rounded-full" />
                                        <Skeleton className="h-9 w-40 rounded-full" />
                                        <Skeleton className="h-9 w-52 rounded-full" />
                                    </>
                                ) : (
                                    suggestions.map((s, i) => (
                                        <Button
                                            key={i}
                                            variant="outline"
                                            size="sm"
                                            className="rounded-full"
                                            onClick={() => handleSuggestionClick(s)}
                                            disabled={isLoading}
                                        >
                                            {s}
                                        </Button>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>
                )}
            </div>
            </div>

            <div className="sticky bottom-0 w-full bg-background/95 backdrop-blur-sm">
                <form
                    onSubmit={handleSubmit}
                    className="mx-auto max-w-5xl px-4 pb-4 pt-2"
                >
                    <div className="rounded-lg border bg-background shadow-sm">
                        <div className="relative flex min-h-[60px] items-start">
                            <TextareaAutosize
                                ref={inputRef}
                                placeholder="Insira aqui um comando ou pergunta"
                                className="min-h-[inherit] flex-1 resize-none border-0 bg-transparent p-4 pr-12 text-base focus-visible:ring-0"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                if (
                                    e.key === 'Enter' &&
                                    !e.shiftKey &&
                                    !e.nativeEvent.isComposing
                                ) {
                                    e.preventDefault();
                                    if (e.currentTarget.form) {
                                      e.currentTarget.form.requestSubmit();
                                    }
                                }
                                }}
                                disabled={isLoading}
                                rows={1}
                                maxRows={8}
                            />
                            <Button
                                type="submit"
                                size="icon"
                                variant="ghost"
                                className="absolute right-3 top-3 h-8 w-8 rounded-full text-muted-foreground"
                                disabled={isLoading || !input.trim()}
                            >
                                <SendHorizontal className="h-5 w-5" />
                            </Button>
                        </div>
                        <Separator />
                        <div className="flex items-center p-2">
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground"
                                disabled={isLoading}
                            >
                                <Paperclip className="h-5 w-5" />
                            </Button>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground"
                                disabled={isLoading}
                            >
                                <Mic className="h-5 w-5" />
                            </Button>
                        </div>
                    </div>
                    <p className="pt-2 text-center text-xs text-muted-foreground">
                        Sujeito aos Termos de uso 3A RIVA e à Política de Privacidade da 3A RIVA. O modelo Bob 1.0 pode cometer erros. Por isso, é bom checar as respostas.
                    </p>
                </form>
            </div>
        </main>
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

// ---- Sub-component for Conversation Item ----
interface ConversationItemProps {
  conversation: ConversationSidebarItem;
  isActive: boolean;
  groups: Group[];
  onSelect: (id: string) => void;
  onMove: (chatId: string, groupId: string | null) => void;
  onRename: (id: string, currentName: string) => void;
  onDelete: (id: string) => void;
}

function ConversationItem({
  conversation,
  isActive,
  groups,
  onSelect,
  onMove,
  onRename,
  onDelete,
}: ConversationItemProps) {
  return (
    <SidebarMenuItem className="group/menu-item relative list-none">
      <div className="flex min-w-0 items-center">
        <SidebarMenuButton
            onClick={() => onSelect(conversation.id)}
            isActive={isActive}
            className="h-auto flex-1 justify-start whitespace-normal py-2"
            tooltip={conversation.title}
        >
            <MessageSquareText />
            <span className="min-w-0 flex-1 truncate">{conversation.title}</span>
        </SidebarMenuButton>

        <div className="pointer-events-none absolute right-1 top-1/2 flex -translate-y-1/2 flex-shrink-0 items-center opacity-0 transition-opacity group-hover/menu-item:pointer-events-auto group-hover/menu-item:opacity-100 group-data-[collapsible=icon]:hidden">
            <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizontal className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => onRename(conversation.id, conversation.title)}>
                <Pencil className="mr-2 h-4 w-4" />
                <span>Renomear</span>
                </DropdownMenuItem>
                <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                    <FolderPlus className="mr-2 h-4 w-4" />
                    <span>Mover para...</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                    <DropdownMenuSubContent>
                    {groups.map((group) => (
                        <DropdownMenuItem
                        key={group.id}
                        disabled={conversation.groupId === group.id}
                        onClick={() => onMove(conversation.id, group.id)}
                        >
                        {group.name}
                        </DropdownMenuItem>
                    ))}
                    {conversation.groupId && (
                        <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onMove(conversation.id, null)}>
                            Remover do projeto
                        </DropdownMenuItem>
                        </>
                    )}
                    {groups.length === 0 && !conversation.groupId && (
                        <DropdownMenuItem disabled>Nenhum projeto criado</DropdownMenuItem>
                    )}
                    </DropdownMenuSubContent>
                </DropdownMenuPortal>
                </DropdownMenuSub>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                onClick={() => onDelete(conversation.id)}
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                >
                <Trash2 className="mr-2 h-4 w-4" />
                <span>Excluir</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
            </DropdownMenu>
        </div>
      </div>
    </SidebarMenuItem>
  );
}
