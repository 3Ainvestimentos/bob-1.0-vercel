
'use client';

import { transcribeLiveAudio } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { File, Mic, Paperclip, SendHorizontal, X } from 'lucide-react';
import React, { FormEvent, useCallback, useRef, useState, useEffect } from 'react';
import TextareaAutosize from 'react-textarea-autosize';

const CustomSoundWave = ({ analyser, onClick }: { analyser: AnalyserNode | null, onClick: () => void }) => {
    const canvasRef = useRef<HTMLDivElement>(null);
    const animationFrameRef = useRef<number>();

    useEffect(() => {
        if (!analyser) return;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            animationFrameRef.current = requestAnimationFrame(draw);
            analyser.getByteFrequencyData(dataArray);

            if (canvasRef.current) {
                const bars = Array.from(canvasRef.current.children) as HTMLDivElement[];
                
                for (let i = 0; i < bars.length; i++) {
                    const barHeight = (dataArray[i] / 255) * 100;
                    bars[i].style.height = `${Math.max(barHeight, 5)}%`; 
                }
            }
        };

        draw();

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [analyser]);
    
    return (
        <div 
            ref={canvasRef} 
            className="flex items-center justify-center gap-px h-full w-full cursor-pointer"
            onClick={onClick}
        >
            {Array.from({ length: 32 }).map((_, i) => (
                <div
                    key={i}
                    className="w-1 bg-primary rounded-full"
                    style={{ height: '5%', transition: 'height 0.1s ease-out' }}
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

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const recordingStartTimeRef = useRef<number | null>(null);


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
    analyserRef.current = null;
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
        
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        analyserRef.current = analyser;

        setIsRecording(true);

        mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm; codecs=opus' });
        audioChunksRef.current = [];
        recordingStartTimeRef.current = Date.now();

        mediaRecorderRef.current.ondataavailable = (event) => {
            audioChunksRef.current.push(event.data);
        };

        mediaRecorderRef.current.onstop = async () => {
            const recordingEndTime = Date.now();
            const duration = recordingStartTimeRef.current ? (recordingEndTime - recordingStartTimeRef.current) / 1000 : 0;

            if (duration < 5) {
                toast({ 
                    title: "Gravação muito curta", 
                    description: "Por favor, grave por pelo menos 5 segundos para que a transcrição funcione." 
                });
                setIsTranscribing(false);
                recordingStartTimeRef.current = null;
                return;
            }

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
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        
        const checkSilence = () => {
            if (mediaRecorderRef.current?.state !== 'recording' || !analyserRef.current) {
                return;
            }

            analyserRef.current.getByteTimeDomainData(dataArray);
            let sum = 0;
            for(let i = 0; i < dataArray.length; i++) {
                sum += Math.abs(dataArray[i] - 128);
            }
            const avg = sum / dataArray.length;

            if (avg > 2) { // Threshold for speech
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
        if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            toast({
                variant: "destructive",
                title: "Microfone não encontrado",
                description: "Não foi possível encontrar um microfone. Verifique se ele está conectado e habilitado.",
            });
        } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            toast({
                variant: "destructive",
                title: "Acesso ao Microfone Negado",
                description: "Por favor, habilite o acesso ao microfone nas configurações do seu navegador para usar esta funcionalidade.",
            });
        } else {
             toast({
                variant: "destructive",
                title: "Erro de Microfone",
                description: `Ocorreu um erro inesperado: ${err.message}`,
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
        <div className={cn("rounded-lg border bg-background shadow-sm", selectedFiles.length > 0 && "relative pb-10")}>
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
                isRecording ? "Ouvindo... Clique na animação para parar." : 
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
          <div className="flex h-[40px] items-center p-2 relative">
              <div className={cn("absolute inset-0 flex items-center p-2 transition-opacity duration-300", isRecording || isTranscribing ? "opacity-0" : "opacity-100")}>
                  <input
                      type="file"
                      multiple={true}
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      className="hidden"
                      accept=".pdf,.doc,.docx,text/plain,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,audio/*,.ogg,.opus"
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
                      onClick={handleMicClick}
                      title={"Gravar áudio"}
                  >
                      <Mic className="h-5 w-5" />
                  </Button>
              </div>

              <div className={cn("absolute inset-0 flex items-center p-2 transition-opacity duration-300", isRecording ? "opacity-100" : "opacity-0 pointer-events-none")}>
                  {isRecording && <CustomSoundWave analyser={analyserRef.current} onClick={stopRecording} />}
              </div>

              <div className={cn("absolute inset-0 flex items-center p-2 transition-opacity duration-300", isTranscribing ? "opacity-100" : "opacity-0 pointer-events-none")}>
                  <div className="flex h-full w-full items-center justify-start">
                      <p className="text-sm text-muted-foreground animate-pulse">Transcrevendo...</p>
                  </div>
              </div>
          </div>
        </div>
        <p className="pt-2 text-center text-xs text-muted-foreground">
          Sujeito aos Termos de uso 3A RIVA e à Política de Privacidade da 3A RIVA. O modelo Bob 1.0 pode cometer erros. Por isso, é bom checar as respostas.
        </p>
      </form>
    </div>
  );
}
