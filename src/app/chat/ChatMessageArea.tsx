
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
  Lightbulb,
  Mail,
  MoreHorizontal,
  Newspaper,
  Paperclip,
  Pin,
  RefreshCw,
  Search,
  Share2,
  ThumbsDown,
  ThumbsUp,
  X,
  TrendingUp,
  Briefcase,
  BookOpen,
  Hand,
} from 'lucide-react';
import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { BobIcon } from '@/components/icons/BobIcon';
import { Badge } from '../ui/badge';

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
        Icon: Mail,
        title: "Criar campanha de e-mail",
        description: "para vendas de fim de ano",
    },
    {
        Icon: Lightbulb,
        title: "Preparar tópicos",
        description: "para uma entrevista sobre vida de nômade digital",
    },
    {
        Icon: FileText,
        title: "Analisar um novo artigo",
        description: "Resumir e destacar pontos chave de um artigo científico",
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
  const attachedFiles = activeChat?.attachedFiles ?? [];

  const initialSuggestions = useMemo(() => {
    const shuffled = [...webSearchSuggestions].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 3);
  }, []);

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
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                   <Card className="cursor-pointer p-4 transition-colors hover:bg-accent rounded-xl shadow-md" onClick={() => onSuggestionClick("Faça uma mensagem e uma análise com o nosso padrão")}>
                    <div className="flex items-start gap-4">
                      <FileText className="h-6 w-6 text-muted-foreground" />
                      <div>
                        <p className="font-semibold">Análise de Posição Consolidada</p>
                        <p className="text-sm text-muted-foreground">
                          Analisar um relatório de investimentos com o padrão 3A RIVA.
                        </p>
                      </div>
                    </div>
                  </Card>
                   {initialSuggestions.map((suggestion, index) => (
                      <Card key={index} className="cursor-pointer p-4 transition-colors hover:bg-accent rounded-xl shadow-md" onClick={() => onSuggestionClick(suggestion.title)}>
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
                      <div className="w-full max-w-md rounded-lg bg-muted p-4">
                        <p className="animate-pulse text-sm italic text-muted-foreground">
                          Bob está pensando...
                        </p>
                        <div className="mt-3 space-y-2">
                          <Skeleton className="h-4 w-full" />
                          <Skeleton className="h-4 w-4/5" />
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="prose prose-sm dark:prose-invert max-w-none text-foreground">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
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
                      <ReactMarkdown className="prose prose-sm dark:prose-invert max-w-none">
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
                <div className="w-full max-w-md rounded-lg bg-muted p-4">
                  <p className="animate-pulse text-sm italic text-muted-foreground">
                    Bob está pensando...
                  </p>
                  <div className="mt-3 space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-4 w-11/12" />
                  </div>
                </div>
              </div>
            )}
            {lastFailedQuery && !isLoading && (
              <div className="flex justify-center pt-4">
                <Button onClick={onWebSearch} disabled={isLoading}>
                  <Search className="mr-2 h-4 w-4" />
                  Pesquisar na Web
                </Button>
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
