
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
    benchmark: 'CDI' | 'Ibovespa' | 'IPCA' | 'Dólar';
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

const assetClassBenchmarks: Record<string, AssetClassPerformance['benchmark']> = {
    'Pre Fixado': 'CDI',
    'Pós Fixado': 'CDI',
    'Multimercado': 'CDI',
    'Alternativo': 'CDI',
    'Fundo Listado': 'CDI',
    'Renda Fixa Brasil (RFB)': 'CDI',
    'Renda Variável Brasil (RVB)': 'Ibovespa',
    'Inflação': 'IPCA',
    'Renda Variável Global': 'Dólar',
    'Renda Fixa Global': 'Dólar',
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
                                <SelectItem value="batch">Lote (Máximo {BATCH_LIMIT} volumes)</SelectItem>
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
                                     <p><strong className="text-foreground">Análise Automática:</strong> Gera a mensagem padrão. Disponível para um ou múltiplos arquivos (lote).</p>
                                     <p><strong className="text-foreground">Análise Personalizada:</strong> Permite escolher os dados. Disponível apenas para um único arquivo.</p>
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


const LoadingPhase = () => (
    <div className="flex flex-col items-center justify-center text-center h-full">
        <Loader2 className="h-16 w-16 text-muted-foreground animate-spin mb-4" />
        <h3 className="font-semibold text-lg text-foreground">Analisando Relatório...</h3>
        <p className="text-muted-foreground text-sm">Aguarde, estamos extraindo os dados do seu documento.</p>
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

const SelectionPhase = ({ data, onCheckboxChange, selectedFields }: { data: ExtractedData, onCheckboxChange: (category: keyof ExtractedData, assetOrClass: string, index: number, checked: boolean, isClass?: boolean) => void, selectedFields: SelectedFields }) => {
    
    const [openAccordionItems, setOpenAccordionItems] = useState<string[]>([]);
    const [detractorView, setDetractorView] = useState<'cdi' | 'return'>('cdi');
    const [highlightView, setHighlightView] = useState<'cdi' | 'return'>('return');
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
            return <div className="flex items-center gap-1"><Minus className="h-4 w-4 text-muted-foreground" /> <span className="text-xs text-muted-foreground">({diffText})</span></div>;
        } else if (diff > 0) {
            return <div className="flex items-center gap-1"><ArrowUp className="h-4 w-4 text-green-600" /> <span className="text-xs text-green-600">({diffText})</span></div>;
        } else {
            return <div className="flex items-center gap-1"><ArrowDown className="h-4 w-4 text-red-600" /> <span className="text-xs text-red-600">({diffText})</span></div>;
        }
    };


    const allHighlights = useMemo(() => {
        return Object.entries(data.highlights).flatMap(([category, items]) => 
            items.map((item, index) => ({
                ...item,
                category,
                index,
                numericReturn: parsePercentage(item.return),
                numericCdi: parsePercentage(item.cdiPercentage)
            }))
        ).sort((a,b) => (highlightView === 'return' ? (b.numericReturn - a.numericReturn) : (b.numericCdi - a.numericCdi)));
    }, [data.highlights, highlightView]);

    const filteredDetractors = useMemo(() => {
        const result: Record<string, Asset[]> = {};
        Object.entries(data.detractors).forEach(([category, items]) => {
            const processedItems = items
                .map(item => ({ ...item, numericReturn: parsePercentage(item.return), numericCdi: parsePercentage(item.cdiPercentage) }))
                .filter(item => !isNaN(item.numericCdi) && item.numericCdi < 100)
                .sort((a, b) => a.numericCdi - b.numericCdi);

            if (processedItems.length > 0) {
                result[category] = processedItems;
            }
        });
        return result;
    }, [data.detractors]);
    
    const allDetractors = useMemo(() => {
         return Object.entries(filteredDetractors).flatMap(([category, items]) =>
            items.map((item, index) => ({
                ...item,
                category,
                originalIndex: data.detractors[category].findIndex(originalItem => originalItem.asset === item.asset),
                numericCdi: (item as any).numericCdi,
                numericReturn: (item as any).numericReturn
            }))
         ).sort((a,b) => (detractorView === 'return' ? (a.numericReturn - b.numericReturn) : (a.numericCdi - b.numericCdi)));
    }, [filteredDetractors, data.detractors, detractorView]);

    const topThreeHighlights = useMemo(() => allHighlights.slice(0, 3), [allHighlights]);
    const bottomThreeDetractors = useMemo(() => allDetractors.slice(0, 3), [allDetractors]);
    
    const allClassPerformances = useMemo(() => {
        return (data.classPerformance || []).map(item => ({
            ...item,
            benchmark: assetClassBenchmarks[item.className] || 'CDI',
            numericReturn: parsePercentage(item.return),
            numericCdi: parsePercentage(item.cdiPercentage)
        }));
    }, [data.classPerformance]);

    const topThreeClassHighlights = useMemo(() => {
        return [...allClassPerformances].sort((a, b) => b.numericReturn - a.numericReturn).slice(0, 3);
    }, [allClassPerformances]);

    const topThreeClassDetractors = useMemo(() => {
        return [...allClassPerformances].filter(c => c.benchmark === 'CDI' && c.numericCdi < 100).sort((a, b) => a.numericCdi - b.numericCdi).slice(0, 3);
    }, [allClassPerformances]);


    const allAccordionKeys = useMemo(() => {
        if (assetAnalysisView === 'asset') {
            const highlightKeys = Object.keys(data.highlights).map(cat => `h-cat-${cat}`);
            const detractorKeys = Object.keys(filteredDetractors).map(cat => `d-cat-${cat}`);
            return [...highlightKeys, ...detractorKeys];
        }
        return ['class-performance-accordion'];
    }, [data.highlights, filteredDetractors, assetAnalysisView]);

    const handleExpandAll = () => setOpenAccordionItems(allAccordionKeys);
    const handleCollapseAll = () => setOpenAccordionItems([]);


    const renderHighlights = () => {
        const categories = Object.keys(data.highlights);
        if (categories.length === 0) return <p className="text-xs text-muted-foreground">Nenhum destaque positivo encontrado.</p>;

        return (
            <Accordion type="multiple" className="w-full" value={openAccordionItems} onValueChange={setOpenAccordionItems}>
                {categories.map(category => (
                    <AccordionItem value={`h-cat-${category}`} key={`h-cat-${category}`}>
                        <AccordionTrigger className="font-semibold text-muted-foreground text-xs uppercase tracking-wider hover:no-underline py-2">
                            {category} ({data.highlights[category].length})
                        </AccordionTrigger>
                        <AccordionContent className="pt-2 pl-1">
                            <div className="space-y-2">
                                {data.highlights[category].map((item, index) => (
                                    <div key={`h-${category}-${index}`} className="flex items-start space-x-3 p-2 rounded-md bg-muted/50">
                                        <Checkbox 
                                            id={`h-${category}-${index}`} 
                                            onCheckedChange={(c) => onCheckboxChange('highlights', category, index, !!c)} 
                                            className="mt-1" 
                                            checked={!!(selectedFields.highlights as any)?.[category]?.[index]}
                                        />
                                        <Label htmlFor={`h-${category}-${index}`} className="flex flex-col">
                                            <span><strong>{item.asset}</strong> ({item.return})</span>
                                            <span className="text-xs text-muted-foreground italic">"{item.reason}"</span>
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
    
    const renderDetractors = () => {
        const categories = Object.keys(filteredDetractors);
        if (categories.length === 0) return <p className="text-xs text-muted-foreground">Nenhum detrator com performance abaixo de 100% do CDI foi encontrado.</p>;

        return (
            <Accordion type="multiple" className="w-full" value={openAccordionItems} onValueChange={setOpenAccordionItems}>
                {categories.map(category => (
                    <AccordionItem value={`d-cat-${category}`} key={`d-cat-${category}`}>
                        <AccordionTrigger className="font-semibold text-muted-foreground text-xs uppercase tracking-wider hover:no-underline py-2">
                           {category} ({filteredDetractors[category].length})
                        </AccordionTrigger>
                        <AccordionContent className="pt-2 pl-1">
                            <div className="space-y-2">
                                {filteredDetractors[category].map((item, index) => {
                                    const originalDetractorIndex = data.detractors[category].findIndex(originalItem => originalItem.asset === item.asset);
                                    return (
                                        <div key={`d-${category}-${index}`} className="flex items-start space-x-3 p-2 rounded-md bg-muted/50">
                                            <Checkbox 
                                                id={`d-${category}-${originalDetractorIndex}`} 
                                                onCheckedChange={(c) => onCheckboxChange('detractors', category, originalDetractorIndex, !!c)} 
                                                className="mt-1" 
                                                checked={!!(selectedFields.detractors as any)?.[category]?.[originalDetractorIndex]}
                                            />
                                            <Label htmlFor={`d-${category}-${originalDetractorIndex}`} className="cursor-pointer"><strong>{item.asset}</strong> ({item.cdiPercentage})</Label>
                                        </div>
                                    )
                                })}
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
                                const benchmarkValue = data.benchmarkValues?.[item.benchmark] ?? 'N/A';
                                const indicator = getPerformanceIndicator(item.numericReturn, parsePercentage(benchmarkValue));
                                return (
                                    <div key={`cp-${index}`} className="flex items-start space-x-3 p-2 rounded-md bg-muted/50">
                                        <Checkbox 
                                            id={`cp-${index}`}
                                            onCheckedChange={(c) => onCheckboxChange('classPerformance', item.className, -1, !!c, true)}
                                            className="mt-1" 
                                            checked={!!selectedFields.classPerformance?.[item.className]}
                                        />
                                        <Label htmlFor={`cp-${index}`} className="flex flex-col cursor-pointer">
                                            <div className="flex items-center gap-2">
                                                <strong>{item.className}</strong>
                                                {indicator}
                                            </div>
                                            <span className="text-xs text-muted-foreground">
                                                Rentabilidade: {item.return} | % {item.benchmark} {benchmarkValue}
                                            </span>
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
                    <CardTitle className="flex items-center gap-2 text-base"><BarChart className="h-5 w-5" />Resultados do Mês da Carteira</CardTitle>
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
                 <Card className="border-none shadow-none bg-transparent">
                    <CardContent className="p-0 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                       <div className="space-y-3">
                           <CardHeader className="px-2 pt-0 pb-2">
                              <div className="flex items-center justify-between">
                                  <CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-5 w-5 text-foreground" />Top 3 Destaques</CardTitle>
                                  {assetAnalysisView === 'asset' && (
                                    <div className="flex items-center p-0.5 bg-muted rounded-full">
                                      <Button 
                                          size="sm" 
                                          className={cn(
                                              "text-xs h-7 px-2 rounded-full", 
                                              highlightView === 'return' ? 'bg-background shadow text-foreground' : 'bg-transparent text-muted-foreground hover:bg-background/50'
                                          )}
                                          onClick={() => setHighlightView('return')}
                                      >
                                          Rent. %
                                      </Button>
                                      <Button 
                                          size="sm" 
                                          className={cn(
                                              "text-xs h-7 px-2 rounded-full", 
                                              highlightView === 'cdi' ? 'bg-background shadow text-foreground' : 'bg-transparent text-muted-foreground hover:bg-background/50'
                                          )}
                                          onClick={() => setHighlightView('cdi')}
                                      >
                                          % CDI
                                      </Button>
                                    </div>
                                  )}
                              </div>
                           </CardHeader>
                           <CardContent className="space-y-3 text-sm p-2">
                              {assetAnalysisView === 'asset' ? (
                                  <>
                                  {topThreeHighlights.map((item) => (
                                      <div key={`top-h-${item.asset}`} className="flex items-start space-x-3 p-2 rounded-md bg-muted/50">
                                          <Checkbox 
                                              id={`summary-h-${item.category}-${item.index}`}
                                              onCheckedChange={(c) => onCheckboxChange('highlights', item.category, item.index, !!c)}
                                              checked={!!(selectedFields.highlights as any)?.[item.category]?.[item.index]}
                                              className="mt-1"
                                          />
                                          <Label htmlFor={`summary-h-${item.category}-${item.index}`} className="flex flex-col cursor-pointer">
                                              <span><strong>{item.asset}</strong> ({highlightView === 'return' ? item.return : item.cdiPercentage})</span>
                                              <span className="text-xs text-muted-foreground italic">"{item.reason}"</span>
                                          </Label>
                                      </div>
                                  ))}
                                  {topThreeHighlights.length === 0 && <p className="text-xs text-muted-foreground">Nenhum destaque encontrado.</p>}
                                  </>
                              ) : (
                                  <>
                                  {topThreeClassHighlights.map((item) => (
                                      <div key={`top-class-h-${item.className}`} className="flex items-start space-x-3 p-2 rounded-md bg-muted/50">
                                          <Checkbox
                                              id={`summary-class-h-${item.className}`}
                                              onCheckedChange={(c) => onCheckboxChange('classPerformance', item.className, -1, !!c, true)}
                                              checked={!!selectedFields.classPerformance?.[item.className]}
                                              className="mt-1"
                                          />
                                          <Label htmlFor={`summary-class-h-${item.className}`} className="cursor-pointer">
                                              <strong>{item.className}</strong> ({item.return})
                                          </Label>
                                      </div>
                                  ))}
                                  {topThreeClassHighlights.length === 0 && <p className="text-xs text-muted-foreground">Nenhum destaque de classe encontrado.</p>}
                                  </>
                              )}
                           </CardContent>
                       </div>
                       <div className="space-y-3">
                           <CardHeader className="px-2 pt-0 pb-2">
                              <div className="flex items-center justify-between">
                                  <CardTitle className="flex items-center gap-2 text-base"><TrendingDown className="h-5 w-5 text-foreground" />Top 3 Detratores</CardTitle>
                                   {assetAnalysisView === 'asset' && (
                                    <div className="flex items-center p-0.5 bg-muted rounded-full">
                                      <Button 
                                          size="sm" 
                                          className={cn(
                                              "text-xs h-7 px-2 rounded-full", 
                                              detractorView === 'return' ? 'bg-background shadow text-foreground' : 'bg-transparent text-muted-foreground hover:bg-background/50'
                                          )}
                                          onClick={() => setDetractorView('return')}
                                      >
                                          Rent. %
                                      </Button>
                                      <Button 
                                          size="sm" 
                                          className={cn(
                                              "text-xs h-7 px-2 rounded-full", 
                                              detractorView === 'cdi' ? 'bg-background shadow text-foreground' : 'bg-transparent text-muted-foreground hover:bg-background/50'
                                          )}
                                          onClick={() => setDetractorView('cdi')}
                                      >
                                          % CDI
                                      </Button>
                                    </div>
                                  )}
                              </div>
                           </CardHeader>
                           <CardContent className="space-y-3 text-sm p-2">
                              {assetAnalysisView === 'asset' ? (
                                  <>
                                  {bottomThreeDetractors.map((item) => (
                                      <div key={`bottom-d-${item.asset}`} className="flex items-start space-x-3 p-2 rounded-md bg-muted/50">
                                          <Checkbox 
                                              id={`summary-d-${item.category}-${item.originalIndex}`}
                                              onCheckedChange={(c) => onCheckboxChange('detractors', item.category, item.originalIndex, !!c)}
                                              checked={!!(selectedFields.detractors as any)?.[item.category]?.[item.originalIndex]}
                                              className="mt-1"
                                          />
                                          <Label htmlFor={`summary-d-${item.category}-${item.originalIndex}`} className="cursor-pointer">
                                              <strong>{item.asset}</strong> ({detractorView === 'cdi' ? item.cdiPercentage : item.return})
                                          </Label>
                                      </div>
                                  ))}
                                  {bottomThreeDetractors.length === 0 && <p className="text-xs text-muted-foreground">Nenhum detrator com performance abaixo de 100% do CDI encontrado.</p>}
                                  </>
                              ) : (
                                  <>
                                  {topThreeClassDetractors.map((item) => (
                                      <div key={`top-class-d-${item.className}`} className="flex items-start space-x-3 p-2 rounded-md bg-muted/50">
                                          <Checkbox
                                              id={`summary-class-d-${item.className}`}
                                              onCheckedChange={(c) => onCheckboxChange('classPerformance', item.className, -1, !!c, true)}
                                              checked={!!selectedFields.classPerformance?.[item.className]}
                                              className="mt-1"
                                          />
                                          <Label htmlFor={`summary-class-d-${item.className}`} className="cursor-pointer">
                                              <strong>{item.className}</strong> ({item.cdiPercentage})
                                          </Label>
                                      </div>
                                  ))}
                                  {topThreeClassDetractors.length === 0 && <p className="text-xs text-muted-foreground">Nenhum detrator de classe encontrado.</p>}
                                  </>
                              )}
                           </CardContent>
                       </div>
                    </CardContent>
                 </Card>
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                    {assetAnalysisView === 'asset' ? (
                        <>
                        <div className="space-y-3">
                            <h4 className="font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4" />Maiores Retornos (Detalhado)</h4>
                            {renderHighlights()}
                        </div>
                        <div className="space-y-3">
                            <h4 className="font-semibold flex items-center gap-2"><TrendingDown className="h-4 w-4" />Performance Inferior ao CDI (Detalhado)</h4>
                            {renderDetractors()}
                        </div>
                        </>
                    ) : (
                        <div className="md:col-span-2 space-y-3">
                              <h4 className="font-semibold flex items-center gap-2"><Layers className="h-4 w-4" />Performance por Classe (Detalhado)</h4>
                              {renderClassPerformance()}
                        </div>
                    )}
                </div>
              </div>
            </CardContent>
        </Card>
    </div>
    );
};


export function PromptBuilderDialog({ open, onOpenChange, onPromptGenerated, onBatchSubmit }: PromptBuilderDialogProps) {
  const [phase, setPhase] = useState<PromptBuilderPhase>('upload');
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [selectedFields, setSelectedFields] = useState<SelectedFields>({});
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const resetState = () => {
    setPhase('upload');
    setUploadedFiles([]);
    setExtractedData(null);
    setSelectedFields({});
    setError(null);
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
            prompt += `\n  - ${c.className}: Retorno ${c.return}, CDI ${c.cdiPercentage}`;
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

    const parsePercentage = (valueString: string): number => {
        if (typeof valueString !== 'string') return -Infinity;
        const cleanedString = valueString.trim().replace('%', '').replace('.', '').replace(',', '.');
        return parseFloat(cleanedString);
    };

    const positiveClasses = selectedClasses.filter(c => parsePercentage(c.return) > 0);
    const negativeClasses = selectedClasses.filter(c => parsePercentage(c.return) <= 0);

    if (selectedHighlights.length > 0 || positiveClasses.length > 0) {
        messageBody += `\nOs principais destaques foram:\n`;
        messageBody += selectedHighlights.map(h => `*${h.asset}*, com *${h.return}*`).join('\n');
        if (selectedHighlights.length > 0 && positiveClasses.length > 0) messageBody += '\n';
        messageBody += positiveClasses.map(c => `A classe *${c.className}* teve um bom desempenho com *${c.return}*`).join('\n');
    }

    if (selectedDetractors.length > 0 || negativeClasses.length > 0) {
        messageBody += `\n\nOs principais detratores foram:\n`;
        messageBody += selectedDetractors.map(d => `*${d.asset}*: *${d.cdiPercentage}* do CDI`).join('\n');
        if (selectedDetractors.length > 0 && negativeClasses.length > 0) messageBody += '\n';
        messageBody += negativeClasses.map(c => `A classe *${c.className}* ficou abaixo do esperado, com *${c.return}*`).join('\n');
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
            return <LoadingPhase />;
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
