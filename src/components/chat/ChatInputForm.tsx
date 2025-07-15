
'use client';

import { transcribeLiveAudio } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { File, Mic, Paperclip, SendHorizontal, Square, X } from 'lucide-react';
import React, { FormEvent, useCallback, useRef, useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import dynamic from 'next/dynamic';

const LiveAudioVisualizer = dynamic(
  () =>
    import('react-audio-visualize').then((mod) => mod.LiveAudioVisualizer),
  { ssr: false }
);


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
  const { toast } = useToast();

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const animationFrameRef = useRef<number | null>(null);


  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const files = Array.from(event.target.files);
      const audioFile = files.find(file => file.type.startsWith('audio/'));
      
      if (audioFile) {
        setSelectedFiles([audioFile]);
      } else {
        setSelectedFiles(prev => [...prev, ...files].filter(
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
  
  const stopRecording = useCallback(() => {
    if (silenceTimerRef.current) {
        clearInterval(silenceTimerRef.current);
        silenceTimerRef.current = null;
    }
    if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
    }
    if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
        audioStreamRef.current = null;
    }
    setIsRecording(false);
    setIsTranscribing(true);
  }, []);

  const handleMicClick = async () => {
    if (isRecording) {
        stopRecording();
        return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast({
            variant: "destructive",
            title: "Erro",
            description: "Seu navegador não suporta a gravação de áudio.",
        });
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioStreamRef.current = stream;
        setIsRecording(true);

        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        analyserRef.current = analyser;
        dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);


        mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm; codecs=opus' });
        audioChunksRef.current = [];

        mediaRecorderRef.current.ondataavailable = (event) => {
            audioChunksRef.current.push(event.data);
        };

        mediaRecorderRef.current.onstop = async () => {
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm; codecs=opus' });
            
            if (audioBlob.size === 0) {
                toast({ title: "Nenhum áudio gravado.", description: "A gravação foi muito curta." });
                setIsTranscribing(false);
                return;
            }

            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = async () => {
                const base64Audio = reader.result?.toString().split(',')[1];
                if (base64Audio) {
                    try {
                        const transcribedText = await transcribeLiveAudio(base64Audio);
                        setInput(transcribedText);
                    } catch (error: any) {
                        toast({ variant: "destructive", title: "Erro na Transcrição", description: error.message });
                    } finally {
                        setIsTranscribing(false);
                    }
                } else {
                     setIsTranscribing(false);
                }
            };
        };
        
        mediaRecorderRef.current.start();

        // --- Silence Detection ---
        let lastSpoke = Date.now();
        
        const checkSilence = () => {
            if (mediaRecorderRef.current?.state !== 'recording' || !analyserRef.current || !dataArrayRef.current) return;

            analyserRef.current.getByteTimeDomainData(dataArrayRef.current);
            const isSilent = dataArrayRef.current.every(v => v === 128);

            if (!isSilent) {
                lastSpoke = Date.now();
            }

            if (Date.now() - lastSpoke > 2000) { // 2 seconds of silence
                stopRecording();
            } else {
                animationFrameRef.current = requestAnimationFrame(checkSilence);
            }
        };
        checkSilence();

    } catch (err: any) {
        console.error("Error accessing microphone:", err);
        if (err.name === 'NotFoundError') {
            toast({
                variant: "destructive",
                title: "Microfone não encontrado",
                description: "Não foi possível encontrar um microfone. Verifique se ele está conectado e habilitado.",
            });
        } else {
            toast({
                variant: "destructive",
                title: "Acesso ao Microfone Negado",
                description: "Por favor, habilite o acesso ao microfone nas configurações do seu navegador para usar esta funcionalidade.",
            });
        }
        setIsRecording(false);
    }
  };
  
  const isAudioSelected = selectedFiles.length > 0 && selectedFiles[0].type.startsWith('audio/');

  return (
    <div className="sticky bottom-0 w-full bg-background/95 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="px-4 pb-4 pt-2 sm:px-6 lg:px-8"
      >
        <div className={cn("rounded-lg border bg-background shadow-sm", selectedFiles.length > 0 && "relative pb-10", (isRecording || isTranscribing) && "pb-12")}>
          {(isRecording || isTranscribing) && (
             <div className="flex h-10 items-center justify-center gap-3 px-4 pt-2">
                {isRecording && mediaRecorderRef.current && (
                    <LiveAudioVisualizer
                        mediaRecorder={mediaRecorderRef.current}
                        width={200}
                        height={35}
                        barWidth={2}
                        gap={2}
                        barColor={'hsl(var(--primary))'}
                    />
                )}
                {isTranscribing && (
                    <p className="text-sm text-muted-foreground animate-pulse">Transcrevendo áudio...</p>
                )}
            </div>
          )}

          {selectedFiles.length > 0 && !isRecording && !isTranscribing && (
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
              placeholder={
                isRecording ? "Ouvindo..." : 
                isTranscribing ? "Aguarde a transcrição..." :
                isAudioSelected ? "Opcional: adicione um comando ou pergunta sobre o áudio" : 
                "Insira aqui um comando ou pergunta"
              }
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
              disabled={isLoading || isAudioSelected || isRecording || isTranscribing}
              rows={1}
              maxRows={8}
            />
            <Button
              type="submit"
              size="icon"
              variant="ghost"
              className="absolute right-3 top-3 h-8 w-8 rounded-full text-muted-foreground"
              disabled={isLoading || isRecording || isTranscribing || (!input.trim() && selectedFiles.length === 0)}
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
              accept=".pdf,.doc,.docx,text/plain,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,audio/*,.ogg,.opus"
              disabled={isLoading || isRecording || isTranscribing}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              disabled={isLoading || isRecording || isTranscribing}
              onClick={handleAttachClick}
              title={"Anexar arquivo(s)"}
            >
              <Paperclip className="h-5 w-5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8 text-muted-foreground", isRecording && "bg-destructive/20 text-destructive")}
              disabled={isLoading || isTranscribing}
              onClick={handleMicClick}
              title={isRecording ? "Parar gravação" : "Gravar áudio"}
            >
              {isRecording ? <Square className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
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
