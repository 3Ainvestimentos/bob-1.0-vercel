
'use client';

import { ConversationSidebarItem, Group } from '@/app/chat/page';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ChevronRight,
  Copy,
  Folder,
  FolderPlus,
  HelpCircle,
  MessageSquareText,
  MoreHorizontal,
  Move,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Search,
  Settings,
  Trash2,
} from 'lucide-react';
import React from 'react';
import { SettingsHelpDropdown } from './SettingsHelpDropdown';
import { cn } from '@/lib/utils';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  closestCenter,
  useDroppable,
  DragOverlay,
  type DragStartEvent,
  DraggableSyntheticListeners,
  UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  SortableContextProps,
} from '@dnd-kit/sortable';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import { CSS } from '@dnd-kit/utilities';
import { User } from 'firebase/auth';


interface ChatSidebarProps {
  conversations: ConversationSidebarItem[];
  groups: Group[];
  activeChatId: string | null;
  isSidebarLoading: boolean;
  expandedGroups: Record<string, boolean>;
  activeDragItem: ConversationSidebarItem | Group | null;
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onMoveConversation: (chatId: string, groupId: string | null) => void;
  onRenameRequest: (
    id: string,
    type: 'group' | 'conversation',
    currentName: string
  ) => void;
  onDeleteConvoRequest: (id: string) => void;
  setIsNewGroupDialogOpen: (isOpen: boolean) => void;
  onDeleteGroupRequest: (id: string) => void;
  onToggleGroup: (groupId: string) => void;
  onDragStart: (event: DragStartEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onOpenFaqDialog: () => void;
  isAuthenticated: boolean;
  handleSignOut: () => void;
  user: User | null;
}

export function ChatSidebar({
  conversations,
  groups,
  activeChatId,
  isSidebarLoading,
  expandedGroups,
  activeDragItem,
  onNewChat,
  onSelectConversation,
  onMoveConversation,
  onRenameRequest,
  onDeleteConvoRequest,
  setIsNewGroupDialogOpen,
  onDeleteGroupRequest,
  onToggleGroup,
  onDragStart,
  onDragEnd,
  onOpenFaqDialog,
  isAuthenticated,
  handleSignOut,
  user,
}: ChatSidebarProps) {
  const { state: sidebarState, toggleSidebar } = useSidebar();
  
  const ungroupedConversations = conversations.filter((c) => !c.groupId);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

  return (
    <>
      <div className="flex h-14 items-center p-2 group-data-[state=expanded]:justify-start group-data-[state=collapsed]:justify-center">
        <TooltipProvider>
          <SidebarMenuButton
            onClick={toggleSidebar}
            className="size-8"
            tooltip={sidebarState === 'expanded' ? 'Recolher' : 'Expandir'}
          >
            {sidebarState === 'expanded' ? (
              <PanelLeftClose className="size-4" />
            ) : (
              <PanelLeftOpen className="size-4" />
            )}
          </SidebarMenuButton>
        </TooltipProvider>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
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
                 <SortableContext
                    items={groups.map((g) => `group-${g.id}`)}
                    strategy={verticalListSortingStrategy}
                  >
                    {groups.map((group) => (
                      <GroupItem
                        key={group.id}
                        group={group}
                        conversations={conversations.filter(c => c.groupId === group.id)}
                        isExpanded={expandedGroups[group.id]}
                        activeChatId={activeChatId}
                        groups={groups}
                        onToggleGroup={onToggleGroup}
                        onRenameRequest={onRenameRequest}
                        onDeleteGroupRequest={onDeleteGroupRequest}
                        onSelectConversation={onSelectConversation}
                        onMoveConversation={onMoveConversation}
                        onDeleteConvoRequest={onDeleteConvoRequest}
                      />
                    ))}
                  </SortableContext>

                  <UngroupedArea>
                    <SortableContext
                      items={ungroupedConversations.map((c) => `convo-${c.id}`)}
                      strategy={verticalListSortingStrategy}
                    >
                      {ungroupedConversations.map((convo) => (
                        <ConversationItem
                          key={convo.id}
                          conversation={convo}
                          isActive={activeChatId === convo.id}
                          groups={groups}
                          onSelect={onSelectConversation}
                          onMove={onMoveConversation}
                          onRename={(id, name) =>
                            onRenameRequest(id, 'conversation', name)
                          }
                          onDelete={onDeleteConvoRequest}
                        />
                      ))}
                    </SortableContext>
                  </UngroupedArea>

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

        <DragOverlay dropAnimation={null}>
          {activeDragItem ? (
            'name' in activeDragItem ? (
                <SidebarMenuItem className="pointer-events-none w-full !cursor-grabbing !opacity-100 shadow-lg bg-sidebar-accent">
                    <div className="flex w-full items-center">
                        <SidebarMenuButton
                            className="h-9 flex-1 justify-start gap-2 overflow-hidden p-2 text-sm text-muted-foreground outline-none ring-sidebar-ring focus-visible:ring-2"
                            isActive
                        >
                            <ChevronRight className="h-4 w-4 shrink-0 transition-transform duration-200 rotate-90" />
                            <Folder className="h-4 w-4 shrink-0" />
                            <SidebarMenuButton.Text className="truncate font-bold">
                                {activeDragItem.name}
                            </SidebarMenuButton.Text>
                        </SidebarMenuButton>
                    </div>
                </SidebarMenuItem>
            ) : (
                <SidebarMenuButton
                    className="pointer-events-none w-full !cursor-grabbing !opacity-100 shadow-lg"
                    isActive={true}
                >
                    <MessageSquareText className="size-4" />
                    <SidebarMenuButton.Text>
                    {activeDragItem.title}
                    </SidebarMenuButton.Text>
                </SidebarMenuButton>
            )
          ) : null}
        </DragOverlay>
      </DndContext>

      <SidebarFooter>
        <SidebarMenu className="group-data-[state=collapsed]:justify-center">
          <SidebarMenuItem id="new-chat-button">
            <SidebarMenuButton
              onClick={onNewChat}
              tooltip="Nova Conversa"
              className="h-9 w-full justify-start font-semibold rounded-xl bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/80"
            >
              <Pencil className="h-4 w-4 group-data-[state=collapsed]:h-5 group-data-[state=collapsed]:w-5" />
              <SidebarMenuButton.Text>Nova conversa</SidebarMenuButton.Text>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem id="new-project-button">
            <SidebarMenuButton
              onClick={() => setIsNewGroupDialogOpen(true)}
              tooltip="Novo Projeto"
              className="h-9 w-full justify-start font-semibold rounded-xl bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/80"
            >
              <FolderPlus className="h-4 w-4 group-data-[state=collapsed]:h-5 group-data-[state=collapsed]:w-5" />
              <SidebarMenuButton.Text>Novo projeto</SidebarMenuButton.Text>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={onOpenFaqDialog}
              tooltip="Guias e FAQ"
              variant="ghost"
              className="h-9 w-full justify-start !bg-transparent text-sidebar-foreground hover:!bg-sidebar-accent hover:!text-sidebar-accent-foreground"
            >
              <HelpCircle className="h-5 w-5 group-data-[state=collapsed]:h-5 group-data-[state=collapsed]:w-5" />
              <SidebarMenuButton.Text>Guias e FAQ</SidebarMenuButton.Text>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SettingsHelpDropdown
            isAuthenticated={isAuthenticated}
            handleSignOut={handleSignOut}
            user={user}
          />
        </SidebarMenu>
      </SidebarFooter>
    </>
  );
}

// ---- Sub-components ----

interface GroupItemProps {
  group: Group;
  conversations: ConversationSidebarItem[];
  isExpanded: boolean;
  activeChatId: string | null;
  groups: Group[];
  onToggleGroup: (groupId: string) => void;
  onRenameRequest: (
    id: string,
    type: 'group' | 'conversation',
    currentName: string
  ) => void;
  onDeleteGroupRequest: (id: string) => void;
  onSelectConversation: (id: string) => void;
  onMoveConversation: (chatId: string, groupId: string | null) => void;
  onDeleteConvoRequest: (id: string) => void;
}

function GroupItem({
  group,
  conversations,
  isExpanded,
  activeChatId,
  groups,
  onToggleGroup,
  onRenameRequest,
  onDeleteGroupRequest,
  onSelectConversation,
  onMoveConversation,
  onDeleteConvoRequest,
}: GroupItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef: setSortableNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `group-${group.id}`,
  });
  const { isOver, setNodeRef: setDroppableNodeRef } = useDroppable({
    id: `group-${group.id}`,
  });

  const style = {
    transform: transform ? CSS.Transform.toString(transform) : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 100 : 'auto',
  };

  const setNodeRef = (node: HTMLLIElement | null) => {
    setSortableNodeRef(node);
    setDroppableNodeRef(node);
  };
  
  const { state: sidebarState, isMobile } = useSidebar();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <SidebarMenuItem
            ref={setNodeRef}
            style={style}
            className={cn(
              'transition-colors',
              isOver && 'bg-sidebar-accent/50'
            )}
          >
            <div className="flex w-full items-center group/menu-item">
              <SidebarMenuButton
                onClick={() => onToggleGroup(group.id)}
                className="h-9 flex-1 justify-start gap-2 overflow-hidden p-2 text-sm text-muted-foreground outline-none ring-sidebar-ring hover:bg-sidebar-accent focus-visible:ring-2 group-data-[state=collapsed]:h-9 group-data-[state=collapsed]:w-9 group-data-[state=collapsed]:p-2"
                tooltip={group.name}
                {...attributes}
                {...listeners}
              >
                {conversations.length > 0 ? (
                  <ChevronRight
                    className={cn(
                      'h-4 w-4 shrink-0 transition-transform duration-200 group-data-[state=collapsed]:hidden',
                      isExpanded && 'rotate-90'
                    )}
                  />
                ) : (
                  <span className="h-4 w-4 shrink-0 group-data-[state=collapsed]:hidden" />
                )}
                <Folder className="h-4 w-4 shrink-0" />
                <SidebarMenuButton.Text className="truncate font-bold">
                  {group.name}
                </SidebarMenuButton.Text>
              </SidebarMenuButton>

              <div className="ml-auto flex items-center opacity-0 transition-opacity group-hover/menu-item:opacity-100 group-data-[state=collapsed]:hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem
                      onClick={() =>
                        onRenameRequest(group.id, 'group', group.name)
                      }
                    >
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
            <ul
              className={cn(
                'flex flex-col gap-1 overflow-hidden transition-all duration-300 ease-in-out',
                'border-sidebar-border/50 group-data-[state=expanded]:ml-4 group-data-[state=expanded]:border-l-2 group-data-[state=expanded]:pl-4',
                'group-data-[state=collapsed]:ml-0 group-data-[state=collapsed]:border-l-0 group-data-[state=collapsed]:pl-0',
                isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
              )}
            >
              <SortableContext
                items={conversations.map((c) => `convo-${c.id}`)}
                strategy={verticalListSortingStrategy}
              >
                {conversations.map((convo) => (
                  <ConversationItem
                    key={convo.id}
                    conversation={convo}
                    isActive={activeChatId === convo.id}
                    groups={groups}
                    onSelect={onSelectConversation}
                    onMove={onMoveConversation}
                    onRename={(id, name) =>
                      onRenameRequest(id, 'conversation', name)
                    }
                    onDelete={onDeleteConvoRequest}
                  />
                ))}
              </SortableContext>
            </ul>
          </SidebarMenuItem>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          align="center"
          hidden={sidebarState !== 'collapsed' || isMobile}
        >
          {group.name}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function UngroupedArea({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'ungrouped-area',
  });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'transition-colors',
        isOver && 'bg-sidebar-accent/50'
      )}
    >
      {children}
    </div>
  );
}

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
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `convo-${conversation.id}` });

  const style = {
    transform: transform ? CSS.Transform.toString(transform) : undefined,
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 100 : 'auto',
  };

  return (
    <SidebarMenuItem
      ref={setNodeRef}
      style={style}
      className="group/menu-item relative"
    >
      <SidebarMenuButton
        onClick={() => onSelect(conversation.id)}
        isActive={isActive}
        className="h-auto flex-1 justify-start whitespace-normal py-2"
        tooltip={conversation.title}
        {...attributes}
        {...listeners}
      >
        <MessageSquareText className="size-4" />
        <SidebarMenuButton.Text className="min-w-0 flex-1 truncate">
          {conversation.title}
        </SidebarMenuButton.Text>
      </SidebarMenuButton>
      <div className="pointer-events-none absolute right-1 top-1/2 flex -translate-y-1/2 flex-shrink-0 items-center opacity-0 transition-opacity group-hover/menu-item:pointer-events-auto group-hover/menu-item:opacity-100 group-data-[state=collapsed]:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              onClick={() => onRename(conversation.id, conversation.title)}
            >
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
                      <DropdownMenuItem
                        onClick={() => onMove(conversation.id, null)}
                      >
                        Remover do projeto
                      </DropdownMenuItem>
                    </>
                  )}
                  {groups.length === 0 && !conversation.groupId && (
                    <DropdownMenuItem disabled>
                      Nenhum projeto criado
                    </DropdownMenuItem>
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
    </SidebarMenuItem>
  );
}
