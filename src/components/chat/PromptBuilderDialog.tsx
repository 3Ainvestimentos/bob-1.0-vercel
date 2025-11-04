
'use client';

import { useState, useMemo, ChangeEvent, DragEvent, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ChatInputForm } from './ChatInputForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { extractDataFromXpReport } from '@/app/actions';
import { extractReportData, analyzeReportAuto, analyzeReportPersonalized, batchAnalyzeReports, analyzeReportPersonalizedFromData, ultraBatchAnalyzeReports } 
from '@/app/actions';import { useToast } from '@/hooks/use-toast';
import { UploadCloud, FileText, Loader2, Wand2, AlertTriangle, MessageSquareQuote, CalendarDays, BarChart, TrendingUp, TrendingDown, Star, X, Info, ChevronsRight, ChevronsDown, Repeat, Layers, Gem, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ExtractedData } from '@/types';
import { useAuth } from '@/context/AuthProvider';
import { getFirestore, doc, onSnapshot, collection, query, orderBy } from 'firebase/firestore';


function convertMarkdownToCodeBlock(content: string): string {
    //console.log('🔍 DEBUG PromptBuilderDialog.tsx- convertMarkdownToCodeBlock INPUT:', JSON.stringify(content));
    
    // Se o conteúdo já está em bloco de código, manter como está (SEM ESCAPE)
    if (content.includes('```')) {
        //console.log('🔍 DEBUG PromptBuilderDialog.tsx- Já está em bloco de código, mantendo original');
        return content; // MANTER ORIGINAL, SEM ESCAPE
    }
    
    // Se o conteúdo parece ser markdown de relatório (contém emojis específicos)
    if (content.includes('🔎') || content.includes('✅') || content.includes('⚠️') || content.includes('🌎')) {
        //console.log('🔍 DEBUG PromptBuilderDialog.tsx- Convertendo markdown para bloco de código SEM escape');
        // NÃO ESCAPAR - manter markdown literal
        return `\`\`\`\n${content}\n\`\`\``;
    }
    
    // Se não for relatório, manter como markdown puro
    //console.log('🔍 DEBUG PromptBuilderDialog.tsx- Mantendo como markdown puro');
    return content;
}

    
// ============= HELPER FUNCTION =============
const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove o prefixo "data:application/pdf;base64,"
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

// ---- Types ----

type Asset = { asset: string; return: string; cdiPercentage: string; reason?: string; };

type AssetClassPerformance = { 
    className: string; 
    return: string; 
    cdiPercentage: string; 
};


type SelectedFields = {
    [key in keyof Omit<ExtractedData, 'classPerformance' | 'benchmarkValues'>]?: boolean | { [category: string]: { [index: number]: boolean } };
} & {
    classPerformance?: { [className: string]: boolean };
};

type PromptBuilderPhase = 'upload' | 'loading' | 'selection' | 'error';
type AnalysisType = 'individual' | 'batch' | 'ultra_batch';
type PersonalizePrompt = 'yes' | 'no';
type AssetAnalysisView = 'asset' | 'class';


interface PromptBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAnalysisResult: (prompt: string, fileNames?: string[]) => void;
  onBatchSubmit: (files: File[]) => void;
  onStartUltraBatch: (files: File[]) => void; // 🔗 Nova prop: delega início do ultra batch para ChatPage
  activeChatId?: string | null; // 🔗 PADRÃO DE PONTEIRO: ID do chat ativo (opcional)
}

const BATCH_LIMIT = 5;
const ULTRA_BATCH_LIMIT = 100;

const assetClassBenchmarks: Record<string, keyof ExtractedData['benchmarkValues']> = {
    'Pre Fixado': 'CDI',
    'Pós Fixado': 'CDI',
    'Multimercado': 'CDI',
    'Alternativo': 'CDI',
    'Fundo Listado': 'CDI',
    'Renda Fixa Brasil': 'CDI',
    'Renda Variável Brasil': 'Ibovespa',
    'Inflação': 'IPCA',
    'Renda Variável Global': 'Dólar',
    'Renda Fixa Global': 'Dólar',
};

const findBenchmarkByClassName = (className: string): keyof ExtractedData['benchmarkValues'] => {
    const matchingKey = Object.keys(assetClassBenchmarks).find(key => className.includes(key.replace(/ \(.+\)/, '')));
    return matchingKey ? assetClassBenchmarks[matchingKey] : 'CDI'; // Default to CDI if not found
};


// ---- Sub-components for each phase ----

