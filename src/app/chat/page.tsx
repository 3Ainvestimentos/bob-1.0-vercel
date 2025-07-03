
'use client';

import { askAssistant } from '@/app/actions';
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
} from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/AuthProvider';
import { auth, db } from '@/lib/firebase';
import {
  FileText,
  FolderPlus,
  HelpCircle,
  Lightbulb,
  LogIn,
  LogOut,
  Mail,
  MessageSquare,
  Mic,
  Moon,
  MoreHorizontal,
  Newspaper,
  Pencil,
  Plus,
  RectangleEllipsis,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Sun,
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
} from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import React, { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useTheme } from 'next-themes';

// ---- Data Types ----
export interface Group {
  id: string;
  name: string;
}

export interface Message {
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

// ---- Firestore Functions ----
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
      return chatSnap.data().messages as Message[];
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
    await deleteDoc(chatRef);
}


export default function ChatPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { setTheme } = useTheme();

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


  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
    try {
      const fetchedMessages = await getConversationMessages(user.uid, chatId);
      setMessages(fetchedMessages);
    } catch (err: any) {
      setError(`Erro ao carregar a conversa: ${err.message}`);
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleWebSearch = async () => {
    if (!lastFailedQuery || isLoading || !user) return;

    const query = lastFailedQuery;
    const messagesWithUserQuery = messages.slice(0, -1);

    setLastFailedQuery(null);
    setIsLoading(true);
    setError(null);
    setMessages(messagesWithUserQuery);

    try {
      const assistantResponse = await askAssistant(
        query,
        { useWebSearch: true },
        user.uid
      );
      const assistantMessage: Message = {
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
        role: 'assistant',
        content: errorMessageContent,
      };
      setMessages((prev) => [...messagesWithUserQuery, errorMessage]);
      setError(errorMessageContent);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !user) return;

    const userMessage: Message = { role: 'user', content: input };
    const newMessages = [...messages, userMessage];

    setMessages(newMessages);
    const currentInput = input;
    setInput('');
    setIsLoading(true);
    setError(null);
    setLastFailedQuery(null);

    let currentChatId = activeChatId;

    try {
      if (!currentChatId) {
        currentChatId = await saveConversation(user.uid, newMessages, null);
        setActiveChatId(currentChatId);
      } else {
        await saveConversation(user.uid, newMessages, currentChatId);
      }

      const assistantResponse = await askAssistant(currentInput, {}, user.uid);
      const assistantMessage: Message = {
        role: 'assistant',
        content: assistantResponse.summary,
      };

      if (assistantResponse.searchFailed) {
        setLastFailedQuery(currentInput);
      }

      const finalMessages = [...newMessages, assistantMessage];
      setMessages(finalMessages);

      await saveConversation(user.uid, finalMessages, currentChatId);

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
        role: 'assistant',
        content: errorMessageContent,
      };
      setMessages((prev) => [...prev, errorMessage]);
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
    <SidebarProvider>
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


        <Sidebar>
            <SidebarHeader className="flex h-16 items-center border-b border-sidebar-border p-4 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-2">
                 <div className="flex w-full min-w-0 items-center gap-3">
                    <Avatar>
                        <AvatarFallback>{userInitials}</AvatarFallback>
                    </Avatar>
                    <div className="grid min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                        <p className="truncate font-semibold">{userName}</p>
                        <p className="truncate text-sm text-muted-foreground">{userEmail}</p>
                    </div>
                </div>
            </SidebarHeader>

            <SidebarContent>
                <SidebarMenu className="pt-2">
                    <SidebarMenuItem>
                        <SidebarMenuButton 
                            onClick={handleNewChat}
                            isActive={activeChatId === null}
                            tooltip="Nova Conversa"
                        >
                            <Pencil />
                            <span>Nova conversa</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                         <SidebarMenuButton onClick={() => setIsNewGroupDialogOpen(true)} tooltip="Novo Projeto">
                            <FolderPlus />
                            <span>Novo Projeto</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>

                <div className="mt-4 flex-1 space-y-2 overflow-y-auto px-3">
                {isSidebarLoading ? (
                    <div className="space-y-2 px-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    </div>
                ) : (
                    <>
                    <div className="group-data-[collapsible=icon]:hidden">
                        <Accordion type="multiple" className="w-full" defaultValue={groups.map(g => g.id)}>
                            {groups.map((group) => (
                            <AccordionItem value={group.id} key={group.id} className="group/accordion-item border-b-0">
                                <div className="group/trigger relative flex w-full items-center">
                                    <AccordionTrigger className="w-full justify-start rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:no-underline">
                                    <span className="truncate pr-2">{group.name}</span>
                                    </AccordionTrigger>
                                    <div className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover/trigger:pointer-events-auto group-hover/trigger:opacity-100">
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
                                <AccordionContent>
                                <div className="flex flex-col gap-1 pt-1">
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
                                </AccordionContent>
                            </AccordionItem>
                            ))}
                        </Accordion>

                        {ungroupedConversations.length > 0 && (
                            <div className="pt-2">
                            <p className="px-2 text-xs font-medium text-muted-foreground">
                                Conversas Recentes
                            </p>
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
                            </div>
                        )}
                    </div>
                    
                    <div className="hidden group-data-[collapsible=icon]:flex flex-col gap-1 pt-2">
                      {groups.map((group) => {
                        const groupConversations = conversations.filter(
                          (c) => c.groupId === group.id
                        );
                        if (groupConversations.length === 0) {
                          return null;
                        }
                        return (
                          <React.Fragment key={group.id}>
                            {groupConversations.map((convo) => (
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
                        );
                      })}
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
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton asChild tooltip="Guias e FAQ">
                            <a href="#">
                                <HelpCircle />
                                <span>Guias e FAQ</span>
                            </a>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <SidebarMenuButton tooltip="Configurações">
                                    <Settings />
                                    <span>Configurações</span>
                                </SidebarMenuButton>
                            </DropdownMenuTrigger>
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
                            <span>Sair</span>
                        </SidebarMenuButton>
                        ) : (
                        <SidebarMenuButton onClick={() => router.push('/')} tooltip="Ir para Login">
                            <LogIn />
                            <span>Ir para Login</span>
                        </SidebarMenuButton>
                        )}
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
        </Sidebar>

        <main className="flex flex-1 flex-col bg-background">
            <header className="flex h-16 items-center border-b bg-background px-4 lg:px-6">
                <SidebarTrigger />
            </header>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            <div className="mx-auto flex h-full max-w-3xl flex-col">
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
                        key={index}
                        className={`flex items-start gap-4 ${
                        msg.role === 'user' ? 'justify-end' : ''
                        }`}
                    >
                        {msg.role === 'assistant' && (
                        <Avatar>
                            <AvatarFallback>AI</AvatarFallback>
                        </Avatar>
                        )}
                        <div
                        className={`max-w-[80%] rounded-lg p-3 ${
                            msg.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        }`}
                        >
                        <ReactMarkdown className="prose prose-sm dark:prose-invert max-w-none">
                            {msg.content}
                        </ReactMarkdown>
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
                    <div ref={messagesEndRef} />
                </div>
                )}
            </div>
            </div>

            <form
            onSubmit={handleSubmit}
            className="sticky bottom-0 w-full bg-background/95 p-4 backdrop-blur-sm"
            >
            <div className="relative mx-auto flex max-w-3xl flex-col rounded-2xl bg-muted/70 p-3">
                <div className="flex items-center">
                <Shield className="mr-2 h-5 w-5 shrink-0 text-muted-foreground" />
                <Textarea
                    ref={inputRef}
                    placeholder="Insira um comando para o assistente"
                    className="flex-1 resize-none self-end border-0 bg-transparent p-0 text-base focus-visible:ring-0"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                    if (
                        e.key === 'Enter' &&
                        !e.shiftKey &&
                        !e.nativeEvent.isComposing
                    ) {
                        handleSubmit(e);
                    }
                    }}
                    disabled={isLoading}
                />
                </div>
                <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-1">
                    <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full text-muted-foreground hover:text-primary"
                    >
                    <Plus className="h-4 w-4" />
                    </Button>
                    <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-primary"
                    >
                    <Search className="mr-2 h-4 w-4" />
                    Deep Research
                    </Button>
                    <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-primary"
                    >
                    <RectangleEllipsis className="mr-2 h-4" />
                    Canvas
                    </Button>
                </div>
                <div className="flex items-center">
                    <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full text-muted-foreground hover:text-primary"
                    disabled={isLoading}
                    >
                    <Mic className="h-4 w-4" />
                    </Button>
                    <Button
                    type="submit"
                    size="sm"
                    className="ml-2"
                    disabled={isLoading || !input.trim()}
                    >
                    Enviar
                    </Button>
                </div>
                </div>
            </div>
            </form>
        </main>
        </div>
    </SidebarProvider>
  );
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
    <SidebarMenuItem className="group/menu-item relative">
      <div className="flex min-w-0 items-center">
        <SidebarMenuButton
            onClick={() => onSelect(conversation.id)}
            isActive={isActive}
            className="h-auto flex-1 justify-start whitespace-normal py-2"
            tooltip={conversation.title}
        >
            <MessageSquare />
            <span className="min-w-0 flex-1 truncate">{conversation.title}</span>
        </SidebarMenuButton>

        <div className="flex-shrink-0 group-data-[collapsible=icon]:hidden opacity-0 transition-opacity group-hover/menu-item:opacity-100">
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
