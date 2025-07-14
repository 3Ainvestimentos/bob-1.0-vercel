
'use client';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { File, Mic, Paperclip, SendHorizontal, X } from 'lucide-react';
import React, { FormEvent, useRef } from 'react';
import TextareaAutosize from 'react-textarea-autosize';

interface ChatInputFormProps {
  input: string;
  setInput: (value: string) => void;
  handleSubmit: (e: FormEvent) => void;
  isLoading: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  selectedFiles: File[];
  setSelectedFiles: (files: File[]) => void;
}

export function ChatInputForm({
  input,
  setInput,
  handleSubmit,
  isLoading,
  inputRef,
  selectedFiles,
  setSelectedFiles,
}: ChatInputFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const files = Array.from(event.target.files);
      const audioFile = files.find(file => file.type.startsWith('audio/'));
      
      // If an audio file is selected, only keep that one.
      if (audioFile) {
        setSelectedFiles([audioFile]);
      } else {
        // Otherwise, add new files to existing (if any)
        setSelectedFiles(prev => [...prev, ...files].filter(
          // prevent duplicates
          (file, index, self) => index === self.findIndex(f => f.name === file.name && f.size === file.size)
        ));
      }
    }
  };

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleRemoveFile = (fileNameToRemove: string) => {
    setSelectedFiles(selectedFiles.filter(file => file.name !== fileNameToRemove));
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  };
  
  const isAudioSelected = selectedFiles.length > 0 && selectedFiles[0].type.startsWith('audio/');

  return (
    <div className="sticky bottom-0 w-full bg-background/95 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="px-4 pb-4 pt-2 sm:px-6 lg:px-8"
      >
        <div className={cn("rounded-lg border bg-background shadow-sm", selectedFiles.length > 0 && "relative pb-10")}>
          {selectedFiles.length > 0 && (
            <div className="absolute bottom-11 left-2 w-[calc(100%-1rem)] p-2 space-y-1">
                {selectedFiles.map(file => (
                  <Badge key={file.name} variant="secondary" className="flex max-w-full items-center justify-between gap-2 pl-2 pr-1">
                      <div className="flex items-center gap-2 overflow-hidden">
                          <File className="h-4 w-4 shrink-0"/>
                          <span className="truncate text-xs">{file.name}</span>
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="h-5 w-5 shrink-0 rounded-full" onClick={() => handleRemoveFile(file.name)}>
                          <X className="h-3 w-3" />
                      </Button>
                  </Badge>
                ))}
            </div>
          )}
          <div className="relative flex min-h-[60px] items-start">
            <TextareaAutosize
              ref={inputRef}
              placeholder={isAudioSelected ? "Opcional: adicione um comando ou pergunta sobre o áudio" : "Insira aqui um comando ou pergunta"}
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
              disabled={isLoading || isAudioSelected}
              rows={1}
              maxRows={8}
            />
            <Button
              type="submit"
              size="icon"
              variant="ghost"
              className="absolute right-3 top-3 h-8 w-8 rounded-full text-muted-foreground"
              disabled={isLoading || (!input.trim() && selectedFiles.length === 0)}
            >
              <SendHorizontal className="h-5 w-5" />
            </Button>
          </div>
          <Separator />
          <div className="flex items-center p-2">
            <input
              type="file"
              multiple={true}
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept=".pdf,.doc,.docx,text/plain,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,audio/*"
              disabled={isLoading}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              disabled={isLoading}
              onClick={handleAttachClick}
              title={"Anexar arquivo(s)"}
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
  );
}