const UploadPhase = ({ onFilesChange, onBatchSubmit, onUltraBatchSubmit, files, isSubmitting, setIsSubmitting  }: {
    onFilesChange: (files: File[]) => void;
    onBatchSubmit: (files: File[]) => void; 
    onUltraBatchSubmit: (files: File[]) => void; 
    files: File[];
    isSubmitting: boolean;
    setIsSubmitting: (isSubmitting: boolean) => void;
}) => {

    const { toast } = useToast();
    const [selectedFiles, setSelectedFiles] = useState<File[]>(files);
    const [analysisType, setAnalysisType] = useState<AnalysisType>('individual');
    const [personalize, setPersonalize] = useState<PersonalizePrompt>('no');
    const [isDraggingOver, setIsDraggingOver] = useState(false);

        // 🆕 Função helper para limite dinâmico
    const getCurrentLimit = (analysisType: AnalysisType) => {
        switch (analysisType) {
            case 'ultra_batch':
                return ULTRA_BATCH_LIMIT;
            case 'batch':
                return BATCH_LIMIT;
            case 'individual':
                return 1; // Individual só permite 1 arquivo
            default:
                return BATCH_LIMIT;
        }
    };

    useEffect(() => {
        if (selectedFiles.length > 1 && analysisType !== 'ultra_batch') {
            setAnalysisType('batch');
        }
    }, [selectedFiles, analysisType]);


    useEffect(() => {
        if (analysisType === 'batch') {
            setPersonalize('no');
        }
    }, [analysisType]);

    const handleFileDrop = (droppedFiles: FileList, forcedAnalysisType?: AnalysisType) => {
        if (!droppedFiles) return;

        const pdfFiles = Array.from(droppedFiles).filter(file => file.type === 'application/pdf');

        // Se não tiver nenhum PDF, mostrar toast
        if (pdfFiles.length === 0) {
            toast({
                title: 'Nenhum PDF encontrado',
                description: 'A pasta selecionada não contém arquivos PDF.',
                variant: 'destructive',
            });
            return;
        }

           // Só detectar tipo se NÃO for ultra_batch (já definido pelo handleFolderInputChange)
        let newAnalysisType = forcedAnalysisType || analysisType;

        if (!forcedAnalysisType && analysisType !== 'ultra_batch') {
            // Lógica de detecção automática (mantém o código atual)
            const isFolderUpload = pdfFiles.length > 1 && Array.from(droppedFiles).some(file => 
                file.webkitRelativePath && file.webkitRelativePath.includes('/')
            );
            
            
            if (isFolderUpload) {
                // Upload de pasta → Ultra Batch
                newAnalysisType = 'ultra_batch';
                toast({
                    title: 'Pasta Detectada',
                    description: 'Modo alterado para Ultra Lote automaticamente.',
                    variant: 'default',
                });
            } else if (pdfFiles.length > 1 && analysisType === 'individual') {
                // Múltiplos arquivos individuais → Batch
                newAnalysisType = 'batch';
                toast({
                    title: 'Múltiplos Arquivos',
                    description: 'Modo alterado para Lote automaticamente.',
                    variant: 'default',
                });
            }
            
            // Atualizar analysisType se necessário
            if (newAnalysisType !== analysisType) {
                setAnalysisType(newAnalysisType);
            }

    }
    
        
        setSelectedFiles(prev => {
            const currentLimit = getCurrentLimit(newAnalysisType);
            const totalFiles = prev.length + pdfFiles.length;
            
            if (totalFiles > currentLimit && prev.length < currentLimit) {
                toast({
                    title: 'Limite de Arquivos Atingido',
                    description: `Você só pode analisar ${currentLimit} relatórios por vez. Apenas os primeiros arquivos foram adicionados.`,
                    variant: 'default',
                });
            } else if (prev.length >= currentLimit) {
                toast({
                    title: 'Limite de Arquivos Atingido',
                    description: `Você já atingiu o limite de ${currentLimit} relatórios.`,
                    variant: 'default',
                });
                return prev;
            }
            
            const existingFileNames = new Set(prev.map(f => f.name));
            const uniqueNewFiles = pdfFiles.filter(f => !existingFileNames.has(f.name));
            
            const filesToAdd = uniqueNewFiles.slice(0, currentLimit - prev.length);
        
            return [...prev, ...filesToAdd];
        });
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
        handleFileDrop(e.dataTransfer.files);
    };
    
    const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
        const newFiles = e.target.files;
        if (!newFiles) return;
        handleFileDrop(newFiles);
        e.target.value = '';
    };
    
    const handleContinue = async () => {
        if (selectedFiles.length === 0 || isSubmitting) return;

        setIsSubmitting(true);
        try {
            if (personalize === 'yes' && analysisType === 'individual') {
                onFilesChange(selectedFiles);
            } else if (analysisType === 'ultra_batch') {
                onUltraBatchSubmit(selectedFiles);
            } else {
                onBatchSubmit(selectedFiles);
            }
        } catch (error) {
            console.error("Erro ao continuar o processamento:", error);
            // O erro já deve ser tratado nas funções pai, mas reabilitamos o botão aqui por segurança.
            setIsSubmitting(false);
        }
        // Não resetamos isSubmitting aqui, pois o modal vai fechar ou mudar de fase.
        // O reset principal acontece quando o modal é fechado.
    };

    const handleRemoveFile = (fileToRemove: File) => {
        setSelectedFiles(currentFiles => currentFiles.filter(file => file !== fileToRemove));
    };
    
    const isAddFileDisabled = selectedFiles.length >= getCurrentLimit(analysisType);


    const [isFolderUpload, setIsFolderUpload] = useState(false);
    const [folderName, setFolderName] = useState<string>('');

    const handleFolderInputChange = (e: ChangeEvent<HTMLInputElement>) => {
        const newFiles = e.target.files;
        if (!newFiles) return;
        
        // Detectar se é upload de pasta
        const isFolderUpload = Array.from(newFiles).some(file => 
            file.webkitRelativePath && file.webkitRelativePath.includes('/')
        );
        
        if (isFolderUpload) {
                    // Capturar nome da pasta do primeiro arquivo
            const firstFile = Array.from(newFiles)[0];
            const folderPath = firstFile.webkitRelativePath;
            const folderName = folderPath.split('/')[0];

            setAnalysisType('ultra_batch');
            setIsFolderUpload(true);
            setFolderName(folderName); // ← Aqui você salva o nome da pasta
    
            toast({
                title: 'Pasta Selecionada',
                description: 'Modo alterado para Ultra Lote automaticamente.',
                variant: 'default',
            });
            handleFileDrop(newFiles, 'ultra_batch');

        } else {
            handleFileDrop(newFiles);
            setFolderName('');
        }
        e.target.value = '';
    };


    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
         <input 
            id="prompt-builder-file-upload" 
            type="file" 
            accept=".pdf" 
            className="hidden" 
            onChange={handleFileInputChange} 
            multiple 
            disabled={isAddFileDisabled} 
        />
        
        {/* Input para pastas */}
        <input 
            id="prompt-builder-folder-upload" 
            type="file" 
            className="hidden" 
            onChange={handleFolderInputChange} 
            multiple
            {...({ webkitdirectory: "true" } as any)}
            disabled={isAddFileDisabled} 
        />
            <div 
                className={cn(
                    "flex flex-col border-2 border-dashed border-muted-foreground/30 rounded-xl p-6 text-center h-full transition-colors",
                    isDraggingOver && 'border-primary bg-primary/10',
                    isAddFileDisabled && 'bg-muted/50 border-muted-foreground/10'
                )}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
            >
                {selectedFiles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full">
                        <UploadCloud className="h-16 w-16 text-muted-foreground/50 mb-4" style={{ strokeWidth: 1.5 }} />
                        <h3 className="font-semibold text-lg text-foreground">Anexar Relatório de Performance</h3>
                        <p className="text-muted-foreground text-sm mb-6">Arraste e solte o arquivo PDF aqui ou clique para selecionar.</p>
                        <div className="flex gap-2">
                            <Button 
                                type="button" 
                                variant="outline" 
                                onClick={() => document.getElementById('prompt-builder-file-upload')?.click()}
                            >
                                <FileText className="mr-2 h-4 w-4" />
                                Selecionar PDFs
                            </Button>
                            <Button 
                                type="button" 
                                variant="outline" 
                                onClick={() => document.getElementById('prompt-builder-folder-upload')?.click()}
                            >
                                <UploadCloud className="mr-2 h-4 w-4" />
                                Selecionar Pasta
                            </Button>
                        </div>
                    </div>
                ) : (
                    
                    <div className="flex flex-col h-full w-full">
                    <h3 className="font-semibold text-lg text-left text-foreground mb-4">
                        {isFolderUpload ? `Pasta: ${folderName}` : `Arquivos Anexados (${selectedFiles.length}/${getCurrentLimit(analysisType)})`}
                    </h3>
                    
                    {isFolderUpload ? (
                        // Exibição da pasta
                        <div className="flex items-center justify-between bg-muted p-4 rounded-lg">
                            <div className="flex items-center gap-2">
                                <UploadCloud className="h-5 w-5 text-muted-foreground" />
                                <span className="font-medium text-foreground">{folderName}</span>
                                <span className="text-sm text-muted-foreground">({selectedFiles.length} arquivos)</span>
                            </div>
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-6 w-6 text-muted-foreground hover:text-destructive" 
                                onClick={() => {
                                    setSelectedFiles([]);
                                    setIsFolderUpload(false);
                                    setFolderName('');
                                }}
                            >
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    ) : (
                        // Exibição de arquivos individuais
                        <>
                            <div className="space-y-2 flex-1 overflow-y-auto pr-2">
                                {selectedFiles.map((file, index) => (
                                    <div key={index} className="flex items-center justify-between bg-muted p-2 rounded-lg text-sm">
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                                            <span className="font-medium text-foreground truncate">{file.name}</span>
                                        </div>
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0" 
                                            onClick={() => handleRemoveFile(file)}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className="mt-4" 
                                onClick={() => document.getElementById('prompt-builder-file-upload')?.click()} 
                                disabled={isAddFileDisabled}
                            >
                                Adicionar outro arquivo
                            </Button>
                        </>
                    )}
                    </div>
                )}
            </div>
            
            <div className="space-y-6 flex flex-col justify-between">
                <TooltipProvider>
                    <div className="space-y-4">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <Label htmlFor="analysis-type" className="font-semibold">Quantidade de Itens</Label>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Info className="h-4 w-4 text-muted-foreground cursor-help" onClick={(e) => e.preventDefault()} />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>Escolha entre analisar um único arquivo ou múltiplos em lote.</p>
                                    </TooltipContent>
                                </Tooltip>
                            </div>
                            <Select value={analysisType} onValueChange={(value) => setAnalysisType(value as AnalysisType)} disabled={selectedFiles.length > 1 || isFolderUpload}>
                                <SelectTrigger id="analysis-type">
                                    <SelectValue placeholder="Selecione a quantidade" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="individual">Individual</SelectItem>
                                    <SelectItem value="batch">Lote (Máximo {BATCH_LIMIT} volumes)</SelectItem>
                                    <SelectItem value="ultra_batch">Ultra Lote (Máximo {ULTRA_BATCH_LIMIT} volumes)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <Label htmlFor="personalize-prompt" className="font-semibold">Tipo de Análise</Label>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Info className="h-4 w-4 text-muted-foreground cursor-help" onClick={(e) => e.preventDefault()} />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <div className="max-w-xs space-y-1">
                                            <p>
                                                <strong className="text-foreground">Análise Automática:</strong> Gera a mensagem padrão. A perfomance automática é feita considerando 3 principais ativos e 3 detratores relacionadas ao seu percentual do *CDI*. Disponível para um ou múltiplos arquivos (lote).
                                            </p>
                                            <p>
                                                <strong className="text-foreground">Análise Personalizada:</strong> Permite escolher os dados. Disponível apenas para um único arquivo.
                                            </p>
                                        </div>
                                    </TooltipContent>
                                </Tooltip>
                            </div>
                            <Select value={personalize} onValueChange={(value) => setPersonalize(value as PersonalizePrompt)} disabled={analysisType !== 'individual'}>
                                <SelectTrigger id="personalize-prompt">
                                    <SelectValue placeholder="Selecione o tipo de análise" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="no">Análise Automática</SelectItem>
                                    <SelectItem value="yes">Análise Personalizada</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </TooltipProvider>
                <Button 
                  type="button" 
                  onClick={handleContinue} 
                  disabled={selectedFiles.length === 0 || isSubmitting}
                >
                    {isSubmitting ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Processando...
                        </>
                    ) : (
                        'Continuar e Processar'
                    )}
                </Button>
            </div>
        </div>
    );
};


