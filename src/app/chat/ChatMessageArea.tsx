
'use client';

import { Conversation, Message, AttachedFile } from '@/app/chat/page';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { User } from 'firebase/auth';
import {
  AlertTriangle,
  FileText,
  MoreHorizontal,
  Paperclip,
  RefreshCw,
  Search,
  Share2,
  ThumbsDown,
  ThumbsUp,
  Hand,
  UserPlus,
  KeyRound,
  PiggyBank,
  Wand2,
} from 'lucide-react';
import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { BobIcon } from '@/components/icons/BobIcon';
import rehypeRaw from 'rehype-raw';
import { POSICAO_CONSOLIDADA_PREAMBLE } from './preambles';

interface ChatMessageAreaProps {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  user: User | null;
  userName: string;
  userInitials: string;
  lastFailedQuery: string | null;
  feedbacks: Record<string, 'positive' | 'negative'>;
  regeneratingMessageId: string | null;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  onFeedback: (message: Message, rating: 'positive' | 'negative') => void;
  onRegenerate: (messageId: string) => void;
  onCopyToClipboard: (text: string) => void;
  onReportLegalIssueRequest: (message: Message) => void;
  onOpenFeedbackDialog: (message: Message) => void;
  onWebSearch: () => void;
  onSuggestionClick: (suggestion: string) => void;
  activeChat: Conversation | null;
  onRemoveFile: (fileId: string) => void;
}

const webSearchSuggestions = [
    {
        Icon: KeyRound,
        title: "Como alterar uma senha",
        description: "Ajudar um cliente a redefinir o acesso",
    },
    {
        Icon: PiggyBank,
        title: "Como fazer um resgate de previdência",
        description: "Consultar as regras e o procedimento",
    }
];

