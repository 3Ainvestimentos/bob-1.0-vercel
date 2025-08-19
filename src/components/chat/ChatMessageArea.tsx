
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
import rehypeRaw from 'rehype-raw';

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
            {lastFailedQuery && !isLoading && (
              <div className="flex justify-center pt-4">
                <Button variant="secondary" onClick={onWebSearch} disabled={isLoading} className="rounded-full shadow-md">
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
