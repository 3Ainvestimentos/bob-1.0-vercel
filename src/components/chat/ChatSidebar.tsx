
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
  Folder,
  FolderPlus,
  HelpCircle,
  LogIn,
  LogOut,
  MessageSquareText,
  Moon,
  MoreHorizontal,
  Pencil,
  Settings,
  Sun,
  Trash2,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import React from 'react';

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
            <SidebarMenuButton onClick={onNewChat} tooltip="Nova Conversa" variant="secondary">
              <Pencil />
              <span className="font-bold">Nova conversa</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <ScrollArea className="mt-4 flex-1">
          <div className="space-y-1 px-3">
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
                              <DropdownMenuItem onClick={() => onRenameRequest(group.id, 'group', group.name)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                <span>Renomear Projeto</span>
                              </DropdownMenuItem>
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
                      <div className="flex flex-col gap-1 pl-6">
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
                          onSelect={onSelectConversation}
                          onMove={onMoveConversation}
                          onRename={(id, name) => onRenameRequest(id, 'conversation', name)}
                          onDelete={onDeleteConvoRequest}
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
                            onSelect={onSelectConversation}
                            onMove={onMoveConversation}
                            onRename={(id, name) => onRenameRequest(id, 'conversation', name)}
                            onDelete={onDeleteConvoRequest}
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
                      onSelect={onSelectConversation}
                      onMove={onMoveConversation}
                      onRename={(id, name) => onRenameRequest(id, 'conversation', name)}
                      onDelete={onDeleteConvoRequest}
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
        </ScrollArea>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu className="items-center group-data-[collapsible=expanded]:items-start">
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
                <TooltipContent side="right" align="center" hidden={sidebarState !== 'collapsed' || isMobile}>
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
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a href="#"><HelpCircle className="mr-2 h-4 w-4" /><span>Guias e FAQ</span></a>
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
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={toggleSidebar} tooltip={sidebarState === 'expanded' ? 'Recolher' : 'Expandir'}>
              {sidebarState === 'expanded' ? <ChevronsLeft /> : <ChevronsRight />}
              <span className="min-w-0 flex-1">Recolher</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
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