export function ChatMessageArea({
  messages,
  isLoading,
  error,
  user,
  userName,
  userInitials,
  lastFailedQuery,
  feedbacks,
  regeneratingMessageId,
  messagesEndRef,
  onFeedback,
  onRegenerate,
  onCopyToClipboard,
  onReportLegalIssueRequest,
  onOpenFeedbackDialog,
  onWebSearch,
  onSuggestionClick,
  activeChat,
  onRemoveFile,
}: ChatMessageAreaProps) {
  const activeChatId = activeChat?.id ?? null;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto flex h-full max-w-4xl flex-col">
        {messages.length === 0 && !isLoading ? (
          <div className="flex h-full flex-col items-center justify-center">
            {/* <BobIcon className="mb-6 h-24 w-24" isGreeting={true} /> */}
            <div>
              <div className="text-left">
                <h1 className="flex items-center gap-3 text-4xl font-bold">
                  <span>Olá, {userName.split(' ')[0]}!</span>
                  <Hand className="h-10 w-10 animate-wave" style={{ color: '#DFB87F' }} />
                </h1>
                <p className="mt-2 text-lg text-muted-foreground">
                  Como posso te ajudar hoje?
                </p>
              </div>
              <div className="mt-12">
                <div className="flex items-center justify-between">
                  <p className="text-muted-foreground">
                    Clique em um card para começar ou digite abaixo:
                  </p>
                </div>
                <div id="suggestion-cards" className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                   <Card className="cursor-pointer p-4 transition-colors hover:bg-accent rounded-xl shadow-md h-full" onClick={() => onSuggestionClick("Como acessar o informe de rendimentos")}>
                    <div className="flex items-start gap-4">
                      <FileText className="h-6 w-6 text-muted-foreground" />
                      <div>
                        <p className="font-semibold">Como acessar o informe de rendimentos</p>
                        <p className="text-sm text-muted-foreground">
                          Encontre o passo-a-passo para obter o documento
                        </p>
                      </div>
                    </div>
                  </Card>
                   <Card className="cursor-pointer p-4 transition-colors hover:bg-accent rounded-xl shadow-md h-full" onClick={() => onSuggestionClick('open_prompt_builder')}>
                    <div className="flex items-start gap-4">
                      <Wand2 className="h-6 w-6 text-muted-foreground" />
                      <div>
                        <p className="font-semibold">Análise de Relatório XP</p>
                        <p className="text-sm text-muted-foreground">
                          Use o assistente para extrair dados de relatórios.
                        </p>
                      </div>
                    </div>
                  </Card>
                   {webSearchSuggestions.map((suggestion, index) => (
                      <Card key={index} className="cursor-pointer p-4 transition-colors hover:bg-accent rounded-xl shadow-md h-full" onClick={() => onSuggestionClick(suggestion.title)}>
                        <div className="flex items-start gap-4">
                          <suggestion.Icon className="h-6 w-6 text-muted-foreground" />
                          <div>
                            <p className="font-semibold">{suggestion.title}</p>
                            <p className="text-sm text-muted-foreground">
                              {suggestion.description}
                            </p>
                          </div>
                        </div>
                      </Card>
                   ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {messages.map((msg) => (
              <React.Fragment key={msg.id}>
                {msg.role === 'assistant' ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>
                          <BobIcon className="h-6 w-6" isThinking={regeneratingMessageId === msg.id} />
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-semibold text-foreground">Bob</span>
                    </div>
                    {regeneratingMessageId === msg.id ? (
                      <div className="w-fit rounded-xl bg-muted px-4 py-2">
                          <p className="animate-pulse text-sm italic text-muted-foreground">
                              Bob está pensando...
                          </p>
                      </div>
                    ) : (
                      <>
                        <div className="prose prose-sm dark:prose-invert max-w-none text-foreground">
                          <ReactMarkdown rehypePlugins={[rehypeRaw]}>{msg.content}</ReactMarkdown>
                        </div>
                        {activeChatId && (
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Button variant="ghost" size="icon" className={`h-8 w-8 ${feedbacks[msg.id] === 'positive' ? 'bg-primary/10 text-primary' : ''}`} onClick={() => onFeedback(msg, 'positive')}>
                                <ThumbsUp className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className={`h-8 w-8 ${feedbacks[msg.id] === 'negative' ? 'bg-destructive/10 text-destructive' : ''}`} onClick={() => onFeedback(msg, 'negative')}>
                                <ThumbsDown className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onRegenerate(msg.id)} disabled={isLoading || !!regeneratingMessageId}>
                                <RefreshCw className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onCopyToClipboard(msg.content)}>
                                <Share2 className="h-4 w-4" />
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                  <DropdownMenuItem
                                    onClick={() => onReportLegalIssueRequest(msg)}
                                    className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                                  >
                                    <AlertTriangle className="mr-2 h-4 w-4" />
                                    <span>Informar problema jurídico</span>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                              {feedbacks[msg.id] === 'negative' && (
                                <Button variant="link" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => onOpenFeedbackDialog(msg)}>
                                  Adicionar feedback
                                </Button>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex items-start justify-end gap-4">
                    <div className="max-w-[80%] rounded-xl bg-user-bubble p-3 text-user-bubble-foreground shadow-sm">
                      {msg.fileNames && (
                          <div className="mb-2 flex items-center gap-2 rounded-md border border-border bg-background/50 p-2 text-xs text-muted-foreground">
                              <Paperclip className="h-4 w-4 shrink-0" />
                              <span className="truncate">{msg.fileNames.join(', ')}</span>
                          </div>
                      )}
                      <ReactMarkdown className="prose prose-sm dark:prose-invert max-w-none" rehypePlugins={[rehypeRaw]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                    <Avatar>
                      <AvatarFallback>{userInitials}</AvatarFallback>
                    </Avatar>
                  </div>
                )}
              </React.Fragment>
            ))}
            {isLoading && (
              <div className="flex items-start gap-3">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback>
                    <BobIcon className="h-6 w-6" isThinking />
                  </AvatarFallback>
                </Avatar>
                <div className="w-fit rounded-xl bg-muted px-4 py-2">
                    <p className="animate-pulse text-sm italic text-muted-foreground">
                        Bob está pensando...
                    </p>
                </div>
              </div>
            )}
            {error && !isLoading && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      <BobIcon className="h-6 w-6" hasError={true} />
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-semibold text-foreground">Bob</span>
                </div>
                <div className="rounded-lg border border-destructive bg-destructive/10 p-3 text-destructive-foreground">
                  <p className="text-sm">{error}</p>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}

    

    