const LoadingPhase = ({ loadingMessage }: { loadingMessage: string }) => (
    <div className="flex flex-col items-center justify-center text-center h-full">
        <Loader2 className="h-16 w-16 text-muted-foreground animate-spin mb-4" />
        <div className="relative w-full overflow-hidden h-6">
            <div
                key={loadingMessage}
                className="font-semibold text-lg text-foreground animate-fade-in-out"
            >
                {loadingMessage}...
            </div>
        </div>
        <p className="text-muted-foreground text-sm">Isso pode levar alguns segundos. Por favor, aguarde.</p>
    </div>
);

const ErrorPhase = ({ error, onRetry }: { error: string | null, onRetry: () => void }) => (
    <div className="flex flex-col items-center justify-center border-2 border-dashed border-destructive/50 rounded-xl p-12 text-center h-full bg-destructive/5">
        <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
        <h3 className="font-semibold text-lg text-destructive">Falha na Extração</h3>
        <p className="text-destructive/80 text-sm mb-6">{error}</p>
        <Button type="button" variant="destructive" onClick={onRetry}>
            Tentar Novamente
        </Button>
    </div>
);

const SelectionPhase = ({ data, onCheckboxChange, selectedFields }: { data: ExtractedData; onCheckboxChange: (category: keyof ExtractedData, assetOrClass: string, index: number, checked: boolean, isClass?: boolean) => void; selectedFields: SelectedFields; }) => {
    const [openAccordionItems, setOpenAccordionItems] = useState<string[]>([]);
    const [assetAnalysisView, setAssetAnalysisView] = useState<AssetAnalysisView>('asset');

    
    const parsePercentage = (valueString: string): number => {
        if (typeof valueString !== 'string') return -Infinity;
        if (valueString.trim() === '(0,00)' || valueString.trim() === '00,00%') return NaN;
        const cleanedString = valueString.trim().replace('%', '').replace('.', '').replace(',', '.');
        const value = parseFloat(cleanedString);
        return isNaN(value) ? -Infinity : value;
    };
    
    const getPerformanceIndicator = (returnValue: number, benchmarkValue: number) => {
        if (isNaN(returnValue) || isNaN(benchmarkValue)) {
            return null;
        }

        const diff = returnValue - benchmarkValue;
        const diffText = `${diff > 0 ? '+' : ''}${diff.toFixed(2)}%`.replace('.', ',');
        
        if (Math.abs(diff) < 0.01) {
            return <div className="flex items-center gap-1 text-muted-foreground"><Minus className="h-4 w-4" /> <span className="text-xs">({diffText})</span></div>;
        } else if (diff > 0) {
            return <div className="flex items-center gap-1 text-green-600"><ArrowUp className="h-4 w-4" /> <span className="text-xs">({diffText})</span></div>;
        } else {
            return <div className="flex items-center gap-1 text-red-600"><ArrowDown className="h-4 w-4" /> <span className="text-xs">({diffText})</span></div>;
        }
    };

    const allAssetsByClass = useMemo(() => {
        const assets: Record<string, (Asset & { originalIndex: number, numericReturn: number })[]> = {};
        
        // ✅ USAR allAssets (todos os ativos por classe)
        const sourceData = data.allAssets || {};
        
        Object.entries(sourceData).forEach(([category, items]) => {
            if (!assets[category]) {
                assets[category] = [];
            }
            
            // ✅ VERIFICAR SE ITEMS É UM ARRAY
            if (Array.isArray(items)) {
                items.forEach((item, index) => {
                    if (item && typeof item === 'object' && item.asset) {
                        if (!assets[category].some(a => a.asset === item.asset)) {
                            assets[category].push({
                                ...item,
                                originalIndex: index,
                                numericReturn: parsePercentage(item.return)
                            });
                        }
                    }
                });
            }
        });
    
        // Sort assets within each class by return
        Object.keys(assets).forEach(category => {
            assets[category].sort((a, b) => b.numericReturn - a.numericReturn);
        });
    
        return assets;
    }, [data.allAssets]);
    
    const allClassPerformances = useMemo(() => {
        return (data.classPerformance || []).map(item => ({
            ...item,
            benchmarkName: findBenchmarkByClassName(item.className),
            numericReturn: parsePercentage(item.return),
            numericCdi: parsePercentage(item.cdiPercentage)
        }));
    }, [data.classPerformance]);

    const allAccordionKeys = useMemo(() => {
        if (assetAnalysisView === 'asset') {
            return Object.keys(allAssetsByClass).map(cat => `asset-cat-${cat}`);
        }
        return ['class-performance-accordion'];
    }, [allAssetsByClass, assetAnalysisView]);

    const handleExpandAll = () => setOpenAccordionItems(allAccordionKeys);
    const handleCollapseAll = () => setOpenAccordionItems([]);


    const renderAllAssets = () => {
        const categories = Object.keys(allAssetsByClass);
        if (categories.length === 0) return <p className="text-xs text-muted-foreground">Nenhum ativo encontrado.</p>;

        return (
            <Accordion type="multiple" className="w-full" value={openAccordionItems} onValueChange={setOpenAccordionItems}>
                {categories.map(category => (
                    <AccordionItem value={`asset-cat-${category}`} key={`asset-cat-${category}`}>
                        <AccordionTrigger className="font-semibold text-muted-foreground text-xs uppercase tracking-wider hover:no-underline py-2">
                            {category} ({allAssetsByClass[category].length})
                        </AccordionTrigger>
                        <AccordionContent className="pt-2 pl-1">
                            <div className="space-y-2">
                                {allAssetsByClass[category].map((item) => (
                                    <div key={`asset-${category}-${item.originalIndex}`} className="flex items-start space-x-3 p-2 rounded-md bg-muted/50">
                                        <Checkbox 
                                            id={`asset-${category}-${item.originalIndex}`} 
                                            // Linhas 462-465: Substituir todo o onCheckedChange por:
                                            onCheckedChange={(c) => {
                                                onCheckboxChange('allAssets', category, item.originalIndex, !!c);
                                            }}
                                            className="mt-1" 
                                            checked={
                                                !!(selectedFields.allAssets as any)?.[category]?.[item.originalIndex]
                                            }
                                        />
                                        <Label htmlFor={`asset-${category}-${item.originalIndex}`} className="flex flex-col">
                                            <span><strong>{item.asset}</strong> (Rentabilidade: {item.return})</span>
                                            {item.reason && <span className="text-xs text-muted-foreground italic">"{item.reason}"</span>}
                                        </Label>
                                    </div>
                                ))}
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
        );
    };

    const renderClassPerformance = () => {
         if (!allClassPerformances || allClassPerformances.length === 0) {
            return <p className="text-xs text-muted-foreground">Nenhuma performance de classe encontrada.</p>;
        }

        return (
            <Accordion type="single" collapsible className="w-full" defaultValue="class-performance-accordion">
                <AccordionItem value="class-performance-accordion">
                    <AccordionTrigger className="font-semibold text-muted-foreground text-xs uppercase tracking-wider hover:no-underline py-2">
                        Performance por Classe
                    </AccordionTrigger>
                    <AccordionContent className="pt-2 pl-1">
                        <div className="space-y-2">
                            {allClassPerformances.map((item, index) => {
                                const isGlobalClass = item.className.toLowerCase().includes('global');
                                const benchmarkValue = data.benchmarkValues?.[item.benchmarkName] ?? null;
                                const performanceIndicator = benchmarkValue ? getPerformanceIndicator(item.numericReturn, parsePercentage(benchmarkValue)) : null;

                                return (
                                    <div key={`cp-${index}`} className="flex items-start p-2 rounded-md bg-muted/50 space-x-3">
                                        <Checkbox
                                            id={`cp-${index}`}
                                            onCheckedChange={(c) => onCheckboxChange('classPerformance', item.className, -1, !!c, true)}
                                            className="mt-1"
                                            checked={!!selectedFields.classPerformance?.[item.className]}
                                        />
                                        <Label htmlFor={`cp-${index}`} className="flex-1 cursor-pointer">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <strong>{item.className}</strong>
                                                     {!isGlobalClass && performanceIndicator}
                                                </div>
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {isGlobalClass ? (
                                                    <>
                                                        <span>Rentabilidade: {item.return}</span>
                                                        <span className='mx-2'>|</span>
                                                        <span>Esta classe de ativo não possui benchmarking disponibilizado no relatório XP.</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span>Rentabilidade: {item.return}</span>
                                                        {benchmarkValue && <span className="mx-2">|</span>}
                                                        {benchmarkValue && <span>Benchmark ({item.benchmarkName}): {benchmarkValue}</span>}
                                                    </>
                                                )}
                                            </div>
                                        </Label>
                                    </div>
                                );
                            })}
                        </div>
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        );
    }

    return (
    <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
                 <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-5 w-5" />Resultados do Mês da Carteira</CardTitle>
                 </CardHeader>
                 <CardContent className="space-y-4 text-sm">
                    <div className="flex items-center space-x-3"><Checkbox id="monthlyReturn" onCheckedChange={(c) => onCheckboxChange('monthlyReturn', '', -1, !!c)} /><Label htmlFor="monthlyReturn">Rentabilidade: <strong>{data.monthlyReturn}</strong></Label></div>
                    <div className="flex items-center space-x-3"><Checkbox id="monthlyCdi" onCheckedChange={(c) => onCheckboxChange('monthlyCdi', '', -1, !!c)} /><Label htmlFor="monthlyCdi">% CDI: <strong>{data.monthlyCdi}</strong></Label></div>
                    <div className="flex items-center space-x-3"><Checkbox id="monthlyGain" onCheckedChange={(c) => onCheckboxChange('monthlyGain', '', -1, !!c)} /><Label htmlFor="monthlyGain">Ganho Financeiro: <strong>{data.monthlyGain}</strong></Label></div>
                 </CardContent>
            </Card>
            <Card>
                 <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-5 w-5" />Resultados do Ano da Carteira</CardTitle>
                 </CardHeader>
                 <CardContent className="space-y-4 text-sm">
                    <div className="flex items-center space-x-3"><Checkbox id="yearlyReturn" onCheckedChange={(c) => onCheckboxChange('yearlyReturn', '', -1, !!c)} /><Label htmlFor="yearlyReturn">Rentabilidade: <strong>{data.yearlyReturn}</strong></Label></div>
                    <div className="flex items-center space-x-3"><Checkbox id="yearlyCdi" onCheckedChange={(c) => onCheckboxChange('yearlyCdi', '', -1, !!c)} /><Label htmlFor="yearlyCdi">% CDI: <strong>{data.yearlyCdi}</strong></Label></div>
                    <div className="flex items-center space-x-3"><Checkbox id="yearlyGain" onCheckedChange={(c) => onCheckboxChange('yearlyGain', '', -1, !!c)} /><Label htmlFor="yearlyGain">Ganho Financeiro: <strong>{data.yearlyGain}</strong></Label></div>
                 </CardContent>
            </Card>
        </div>
        <Card>
            <CardHeader className="pb-4">
                 <div className="flex justify-between items-start md:items-center flex-col md:flex-row gap-4">
                    <CardTitle className="flex items-center gap-2 text-base"><Star className="h-5 w-5" />Destaques Mensais da Carteira</CardTitle>
                    <div className="flex items-center gap-2">
                         <div className="flex items-center p-1 bg-muted rounded-xl">
                            <Button 
                                size="sm" 
                                onClick={() => setAssetAnalysisView('asset')} 
                                className={cn("flex-1 text-sm h-8 rounded-lg", assetAnalysisView === 'asset' ? 'bg-background shadow text-foreground' : 'bg-transparent text-muted-foreground hover:bg-background/50')}
                            >
                                <Gem className="mr-2 h-4 w-4" />
                                Por Ativo
                            </Button>
                            <Button 
                                size="sm" 
                                onClick={() => setAssetAnalysisView('class')} 
                                className={cn("flex-1 text-sm h-8 rounded-lg", assetAnalysisView === 'class' ? 'bg-background shadow text-foreground' : 'bg-transparent text-muted-foreground hover:bg-background/50')}
                            >
                                <Layers className="mr-2 h-4 w-4" />
                                Por Classe
                            </Button>
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                
                {assetAnalysisView === 'asset' && (
                    <div className="w-full h-px bg-border my-4 flex items-center justify-center">
                        <div className="flex items-center gap-2 bg-background px-4">
                            <Button variant="ghost" size="sm" onClick={handleExpandAll} className="text-xs text-muted-foreground">
                                <ChevronsDown className="mr-1 h-4 w-4" />
                                Expandir Tudo
                            </Button>
                            <Button variant="ghost" size="sm" onClick={handleCollapseAll} className="text-xs text-muted-foreground">
                                <ChevronsRight className="mr-1 h-4 w-4" />
                                Recolher Tudo
                            </Button>
                        </div>
                    </div>
                )}

                {assetAnalysisView === 'asset' ? (
                    <div className="space-y-3 text-sm">
                        <h4 className="font-semibold flex items-center gap-2"><BarChart className="h-4 w-4" />Ativos da Carteira</h4>
                        {renderAllAssets()}
                    </div>
                ) : (
                    <div className="md:col-span-2 space-y-3 text-sm">
                        {renderClassPerformance()}
                    </div>
                )}
              </div>
            </CardContent>
        </Card>
    </div>
    );
};


const loadingMessages = [
    "Anexando relatório",
    "Analisando relatório",
    "Extraindo e preparando dados para você"
];

// Adicionar antes da linha 808 (export function PromptBuilderDialog)
const UltraBatchProgressPhase = ({ 
    jobId, 
    progress, 
    results, 
    status, 
    onNewAnalysis 
  }: {
    jobId: string | null;
    progress: { current: number; total: number } | null;
    results: any[];
    status: 'processing' | 'completed' | 'error';
    onNewAnalysis: () => void;
  }) => {
    const percentage = progress ? 
        (progress.current / progress.total) * 100 : 0;

    return (
        <div className="flex flex-col h-full p-6">
            <div className="text-center mb-6">
                <h2 className="text-2xl font-bold mb-2">Análise Ultra Lote</h2>
                <p className="text-muted-foreground">
                    Job ID: {jobId}
                </p>
            </div>

            {/* Barra de Progresso */}

            {/* Status */}
            <div className="text-center mb-4">
                {status === 'processing' && (
                    <p className="text-white-600">🔄 Processando arquivos...</p>
                )}
                {status === 'completed' && (
                    <p className="text-green-600">✅ Análise concluída!</p>
                )}
                {status === 'error' && (
                    <p className="text-red-600">❌ Erro na análise</p>
                )}
            </div>

            {/* Resultados Parciais */}
            <div className="flex-1 overflow-hidden">
                <div className="space-y-2 overflow-y-auto max-h-96">
                    {results.map((result, index) => (
                        <div key={result.id} className="border rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                                <span className="font-medium text-sm">
                                    {result.fileName}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    #{index + 1}
                                </span>
                            </div>
                            {result.error ? (
                                <p className="text-red-500 text-sm">❌ {result.error}</p>
                            ) : (
                                <div className="text-sm text-muted-foreground">
                                    <p className="line-clamp-3">{result.finalMessage}</p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

        
            <div className="flex gap-2 mt-4">
            <h2 className="font-semibold mb-3">
                    Os resultados serão exibidos a medida que forem finalizando
                </h2>
                {status === 'completed' && (
                    <Button 
                        onClick={() => {
                            //console.log('Resultados finais:', results);
                            // Aqui você pode implementar download ou outras ações
                        }}
                        className="flex-1"
                    >
                        Ver Detalhes
                    </Button>
                )}
            </div>
        </div>
    );
};

export function PromptBuilderDialog({ open, onOpenChange, onAnalysisResult, onBatchSubmit, onStartUltraBatch, activeChatId }: PromptBuilderDialogProps) {
    const [phase, setPhase] = useState<PromptBuilderPhase>('upload');
    const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
    const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
    const [selectedFields, setSelectedFields] = useState<SelectedFields>({});
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();
    const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
    const { user } = useAuth(); //pega o uid fo firestore
  
    const [ultraBatchJobId, setUltraBatchJobId] = useState<string | null>(null);
    const [ultraBatchProgress, setUltraBatchProgress] = useState<{current: number, total: number}>({current: 0, total:0});
    const [isSubmitting, setIsSubmitting] = useState(false);

    const pythonServiceUrl = process.env.NEXT_PUBLIC_PYTHON_SERVICE_URL || 'http://localhost:8000';

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (phase === 'loading') {
      setLoadingMessageIndex(0); // Reset on new loading
      interval = setInterval(() => {
        setLoadingMessageIndex(prevIndex => (prevIndex + 1) % loadingMessages.length);
      }, 2500);
    }
    return () => clearInterval(interval);
  }, [phase]);


  const resetState = () => {
    setPhase('upload');
    setUploadedFiles([]);
    setExtractedData(null);
    setSelectedFields({});
    setError(null);
    setLoadingMessageIndex(0);
    setUltraBatchJobId(null);
    setUltraBatchProgress({current: 0, total: 0});
    setIsSubmitting(false);
  };
  
  const processIndividualFile = async (files: File[]) => {
    if (files.length === 0) return;
    const file = files[0];

    if (file.type !== 'application/pdf') {
        toast({
            variant: 'destructive',
            title: 'Formato Inválido',
            description: 'Por favor, selecione um arquivo PDF.',
        });
        return;
    }

    setPhase('loading');
    
    try {
        // Converter para base64 no frontend
        const base64Content = await fileToBase64(file);
        
        // ✅ MUDANÇA: Usar análise personalizada diretamente
        const result = await extractReportData(
            base64Content, 
            file.name, 
            user?.uid || 'anonymous'
        );

        if (!result.success || !result.data) {
            throw new Error(result.error || "A extração de dados falhou.");
        }
        
        // ✅ MUDANÇA: Usar result.data como extractedData
        setExtractedData(result.data);
        setPhase('selection');
    } catch (err: any) {
        setError(err.message);
        setPhase('error');
    }
}

  const handleFilesChange = (files: File[]) => {
    setUploadedFiles(files);
    processIndividualFile(files);
  };
  
  const handleBatchSubmit = async (files: File[]) => {
    try {
        setPhase('loading');
        
        // Converter todos os arquivos para base64 no frontend
        const batchFiles = await Promise.all(
          files.map(async (file) => {
            const base64Content = await fileToBase64(file);
            return {
              name: file.name,
              dataUri: base64Content
            };
          })
        );
        
        // Usar nova API de batch
        const result = await batchAnalyzeReports(batchFiles, user?.uid || 'anonymous'); // TODO: usar userId real
        
        if (!result.success) {
            throw new Error(result.error || 'Erro no processamento em lote');
        }
        
        // Processar resultados do batch
        const messages = result.results.map((reportResult, index) => {
            if (reportResult.success && reportResult.final_message) {
                //console.log('🔍 DEBUG PromptBuilderDialog.tsx- final_message original:', reportResult.final_message);
                
                // ✅ REATIVAR A CONVERSÃO
                const convertedMessage = convertMarkdownToCodeBlock(reportResult.final_message);
                //console.log('🔍 DEBUG PromptBuilderDialog.tsx- final_message convertido:', convertedMessage);
                
                // ✅ CORREÇÃO: Usar o nome que vem do backend, não do array files
                const fileName = reportResult.file_name || files[index]?.name || `Relatório ${index + 1}`;
                //console.log('🔍 DEBUG PromptBuilderDialog.tsx- reportResult completo:', reportResult);
                //console.log('🔍 DEBUG PromptBuilderDialog.tsx- reportResult.file_name:', reportResult.file_name);
                //console.log('🔍 DEBUG PromptBuilderDialog.tsx- files[index]?.name:', files[index]?.name);
                //console.log('🔍 DEBUG PromptBuilderDialog.tsx- fileName final:', fileName);
                return `## Análise do ${fileName}\n\n${convertedMessage}`;

            } else {
                const fileName = reportResult.file_name || files[index]?.name || `Relatório ${index + 1}`;
                return `## Análise do ${fileName}\n\n**Erro:** ${reportResult.error || 'Processamento falhou'}`;
            }
        });
        
        // Debug do join
        //console.log('🔍 DEBUG PromptBuilderDialog.tsx- messages array length:', messages.length);
        //console.log('🔍 DEBUG PromptBuilderDialog.tsx- messages[0] preview:', messages[0]?.substring(0, 200));
        //console.log('🔍 DEBUG PromptBuilderDialog.tsx- messages[1] preview:', messages[1]?.substring(0, 200));
        
        const joinedMessages = messages.join('\n\n');
        //console.log('🔍 DEBUG PromptBuilderDialog.tsx- joinedMessages length:', joinedMessages.length);
        //console.log('🔍 DEBUG PromptBuilderDialog.tsx- joinedMessages preview:', joinedMessages.substring(0, 300));
        
        // Gerar prompt com todos os resultados
        const batchPrompt = `# Análise de ${files.length} relatórios XP

        ${joinedMessages}`;

        // 🔍 DEBUG COMPLETO
        //console.log('🔍 DEBUG PromptBuilderDialog.tsx- messages array:', messages);
        //console.log('🔍 DEBUG PromptBuilderDialog.tsx- messages length:', messages.length);
        //console.log('🔍 DEBUG PromptBuilderDialog.tsx- batchPrompt final:', JSON.stringify(batchPrompt));
        //console.log('🔍 DEBUG PromptBuilderDialog.tsx- batchPrompt length:', batchPrompt.length);
        //console.log('🔍 DEBUG PromptBuilderDialog.tsx- batchPrompt preview (primeiros 500 chars):', batchPrompt.substring(0, 500));
        //console.log('🔍 DEBUG PromptBuilderDialog.tsx- batchPrompt preview (últimos 500 chars):', batchPrompt.substring(batchPrompt.length - 500));

        
        const fileNames = result.results.map(r => r.file_name).filter((fileName): fileName is string => fileName !== undefined);
        //console.log('🔍 DEBUG PromptBuilderDialog - fileNames para onAnalysisResult:', fileNames);
        onAnalysisResult(batchPrompt, fileNames);
        handleClose();
        
    } catch (err: any) {
        setError(err.message);
        setPhase('error');
    }
  };

    const handleUltraBatchSubmit = async (files: File[]) => {
        // 🔗 REFATORADO: Delegar toda a lógica de criação do job para ChatPage
        // O dialog apenas coleta os arquivos e passa para o componente pai
        try {
            onStartUltraBatch(files);
            handleClose();
        } catch (err: any) {
            console.error('Erro ao iniciar ultra batch:', err);
            toast({
                title: 'Erro no Ultra Lote',
                description: err.message || 'Erro desconhecido',
                variant: 'destructive'
            });
            setPhase('upload');
        }
    };



  const handleCheckboxChange = (category: keyof ExtractedData, assetOrClass: string, index: number, checked: boolean, isClass: boolean = false) => {
    setSelectedFields(prev => {
        const newSelected = { ...prev };
        if (isClass) {
            const classState = (newSelected.classPerformance as Record<string, boolean>) || {};
            classState[assetOrClass] = checked;
            newSelected.classPerformance = classState;
        } else if (index > -1) {
            const categoryKey = category as 'highlights' | 'detractors';
            const categoryState = (newSelected[categoryKey] as Record<string, Record<number, boolean>>) || {};
            if (!categoryState[assetOrClass]) {
                categoryState[assetOrClass] = {};
            }
            categoryState[assetOrClass][index] = checked;
            newSelected[categoryKey] = categoryState;
        } else {
            // This is for top-level fields like 'monthlyReturn'
            const topLevelKey = category as keyof Omit<SelectedFields, 'highlights' | 'detractors' | 'classPerformance'>;
            newSelected[topLevelKey] = checked;
        }
        return newSelected;
    });
};

  const parsePercentage = (valueString: string | undefined): number => {
      if (!valueString || typeof valueString !== 'string') return NaN;
      if (valueString.trim() === '(0,00)' || valueString.trim() === '00,00%') return NaN;
      const cleanedString = valueString.trim().replace('%', '').replace('.', '').replace(',', '.');
      const value = parseFloat(cleanedString);
      return isNaN(value) ? NaN : value;
  };

  const handleGeneratePrompt = async () => {
    if (!extractedData || uploadedFiles.length === 0) return;

    try {
        setPhase('loading');
        
        const file = uploadedFiles[0];
        
        // Converter para base64 no frontend
        const base64Content = await fileToBase64(file);
        
        const apiSelectedFields = {
            monthlyReturn: !!selectedFields.monthlyReturn,
            monthlyCdi: !!selectedFields.monthlyCdi,
            monthlyGain: !!selectedFields.monthlyGain,
            yearlyReturn: !!selectedFields.yearlyReturn,
            yearlyCdi: !!selectedFields.yearlyCdi,
            yearlyGain: !!selectedFields.yearlyGain,
            classPerformance: selectedFields.classPerformance || {},
            allAssets: selectedFields.allAssets || {}
        };

                // Em src/components/chat/PromptBuilderDialog.tsx
                //console.log('🔍 DEBUG PromptBuilderDialog.tsx- apiSelectedFields sendo enviado:', JSON.stringify(apiSelectedFields, null, 2));

                //console.log('🔍 DEBUG PromptBuilderDialog.tsx- ANTES de chamar analyzeReportPersonalizedFromData');
                //console.log('🔍 DEBUG PromptBuilderDialog.tsx- extractedData:', extractedData);
                //console.log('🔍 DEBUG PromptBuilderDialog.tsx- file.name:', file.name);


        // ✅ MUDANÇA: Usar nova API que aceita dados já extraídos
        const result = await analyzeReportPersonalizedFromData(
            extractedData, 
            apiSelectedFields, 
            file.name, 
            user?.uid || 'anonymous'
        );
        
        //console.log('🔍 DEBUG - PromptBuilderDialog result:', result);

        //console.log('🔍 DEBUG PromptBuilderDialog- result.success:', result.success);
        //console.log('🔍 DEBUG PromptBuilderDialog- result.final_message:', result.final_message);
        //console.log('🔍 DEBUG PromptBuilderDialog- result.final_message length:', result.final_message?.length);

        if (!result.success || !result.final_message) {
            //console.log('🔍 DEBUG PromptBuilderDialog- ERRO: result.success =', result.success, 'result.final_message =', result.final_message);
            throw new Error(result.error || 'Falha na geração da mensagem');
        }

        //console.log('🔍 DEBUG PromptBuilderDialog- Chamando onPromptGenerated...');
        onAnalysisResult(result.final_message, [file.name]);
        //console.log('🔍 DEBUG PromptBuilderDialog- onPromptGenerated chamado com sucesso');
        handleClose();
        
    } catch (err: any) {
        //console.log('🔍 DEBUG PromptBuilderDialog- err.message:', err.message);
        setError(err.message);
        setPhase('error');
    }
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  }

  const ULTRA_BATCH_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutos
  
  const renderContent = () => {
    switch (phase) {
        case 'upload':
            return <UploadPhase onFilesChange={handleFilesChange} onBatchSubmit={handleBatchSubmit}  onUltraBatchSubmit={handleUltraBatchSubmit} files={uploadedFiles} isSubmitting={isSubmitting} setIsSubmitting={setIsSubmitting}/>;
        case 'loading':
            return <LoadingPhase loadingMessage={loadingMessages[loadingMessageIndex]} />;
        case 'error':
            return <ErrorPhase error={error} onRetry={resetState} />;
        case 'selection':
            if (extractedData) {
                return <SelectionPhase data={extractedData} onCheckboxChange={handleCheckboxChange} selectedFields={selectedFields} />;
            }
            return <ErrorPhase error="Não foi possível exibir os dados extraídos." onRetry={resetState} />;
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { 
        if (!isOpen) {
          handleClose();
        } else {
          onOpenChange(true);
        }
      }}>
      <DialogContent 
    className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0"
    style={{ borderRadius: '10px' }}
  >
        <DialogHeader className='p-6 pb-2 border-b shrink-0'>
            <div className="flex items-center gap-3">
            <Wand2 className="h-6 w-6" />
            <DialogTitle className="text-xl">Assistente de Mensagem</DialogTitle>
            </div>
            <DialogDescription className="pb-4">
            Anexe um relatório de performance da XP para extrair os dados e construir uma análise personalizada.
            </DialogDescription>
        </DialogHeader>
        
        {phase === 'selection' && extractedData && (
            <div className="px-6 border-b sticky top-0 bg-background z-10 py-3">
                 <div className="flex items-center gap-2 text-muted-foreground bg-muted p-3 rounded-lg">
                    <CalendarDays className="h-5 w-5" />
                    <h3 className="text-base text-foreground">
                        Análise da conta <span className="font-semibold">{extractedData.accountNumber}</span> para{' '}
                        <span className="font-semibold">{extractedData.reportMonth}</span>
                    </h3>
                </div>
            </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
            {renderContent()}
        </div>

        {phase === 'selection' && (
             <DialogFooter className="p-6 pt-4 border-t bg-background shrink-0">
                <Button type="button" variant="outline" onClick={handleClose}>Cancelar</Button>
                <Button type="button" onClick={handleGeneratePrompt} disabled={phase !== 'selection' || Object.values(selectedFields).every(v => {
                    if (typeof v === 'boolean') return !v;
                    if (typeof v === 'object') return Object.values(v).every(cat => Object.values(cat).every(subV => !subV));
                    return true;
                })}>
                    <MessageSquareQuote className="mr-2 h-4 w-4" />
                    Gerar Prompt e Usar
                </Button>
            </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}