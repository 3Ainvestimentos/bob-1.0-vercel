
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
} from 'lucide-react';
import React from 'react';
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
  suggestions: string[];
  isSuggestionsLoading: boolean;
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

export function ChatMessageArea({
  messages,
  isLoading,
  error,
  user,
  userName,
  userInitials,
  lastFailedQuery,
  feedbacks,
  suggestions,
  isSuggestionsLoading,
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

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto flex h-full max-w-4xl flex-col">
        {attachedFiles.length > 0 && (
            <div className="sticky top-0 z-10 mb-4 flex flex-wrap justify-center gap-2 bg-background/80 py-2 backdrop-blur-sm">
                 {attachedFiles.map(file => (
                    <Badge key={file.id} variant="secondary" className="flex items-center gap-1 p-1 pl-2 text-sm">
                        <Pin className="h-3 w-3" />
                        <span className="font-semibold">{file.fileName}</span>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 rounded-full"
                            onClick={() => onRemoveFile(file.id)}
                        >
                            <X className="h-3 w-3" />
                        </Button>
                    </Badge>
                ))}
            </div>
        )}
        {messages.length === 0 && !isLoading ? (
          <div className="flex h-full flex-col items-center justify-center">
            <BobIcon className="mb-6 h-24 w-24" isGreeting={true} />
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
                        <p className="font-semibold">Buscar notícias sobre IA</p>
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
                        <p className="font-semibold">Criar campanha de e-mail</p>
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
                        <p className="font-semibold">Analisar um novo artigo</p>
                        <p className="text-sm text-muted-foreground">
                          Resumir e destacar pontos chave de um artigo científico
                        </p>
                      </div>
                    </div>
                  </Card>
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
                            <div className="text-xs text-muted-foreground">
                              {typeof msg.promptTokenCount === 'number' && typeof msg.candidatesTokenCount === 'number'
                                ? `Tokens usados: ${msg.promptTokenCount + msg.candidatesTokenCount}`
                                : ''}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex items-start justify-end gap-4">
                    <div className="max-w-[80%] rounded-xl bg-accent p-3 text-accent-foreground shadow-sm">
                      {msg.fileNames && (
                          <div className="mb-2 flex items-center gap-2 rounded-md border border-border bg-background/50 p-2 text-xs">
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
                        onClick={() => onSuggestionClick(s)}
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
  );
}
