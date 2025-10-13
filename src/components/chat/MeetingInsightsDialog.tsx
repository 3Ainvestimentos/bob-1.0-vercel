"use client";

import { useState, ChangeEvent, DragEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, FileText, Lightbulb, MessageSquareQuote, UploadCloud, X, Info } from "lucide-react";
import { analyzeMeetingTranscript } from "@/app/actions";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface MeetingInsightsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onMeetingAnalyzed: (files: File[]) => void; // Remover parâmetros extras
}

type AnalysisType = 'summary' | 'detailed';
type AnalysisFocus = 'general' | 'opportunities' | 'action-items';

export function MeetingInsightsDialog({ isOpen, onClose, onMeetingAnalyzed }: MeetingInsightsDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0) {
      const docxFile = Array.from(droppedFiles).find(file => 
        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
        file.name.toLowerCase().endsWith('.docx')
      );
      
      if (docxFile) {
        setFile(docxFile);
        setError(null);
      }
    }
  };

  const handleAnalyze = async () => {
    if (!file) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      // Enviar diretamente para o chat
      onMeetingAnalyzed([file]);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setError(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent 
        className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0"
        style={{ borderRadius: '10px' }}
      >
        <DialogHeader className='p-6 pb-2 border-b shrink-0'>
          <div className="flex items-center gap-3">
            <MessageSquareQuote className="h-6 w-6" />
            <DialogTitle className="text-xl">Análise de Reunião com IA</DialogTitle>
          </div>
          <DialogDescription className="pb-4">
            Anexe uma transcrição de reunião (.docx) para análise geral.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
            <input 
              id="meeting-file-upload" 
              type="file" 
              accept=".docx" 
              className="hidden" 
              onChange={handleFileChange} 
            />
            <div 
              className={cn(
                "flex flex-col border-2 border-dashed border-muted-foreground/30 rounded-xl p-6 text-center h-full transition-colors",
                isDraggingOver && 'border-primary bg-primary/10'
              )}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              {!file ? (
                <div className="flex flex-col items-center justify-center h-full">
                  <UploadCloud className="h-16 w-16 text-muted-foreground/50 mb-4" style={{ strokeWidth: 1.5 }} />
                  <h3 className="font-semibold text-lg text-foreground">Anexar Transcrição da Reunião</h3>
                  <p className="text-muted-foreground text-sm mb-6">Arraste e solte o arquivo .docx aqui ou clique para selecionar.</p>
                  <Button type="button" variant="outline" onClick={() => document.getElementById('meeting-file-upload')?.click()}>
                    <FileText className="mr-2 h-4 w-4" />
                    Selecionar Arquivo .docx
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col h-full w-full">
                  <h3 className="font-semibold text-lg text-left text-foreground mb-4">Arquivo Anexado</h3>
                  <div className="flex items-center justify-between bg-muted p-3 rounded-lg text-sm">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                      <span className="font-medium text-foreground truncate">{file.name}</span>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0" 
                      onClick={() => setFile(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-4" 
                    onClick={() => document.getElementById('meeting-file-upload')?.click()}
                  >
                    Trocar arquivo
                  </Button>
                </div>
              )}
            </div>
            
            <div className="space-y-6 flex flex-col justify-between">
              <div className="text-center">
                <h3 className="font-semibold text-lg mb-2">Análise Geral</h3>
                <p className="text-muted-foreground text-sm">
                  Análise completa da reunião com foco em oportunidades de negócio.
                </p>
              </div>
              
              <Button 
                onClick={handleAnalyze} 
                disabled={!file || isAnalyzing}
                className="w-full"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analisando...
                  </>
                ) : (
                  'Analisar Reunião'
                )}
              </Button>
            </div>
          </div>

          {/* Erro */}
          {error && (
            <div className="mt-6 p-4 bg-destructive/10 border border-destructive/20 rounded-md">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}