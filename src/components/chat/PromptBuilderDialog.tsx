
'use client';

import { useState, useMemo, ChangeEvent, DragEvent, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { extractDataFromXpReport } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { UploadCloud, FileText, Loader2, Wand2, AlertTriangle, MessageSquareQuote, CalendarDays, BarChart, TrendingUp, TrendingDown, Star, X, Info, ChevronsRight, ChevronsDown, Repeat, Layers, Gem, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';


// ---- Types ----

type Asset = { asset: string; return: string; cdiPercentage: string; reason?: string; };

type AssetClassPerformance = { 
    className: string; 
    return: string; 
    cdiPercentage: string; 
};

type ExtractedData = {
    accountNumber: string;
    reportMonth: string;
    monthlyReturn: string;
    monthlyCdi: string;
    monthlyGain: string;
    yearlyReturn: string;
    yearlyCdi: string;
    yearlyGain: string;
    highlights: Record<string, Asset[]>;
    detractors: Record<string, Asset[]>;
    classPerformance: AssetClassPerformance[];
    benchmarkValues: { [key in 'CDI' | 'Ibovespa' | 'IPCA' | 'Dólar']?: string };
};

type SelectedFields = {
    [key in keyof Omit<ExtractedData, 'classPerformance' | 'benchmarkValues'>]?: boolean | { [category: string]: { [index: number]: boolean } };
} & {
    classPerformance?: { [className: string]: boolean };
};

type PromptBuilderPhase = 'upload' | 'loading' | 'selection' | 'error';
type AnalysisType = 'individual' | 'batch';
type PersonalizePrompt = 'yes' | 'no';
type AssetAnalysisView = 'asset' | 'class';


interface PromptBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPromptGenerated: (prompt: string) => void;
  onBatchSubmit: (files: File[]) => void;
}

const BATCH_LIMIT = 5;

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

const UploadPhase = ({ onFilesChange, onBatchSubmit, files }: { onFilesChange: (files: File[]) => void; onBatchSubmit: (files: File[]) => void; files: File[] }) => {
    const { toast } = useToast();
    const [selectedFiles, setSelectedFiles] = useState<File[]>(files);
    const [analysisType, setAnalysisType] = useState<AnalysisType>('individual');
    const [personalize, setPersonalize] = useState<PersonalizePrompt>('no');
    const [isDraggingOver, setIsDraggingOver] = useState(false);

    useEffect(() => {
        if (selectedFiles.length > 1) {
            setAnalysisType('batch');
        }
    }, [selectedFiles]);


    useEffect(() => {
        if (analysisType === 'batch') {
            setPersonalize('no');
        }
    }, [analysisType]);

    const handleFileDrop = (droppedFiles: FileList) => {
        if (!droppedFiles) return;

        const pdfFiles = Array.from(droppedFiles).filter(file => file.type === 'application/pdf');
        
        setSelectedFiles(prev => {
            const totalFiles = prev.length + pdfFiles.length;
            if (totalFiles > BATCH_LIMIT && prev.length < BATCH_LIMIT) {
                toast({
                    title: 'Limite de Arquivos Atingido',
                    description: `Você só pode analisar ${BATCH_LIMIT} relatórios por vez. Apenas os primeiros arquivos foram adicionados.`,
                    variant: 'default',
                });
            } else if (prev.length >= BATCH_LIMIT) {
                toast({
                    title: 'Limite de Arquivos Atingido',
                    description: `Você já atingiu o limite de ${BATCH_LIMIT} relatórios.`,
                    variant: 'default',
                });
                return prev;
            }
            
            const existingFileNames = new Set(prev.map(f => f.name));
            const uniqueNewFiles = pdfFiles.filter(f => !existingFileNames.has(f.name));
            
            const filesToAdd = uniqueNewFiles.slice(0, BATCH_LIMIT - prev.length);

            return [...prev, ...filesToAdd];
        });
    }

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
    
    const handleContinue = () => {
        if (selectedFiles.length === 0) return;

        if (personalize === 'yes' && analysisType === 'individual') {
            onFilesChange(selectedFiles);
        } else {
            onBatchSubmit(selectedFiles);
        }
    };

    const handleRemoveFile = (fileToRemove: File) => {
        setSelectedFiles(currentFiles => currentFiles.filter(file => file !== fileToRemove));
    };
    
    const isAddFileDisabled = selectedFiles.length >= BATCH_LIMIT;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
            <input id="prompt-builder-file-upload" type="file" accept=".pdf" className="hidden" onChange={handleFileInputChange} multiple disabled={isAddFileDisabled} />
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
                        <Button type="button" variant="outline" onClick={() => document.getElementById('prompt-builder-file-upload')?.click()}>
                            <FileText className="mr-2 h-4 w-4" />
                            Selecionar Arquivo PDF
                        </Button>
                    </div>
                ) : (
                    <div className="flex flex-col h-full w-full">
                         <h3 className="font-semibold text-lg text-left text-foreground mb-4">Arquivos Anexados ({selectedFiles.length}/{BATCH_LIMIT})</h3>
                         <div className="space-y-2 flex-1 overflow-y-auto pr-2">
                            {selectedFiles.map((file, index) => (
                                <div key={index} className="flex items-center justify-between bg-muted p-2 rounded-lg text-sm">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                                        <span className="font-medium text-foreground truncate">{file.name}</span>
                                    </div>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0" onClick={() => handleRemoveFile(file)}>
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}
                         </div>
                         <Button variant="outline" size="sm" className="mt-4" onClick={() => document.getElementById('prompt-builder-file-upload')?.click()} disabled={isAddFileDisabled}>Adicionar outro arquivo</Button>
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
                        <Select value={analysisType} onValueChange={(value) => setAnalysisType(value as AnalysisType)} disabled={selectedFiles.length > 1}>
                            <SelectTrigger id="analysis-type">
                                <SelectValue placeholder="Selecione a quantidade" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="individual">Individual</SelectItem>
                                <SelectItem value="batch">Lote (Máximo ${BATCH_LIMIT} volumes)</SelectItem>
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
                        <Select value={personalize} onValueChange={(value) => setPersonalize(value as PersonalizePrompt)} disabled={analysisType === 'batch'}>
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
                <Button type="button" onClick={handleContinue} disabled={selectedFiles.length === 0}>
                    Continuar e Processar
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
        
        // Use 'detractors' as the base since it contains all assets
        Object.entries(data.detractors).forEach(([category, items]) => {
            if (!assets[category]) {
                assets[category] = [];
            }
            items.forEach((item, index) => {
                // Check if the asset is already added to avoid duplicates if it's also in highlights
                if (!assets[category].some(a => a.asset === item.asset)) {
                    assets[category].push({
                        ...item,
                        originalIndex: index,
                        numericReturn: parsePercentage(item.return)
                    });
                }
            });
        });

        // Sort assets within each class by return
        Object.keys(assets).forEach(category => {
            assets[category].sort((a, b) => b.numericReturn - a.numericReturn);
        });

        return assets;
    }, [data.detractors, data.highlights]);
    
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
                                            onCheckedChange={(c) => {
                                                const isHighlight = (data.highlights[category] || []).some(h => h.asset === item.asset);
                                                onCheckboxChange(isHighlight ? 'highlights' : 'detractors', category, item.originalIndex, !!c);
                                            }}
                                            className="mt-1" 
                                            checked={
                                                !!(selectedFields.highlights as any)?.[category]?.[item.originalIndex] ||
                                                !!(selectedFields.detractors as any)?.[category]?.[item.originalIndex]
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


export function PromptBuilderDialog({ open, onOpenChange, onPromptGenerated, onBatchSubmit }: PromptBuilderDialogProps) {
  const [phase, setPhase] = useState<PromptBuilderPhase>('upload');
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [selectedFields, setSelectedFields] = useState<SelectedFields>({});
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);

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
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
            const fileDataUri = reader.result as string;
            const result = await extractDataFromXpReport({ name: file.name, mimeType: file.type, dataUri: fileDataUri });

            if (!result.success || !result.data) {
                throw new Error(result.error || "A extração de dados falhou.");
            }
            
            setExtractedData(result.data);
            setPhase('selection');
        };
        reader.onerror = () => {
            throw new Error("Não foi possível ler o arquivo.");
        };
    } catch (err: any) {
        setError(err.message);
        setPhase('error');
    }
  }

  const handleFilesChange = (files: File[]) => {
    setUploadedFiles(files);
    processIndividualFile(files);
  };
  
  const handleBatchSubmit = (files: File[]) => {
    onBatchSubmit(files);
    handleClose();
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


  const handleGeneratePrompt = () => {
    if (!extractedData) return;

    const economicScenarioText = `Em agosto de 2025, o Copom manteve a Selic em 15% a.a., sinalizando prudência diante das incertezas e preservando a âncora monetária. A leitura do IPCA-15 em deflação de 0,14% ajudou a reduzir a percepção de pressões de curto prazo, reforçando a decisão de estabilidade dos juros e melhorando o apetite ao risco doméstico. Nesse ambiente, o Ibovespa avançou 6,28% no mês e atingiu recorde nominal de 141.422 pontos, movimento sustentado por rotação para ativos de risco e pela leitura de que o ciclo de política monetária se encerrou com a inflação cedendo na margem.
No cenário externo, o Simpósio de Jackson Hole trouxe uma mensagem do Federal Reserve de vigilância ao mercado de trabalho, com ênfase em flexibilidade na condução da política — comunicação interpretada como ligeiramente “dovish”. Esse tom contribuiu para a melhora das condições financeiras globais e para a sustentação dos índices de ações, com o S&P 500 registrando alta de 1,9% no mês. O pano de fundo externo mais benigno, combinado ao alívio inflacionário local, criou um vetor positivo para ativos brasileiros, conectando a narrativa de juros estáveis, inflação mais comportada e valorização de bolsas no Brasil e nos Estados Unidos.`;

    let prompt = `Você é um especialista em finanças. Sua tarefa é usar os dados extraídos de um relatório de investimentos da XP para formatar uma mensagem para WhatsApp, seguindo um modelo específico.

**REGRAS ESTRITAS:**
1.  **Use APENAS os dados fornecidos** para preencher a mensagem. Se um dado não foi fornecido, omita a frase correspondente.
2.  **Mantenha a formatação EXATA** do modelo, incluindo quebras de linha e asteriscos para negrito.
3.  **Não inclua** \`\`\`, Markdown, ou qualquer outra formatação que não seja a do modelo.

---
**DADOS EXTRAÍDOS PARA USO:**
- **Mês de Referência:** ${extractedData.reportMonth}`;

    const selectedHighlights: Asset[] = [];
    if (selectedFields.highlights && typeof selectedFields.highlights === 'object') {
        for (const category in selectedFields.highlights) {
            for (const index in selectedFields.highlights[category]) {
                if (selectedFields.highlights[category][index]) {
                    selectedHighlights.push(extractedData.highlights[category][parseInt(index, 10)]);
                }
            }
        }
    }
    
    const selectedDetractors: Asset[] = [];
    if (selectedFields.detractors && typeof selectedFields.detractors === 'object') {
        for (const category in selectedFields.detractors) {
            for (const index in selectedFields.detractors[category]) {
                if (selectedFields.detractors[category][index]) {
                     selectedDetractors.push(extractedData.detractors[category][parseInt(index, 10)]);
                }
            }
        }
    }
    
    const selectedClasses: AssetClassPerformance[] = [];
    if (selectedFields.classPerformance && typeof selectedFields.classPerformance === 'object') {
        for (const className in selectedFields.classPerformance) {
            if (selectedFields.classPerformance[className]) {
                const classData = (extractedData.classPerformance || []).find(c => c.className === className);
                if (classData) {
                    selectedClasses.push(classData);
                }
            }
        }
    }

    const dataPairs = [
        { key: 'monthlyReturn', data: extractedData.monthlyReturn },
        { key: 'monthlyCdi', data: extractedData.monthlyCdi },
        { key: 'monthlyGain', data: extractedData.monthlyGain },
        { key: 'yearlyReturn', data: extractedData.yearlyReturn },
        { key: 'yearlyCdi', data: extractedData.yearlyCdi },
        { key: 'yearlyGain', data: extractedData.yearlyGain }
    ];

    dataPairs.forEach(pair => {
        if (selectedFields[pair.key as keyof SelectedFields]) {
            prompt += `\n- **${pair.key}:** ${pair.data}`;
        }
    });

    if (selectedHighlights.length > 0) {
        prompt += "\n- **Principais Destaques Positivos (Ativos):**";
        selectedHighlights.forEach(h => {
            prompt += `\n  - ${h.asset} (${h.return}): ${h.reason}`;
        });
    }

    if (selectedDetractors.length > 0) {
        prompt += "\n- **Principais Detratores (Ativos):**";
        selectedDetractors.forEach(d => {
            prompt += `\n  - ${d.asset} (${d.cdiPercentage} do CDI)`;
        });
    }

    if (selectedClasses.length > 0) {
        prompt += "\n- **Performance das Classes Selecionadas:**";
        selectedClasses.forEach(c => {
            const benchmarkName = findBenchmarkByClassName(c.className);
            const benchmarkValue = extractedData.benchmarkValues?.[benchmarkName] ?? 'N/A';
            const classReturn = parsePercentage(c.return);
            const benchReturn = parsePercentage(benchmarkValue);
            let diffText = '';
            if (!isNaN(classReturn) && !isNaN(benchReturn)) {
                const diff = classReturn - benchReturn;
                diffText = `, ${Math.abs(diff).toFixed(2).replace('.', ',')}% ${diff >= 0 ? 'superior' : 'inferior'}`;
            }

            prompt += `\n  - ${c.className}: Retorno ${c.return}, Benchmark (${benchmarkName}): ${benchmarkValue}${diffText}`;
        });
    }

    // --- Dynamic Message Construction ---
    let messageBody = `Olá, [NOME]!\n`;
    
    let monthlyPerformanceParts: string[] = [];
    if (selectedFields.monthlyReturn) monthlyPerformanceParts.push(`rendeu *${extractedData.monthlyReturn}*`);
    if (selectedFields.monthlyCdi) monthlyPerformanceParts.push(`o que equivale a *${extractedData.monthlyCdi}* do CDI`);
    if (selectedFields.monthlyGain) monthlyPerformanceParts.push(`um ganho bruto de *${extractedData.monthlyGain}*`);
    
    if (monthlyPerformanceParts.length > 0) {
        messageBody += `Em ${extractedData.reportMonth} sua carteira ${monthlyPerformanceParts.join(', ')}!\n`;
    }

    let yearlyPerformanceParts: string[] = [];
    if (selectedFields.yearlyReturn) yearlyPerformanceParts.push(`rentabilidade de *${extractedData.yearlyReturn}*`);
    if (selectedFields.yearlyCdi) yearlyPerformanceParts.push(`uma performance de *${extractedData.yearlyCdi}* do CDI`);
    if (selectedFields.yearlyGain) yearlyPerformanceParts.push(`um ganho financeiro de *${extractedData.yearlyGain}*`);

    if (yearlyPerformanceParts.length > 0) {
        messageBody += `No ano, estamos com ${yearlyPerformanceParts.join(', ')}!\n`;
    }
    
    if (selectedHighlights.length > 0) {
        messageBody += `\nOs principais destaques foram:\n`;
        messageBody += selectedHighlights.map(h => `*${h.asset}*, com *${h.return}*`).join('\n');
    }

    if (selectedDetractors.length > 0) {
        messageBody += `\n\nOs principais detratores foram:\n`;
        messageBody += selectedDetractors.map(d => `*${d.asset}*: *${d.return}*`).join('\n');
    }
    
    if (selectedClasses.length > 0) {
        const classPerformancesText = selectedClasses.map(c => {
            const isGlobal = c.className.toLowerCase().includes('global');
            if (isGlobal) {
                return `A classe *${c.className}* teve um desempenho com *${c.return}*. Esta classe de ativo não possui benchmarking disponibilizado no relatório XP.`;
            }

            const benchmarkName = findBenchmarkByClassName(c.className);
            const benchmarkValue = extractedData.benchmarkValues?.[benchmarkName] ?? 'N/A';
            const classReturn = parsePercentage(c.return);
            const benchReturn = parsePercentage(benchmarkValue);

            if (!isNaN(classReturn) && !isNaN(benchReturn)) {
                 const diff = classReturn - benchReturn;
                 const comparison = diff >= 0 ? 'superior' : 'inferior';
                 return `A classe *${c.className}* teve um bom desempenho com *${c.return}* de rentabilidade, *${Math.abs(diff).toFixed(2).replace('.',',')}%* ${comparison} ao seu benchmark *${benchmarkName}*, com *${benchmarkValue}*`;
            } else {
                return `A classe *${c.className}* teve um desempenho com *${c.return}*.`;
            }
        }).join('\n');
        
        if(classPerformancesText) {
            messageBody += `\n\n${classPerformancesText}`;
        }
    }


    messageBody += `\n\n${economicScenarioText}`;

    prompt += `\n---\n**MODELO OBRIGATÓRIO DA MENSAGEM (PREENCHA COM OS DADOS ACIMA):**\n\n${messageBody}`;
    
    onPromptGenerated(prompt);
    handleClose();
  };


  const handleClose = () => {
    resetState();
    onOpenChange(false);
  }
  
  const renderContent = () => {
    switch (phase) {
        case 'upload':
            return <UploadPhase onFilesChange={handleFilesChange} onBatchSubmit={handleBatchSubmit} files={uploadedFiles} />;
        case 'loading':
            return <LoadingPhase loadingMessage={loadingMessages[loadingMessageIndex]} />;
        case 'error':
            return <ErrorPhase error={error} onRetry={resetState} />;
        case 'selection':
            if (extractedData) {
                return <SelectionPhase data={extractedData} onCheckboxChange={handleCheckboxChange} selectedFields={selectedFields} />;
            }
            return <ErrorPhase error="Não foi possível exibir os dados extraídos." onRetry={resetState} />;
        default:
            return null;
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); else onOpenChange(true); }}>
      <DialogContent 
        className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0"
      >
        <DialogHeader className='p-6 pb-2 border-b shrink-0'>
          <div className="flex items-center gap-3">
            <Wand2 className="h-6 w-6" />
            <DialogTitle className="text-xl">Assistente de Prompt Estruturado</DialogTitle>
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
