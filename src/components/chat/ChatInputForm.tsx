
'use client';

import { transcribeLiveAudio } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { File, Mic, Paperclip, SendHorizontal, X, Lock, Trash2, Square, Loader2 } from 'lucide-react';
import React, { FormEvent, useCallback, useRef, useState, useEffect } from 'react';
import TextareaAutosize from 'react-textarea-autosize';

const CustomSoundWave = ({ analyser, isVisible }: { analyser: AnalyserNode | null, isVisible: boolean }) => {
    const canvasRef = useRef<HTMLDivElement>(null);
    const animationFrameRef = useRef<number>();

    useEffect(() => {
        if (!analyser || !isVisible) {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            return;
        };

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            animationFrameRef.current = requestAnimationFrame(draw);
            analyser.getByteTimeDomainData(dataArray);

            if (canvasRef.current) {
                const bars = Array.from(canvasRef.current.children) as HTMLDivElement[];
                
                let sum = 0;
                for (let i = 0; i < bufferLength; i++) {
                    sum += Math.abs(dataArray[i] - 128);
                }
                const avg = sum / bufferLength;
                
                const barHeight = (avg / 128) * 100 * 2.5;

                for (let i = 0; i < bars.length; i++) {
                    const randomizedHeight = barHeight * (0.8 + Math.random() * 0.4);
                    bars[i].style.height = `${Math.min(Math.max(randomizedHeight, 2), 100)}%`; 
                }
            }
        };

        draw();

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [analyser, isVisible]);
    
    if (!isVisible) return null;

    return (
        <div 
            ref={canvasRef} 
            className="flex items-center justify-center gap-px h-full w-full"
        >
            {Array.from({ length: 32 }).map((_, i) => (
                <div
                    key={i}
                    className="w-1 bg-primary rounded-full"
                    style={{ height: '2%', transition: 'height 0.1s ease-out' }}
                />
            ))}
        </div>
    );
};


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
  
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'locked' | 'transcribing'>('idle');
  const [recordingTime, setRecordingTime] = useState(0);
  const [isDragToLockActive, setIsDragToLockActive] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const recordingStartTimeRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  const cleanupRecording = useCallback(() => {
    if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    silenceTimerRef.current = null;
    recordingTimerRef.current = null;
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
    }
    
    if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
    }

    mediaRecorderRef.current = null;
    audioStreamRef.current = null;
    analyserRef.current = null;
    audioChunksRef.current = [];
    recordingStartTimeRef.current = null;
    setRecordingTime(0);
    setIsDragToLockActive(false);
  }, []);
  
  const processAndTranscribeAudio = useCallback(async () => {
    if (audioChunksRef.current.length === 0) {
        setRecordingState('idle');
        cleanupRecording();
        return;
    }

    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm; codecs=opus' });
    if (audioBlob.size === 0) {
        setRecordingState('idle');
        cleanupRecording();
        return;
    }

    setRecordingState('transcribing');

    const reader = new FileReader();
    reader.readAsDataURL(audioBlob);
    reader.onloadend = async () => {
        const base64Audio = reader.result?.toString().split(',')[1];
        if (base64Audio) {
            try {
                const transcribedText = await transcribeLiveAudio(base64Audio);
                setInput(prev => prev ? `${prev} ${transcribedText}`.trim() : transcribedText);
            } catch (error: any) {
                toast({ variant: "destructive", title: "Erro na Transcrição", description: error.message });
            } finally {
                setRecordingState('idle');
            }
        } else {
            setRecordingState('idle');
        }
    };
  }, [cleanupRecording, setInput, toast]);

  const stopRecording = useCallback(() => {
    if (recordingState === 'idle' || recordingState === 'transcribing') return;

    if (mediaRecorderRef.current?.state === 'recording') {
        processAndTranscribeAudio();
    }
    
    cleanupRecording();
    setRecordingState('idle');
  }, [recordingState, cleanupRecording, processAndTranscribeAudio]);

  const startRecording = useCallback(async (isLockedMode: boolean) => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          toast({ variant: "destructive", title: "Erro", description: "Seu navegador não suporta a gravação de áudio." });
          return;
      }

      try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          audioStreamRef.current = stream;
          
          const audioContext = new AudioContext();
          const source = audioContext.createMediaStreamSource(stream);
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          analyserRef.current = analyser;

          setRecordingState(isLockedMode ? 'locked' : 'recording');
          
          mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm; codecs=opus' });
          audioChunksRef.current = [];
          recordingStartTimeRef.current = Date.now();

          mediaRecorderRef.current.ondataavailable = (event) => {
              if (event.data.size > 0) audioChunksRef.current.push(event.data);
          };
          
          mediaRecorderRef.current.start(250); 

          if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = setInterval(() => {
              const seconds = Math.floor((Date.now() - (recordingStartTimeRef.current || 0)) / 1000);
              setRecordingTime(seconds);
          }, 1000);

          if (!isLockedMode) {
            let lastSpoke = Date.now();
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            
            const checkSilence = () => {
                if (mediaRecorderRef.current?.state !== 'recording' || !analyserRef.current) {
                    if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
                    return;
                }

                analyserRef.current.getByteTimeDomainData(dataArray);
                let sum = 0;
                for(let i = 0; i < dataArray.length; i++) sum += Math.abs(dataArray[i] - 128);
                const avg = sum / dataArray.length;

                if (avg > 2.5) lastSpoke = Date.now();
                if (Date.now() - lastSpoke > 2000) {
                    stopRecording();
                }
            };
            if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
            silenceTimerRef.current = setInterval(checkSilence, 200);
          }

      } catch (err: any) {
          console.error("Error accessing microphone:", err);
          let description = `Ocorreu um erro inesperado: ${err.message}`;
          if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
              description = "Não foi possível encontrar um microfone. Verifique se ele está conectado e habilitado.";
          } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
              description = "Por favor, habilite o acesso ao microfone nas configurações do seu navegador para usar esta funcionalidade.";
          }
          toast({ variant: "destructive", title: "Erro de Microfone", description });
          cleanupRecording();
          setRecordingState('idle');
      }
  }, [toast, stopRecording, cleanupRecording]);

  const handleSimpleClick = () => {
    if (recordingState === 'recording') {
        stopRecording();
    } else if (recordingState === 'idle') {
        startRecording(false);
    }
  };

  const handleMouseDown = () => {
    if (recordingState === 'idle') {
        setIsDragToLockActive(true);
    }
  };
  
  const handleMouseUpOnLock = () => {
    if (isDragToLockActive) {
        setIsDragToLockActive(false);
        startRecording(true); // Lock the recording
    }
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragToLockActive) {
        setIsDragToLockActive(false);
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragToLockActive]);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  const isAudioSelected = selectedFiles.length > 0 && selectedFiles[0].type.startsWith('audio/');
  const isRecordingActive = recordingState === 'recording' || recordingState === 'locked';
  const isTranscribing = recordingState === 'transcribing';

  const renderBottomBarContent = () => {
    if (isTranscribing) {
        return (
            <div className="flex h-full w-full items-center justify-center px-2">
                <p className="text-sm text-muted-foreground animate-pulse">Transcrevendo...</p>
            </div>
        );
    }

    if (recordingState === 'locked') {
        return (
            <div className="flex w-full items-center min-h-[inherit]">
                <div className="flex items-center gap-2">
                    <Button type="button" variant="destructive" size="icon" className="h-8 w-8" onClick={stopRecording}>
                        <Trash2 className="h-4 w-4"/>
                    </Button>
                    <Button type="button" size="icon" className="h-8 w-8 bg-green-500 hover:bg-green-600" onClick={stopRecording}>
                        <SendHorizontal className="h-4 w-4" />
                    </Button>
                </div>
                <div className="flex-1 flex items-center justify-center h-full px-4">
                   <CustomSoundWave analyser={analyserRef.current} isVisible={true} />
                </div>
                <div className="flex items-center">
                    <span className="font-mono text-sm text-muted-foreground">{formatTime(recordingTime)}</span>
                </div>
            </div>
        );
    }

    if (recordingState === 'recording') {
        return (
            <div className="flex h-full w-full items-center justify-between px-2">
                 <div className="flex-1 px-2 h-full">
                    <CustomSoundWave analyser={analyserRef.current} isVisible={true} />
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-500 bg-red-500/10"
                    onClick={stopRecording}
                >
                    <Square className="h-4 w-4" />
                </Button>
            </div>
        );
    }
    
    // Default idle state
    return (
        <div className="flex items-center w-full">
            <input
                type="file"
                multiple={true}
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept=".pdf,.doc,.docx,text/plain,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,audio/*,.ogg,.opus"
                disabled={isLoading}
            />
             <div className="flex items-center">
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
            </div>
            <div className="flex-1 flex items-center h-full">
                <div className="w-full h-full relative flex items-center">
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground"
                        disabled={isLoading}
                        onClick={handleSimpleClick}
                        onMouseDown={handleMouseDown}
                        title={"Gravar áudio (clique) ou segure para travar"}
                    >
                        <Mic className="h-5 w-5" />
                    </Button>
                    {isDragToLockActive && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground animate-pulse"
                            onMouseUp={handleMouseUpOnLock}
                        >
                           <Lock className="h-5 w-5" />
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
  };


  return (
    <div className="sticky bottom-0 w-full bg-background/95 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="px-4 pb-4 pt-2 sm:px-6 lg:px-8"
      >
        <div className={cn("rounded-lg border bg-background shadow-sm")}>
           <div className={cn("grid transition-all duration-300 ease-in-out", 
                selectedFiles.length > 0 && recordingState === 'idle' 
                ? 'grid-rows-[1fr] opacity-100' 
                : 'grid-rows-[0fr] opacity-0'
            )}>
                <div className="overflow-hidden">
                    <div className="p-2 space-y-1">
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
                </div>
            </div>
          <div className="relative flex min-h-[60px] items-start">
            <TextareaAutosize
                ref={inputRef}
                placeholder={
                    isRecordingActive ? "Gravando..." :
                    isTranscribing ? "Aguarde a transcrição..." :
                    isAudioSelected ? "Opcional: adicione um comando ou pergunta sobre o áudio" : 
                    "Insira aqui um comando ou pergunta"
                }
                className="min-h-[60px] flex-1 resize-none border-0 bg-transparent p-3 pr-12 text-base focus-visible:ring-0"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        if (e.currentTarget.form) e.currentTarget.form.requestSubmit();
                    }
                }}
                disabled={isLoading || isAudioSelected || isRecordingActive || isTranscribing}
                rows={1}
                maxRows={8}
                />
            <Button
              type="submit"
              size="icon"
              variant="ghost"
              className="absolute right-3 top-3 h-8 w-8 rounded-full text-muted-foreground"
              disabled={isLoading || isRecordingActive || isTranscribing || (!input.trim() && selectedFiles.length === 0)}
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <SendHorizontal className="h-5 w-5 -rotate-45 transform" />
              )}
            </Button>
          </div>
          <Separator />
          <div className="flex h-[40px] items-center p-2 relative">
             {renderBottomBarContent()}
          </div>
        </div>
        <p className="pt-2 text-center text-xs text-muted-foreground">
          Sujeito aos Termos de uso 3A RIVA e à Política de Privacidade da 3A RIVA. O modelo Bob 1.0 pode cometer erros. Por isso, é bom checar as respostas.
        </p>
      </form>
    </div>
  );
}
