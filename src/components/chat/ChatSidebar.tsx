
'use client';

import {
  ConversationSidebarItem,
  Group,
} from '@/app/chat/page';
import { Button } from '@/components/ui/button';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ChevronsLeft,
  ChevronsRight,
  Copy,
  Folder,
  FolderPlus,
  HelpCircle,
  LogIn,
  LogOut,
  MessageSquareText,
  Moon,
  MoreHorizontal,
  Move,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Pin,
  PinOff,
  Search,
  Settings,
  Sun,
  Trash2,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import React from 'react';
import { BobIcon } from '../icons/BobIcon';

interface ChatSidebarProps {
  conversations: ConversationSidebarItem[];
  groups: Group[];
  activeChatId: string | null;
  isSidebarLoading: boolean;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onMoveConversation: (chatId: string, groupId: string | null) => void;
  onRenameRequest: (id: string, type: 'group' | 'conversation', currentName: string) => void;
  onDeleteConvoRequest: (id: string) => void;
  setIsNewGroupDialogOpen: (isOpen: boolean) => void;
  onDeleteGroupRequest: (id: string) => void;
  isAuthenticated: boolean;
  handleSignOut: () => void;
}

export function ChatSidebar({
  conversations,
  groups,
  activeChatId,
  isSidebarLoading,
  onNewChat,
  onSelectConversation,
  onMoveConversation,
  onRenameRequest,
  onDeleteConvoRequest,
  setIsNewGroupDialogOpen,
  onDeleteGroupRequest,
  isAuthenticated,
  handleSignOut,
}: ChatSidebarProps) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const { state: sidebarState, isMobile, toggleSidebar } = useSidebar();
  
  const ungroupedConversations = conversations.filter((c) => !c.groupId);

  return (
    <>
      <SidebarHeader className="flex h-14 items-center justify-between border-b border-sidebar-border p-2">
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:hidden">
          <BobIcon className="h-8 w-8" />
          <span className="font-semibold">Bob 1.0</span>
        </div>
        <SidebarMenuButton 
          onClick={toggleSidebar} 
          className="ml-auto size-8 group-data-[collapsible=icon]:mx-auto" 
          tooltip={sidebarState === 'expanded' ? 'Recolher' : 'Expandir'}
        >
          {sidebarState === 'expanded' ? <PanelLeftClose /> : <PanelLeftOpen />}
        </SidebarMenuButton>
      </SidebarHeader>

      <SidebarContent>
        <ScrollArea className="flex-1">
          <SidebarMenu>
            {isSidebarLoading ? (
              <div className="space-y-2 px-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : (
              <>
                {groups.map((group) => (
                  <SidebarMenuItem key={group.id} className="space-y-1">
                    <div className="group/trigger relative flex w-full items-center rounded-md px-2 py-1.5 text-sm font-medium text-foreground hover:bg-sidebar-accent">
                      <Folder className="mr-2 h-4 w-4 shrink-0" />
                      <span className="truncate font-bold">{group.name}</span>
                      <div className="pointer-events-none absolute right-1 top-1/2 flex -translate-y-1/2 opacity-0 transition-opacity group-hover/trigger:pointer-events-auto group-hover/trigger:opacity-100">
                        <Button variant="ghost" size="icon" className="h-6 w-6" disabled>
                            <Pin className="h-4 w-4" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onClick={() => {}} disabled>
                              <PinOff className="mr-2 h-4 w-4" />
                              <span>Desafixar projeto</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onRenameRequest(group.id, 'group', group.name)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              <span>Renomear Projeto</span>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => onDeleteGroupRequest(group.id)}
                              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              <span>Excluir Projeto</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 border-l-2 border-sidebar-border/50 pl-4 ml-2">
                      {conversations
                        .filter((c) => c.groupId === group.id)
                        .map((convo) => (
                          <ConversationItem
                            key={convo.id}
                            conversation={convo}
                            isActive={activeChatId === convo.id}
                            groups={groups}
                            onSelect={onSelectConversation}
                            onMove={onMoveConversation}
                            onRename={(id, name) => onRenameRequest(id, 'conversation', name)}
                            onDelete={onDeleteConvoRequest}
                          />
                        ))}
                    </div>
                  </SidebarMenuItem>
                ))}
                
                {ungroupedConversations.map((convo) => (
                  <ConversationItem
                    key={convo.id}
                    conversation={convo}
                    isActive={activeChatId === convo.id}
                    groups={groups}
                    onSelect={onSelectConversation}
                    onMove={onMoveConversation}
                    onRename={(id, name) => onRenameRequest(id, 'conversation', name)}
                    onDelete={onDeleteConvoRequest}
                  />
                ))}
              
                {conversations.length === 0 && !isSidebarLoading && (
                  <p className="px-2 text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">
                    Nenhuma conversa ainda.
                  </p>
                )}
              </>
            )}
          </SidebarMenu>
        </ScrollArea>
      </SidebarContent>

      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onNewChat} tooltip="Nova Conversa">
              <Pencil /> <span>Nova conversa</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => setIsNewGroupDialogOpen(true)} tooltip="Novo Projeto">
              <FolderPlus /> <span>Novo Projeto</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
           <SidebarMenuItem>
            <SidebarMenuButton onClick={() => {}} tooltip="Pesquisar">
              <Search className="size-5" /> <span>Pesquisar</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        
        <Separator className="my-1" />

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton>
                  <Settings className="size-5" />
                  <span className="min-w-0 flex-1">Configurações e Ajuda</span>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="right" align="center" hidden={sidebarState !== 'collapsed' || isMobile}>
              Configurações e Ajuda
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent side="top" align="start" className="w-56">
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
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href="#"><HelpCircle className="mr-2 h-5 w-5" /><span>Guias e FAQ</span></a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {isAuthenticated ? (
              <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Sair</span>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => router.push('/')}>
                <LogIn className="mr-2 h-4 w-4" />
                <span >Ir para Login</span>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </>
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
                  <Move className="mr-2 h-4 w-4" />
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
              <DropdownMenuItem onClick={() => {}} disabled>
                <Copy className="mr-2 h-4 w-4" />
                <span>Copiar Link</span>
              </DropdownMenuItem>
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
