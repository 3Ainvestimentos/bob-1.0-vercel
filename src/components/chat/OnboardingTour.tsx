
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { BobIcon } from '../icons/BobIcon';

const tourSteps = [
    {
        title: "Bem-vindo ao Bob!",
        content: "Sou seu novo assistente de IA. Deixe-me mostrar rapidamente como posso te ajudar a otimizar seu trabalho.",
        elementSelector: null,
    },
    {
        elementSelector: '#new-buttons-container',
        title: "Inicie ou Organize suas Conversas",
        content: "Use estes botões para começar uma nova conversa ou para agrupar seus chats em projetos, mantendo tudo organizado.",
        position: 'right',
    },
    {
        elementSelector: '#chat-input-form',
        title: "Faça sua Pergunta Aqui",
        content: "Você pode digitar suas perguntas, anexar arquivos para análise clicando no clipe (📎) ou gravar um áudio clicando no microfone (🎤).",
        position: 'top',
    },
    {
        elementSelector: '#search-source-selector',
        title: "Escolha sua Fonte de Busca",
        content: "Alterne entre a nossa base de conhecimento interna para respostas seguras ou a web para informações atualizadas.",
        position: 'top-end',
    },
    {
        elementSelector: '#suggestion-cards',
        title: "Sugestões Rápidas",
        content: "Não sabe por onde começar? Clique em um destes cards para fazer uma pergunta pré-programada e ver o Bob em ação.",
        position: 'bottom',
    },
    {
        title: "Pronto para Começar!",
        content: "É isso! Agora você está pronto para explorar todo o potencial do Bob. Se tiver dúvidas, clique em 'Guias e FAQ' no menu.",
        elementSelector: null, 
    },
];

interface OnboardingTourProps {
    onFinish: () => void;
}

export const OnboardingTour = ({ onFinish }: OnboardingTourProps) => {
    const [stepIndex, setStepIndex] = useState(0);
    const [highlightedElement, setHighlightedElement] = useState<HTMLElement | null>(null);
    const [elementRect, setElementRect] = useState<DOMRect | null>(null);

    const currentStep = tourSteps[stepIndex];

    useEffect(() => {
        const updateElement = () => {
            // Clear previous highlight
            if (highlightedElement) {
                highlightedElement.style.removeProperty('z-index');
                highlightedElement.style.removeProperty('position');
            }

            if (currentStep.elementSelector) {
                const element = document.querySelector(currentStep.elementSelector) as HTMLElement;
                if (element) {
                    setHighlightedElement(element);
                    setElementRect(element.getBoundingClientRect());
                    // Elevate the element above the dark overlay
                    element.style.setProperty('z-index', '1001', 'important');
                    element.style.setProperty('position', 'relative', 'important');
                } else {
                    handleNext();
                }
            } else {
                setHighlightedElement(null);
                setElementRect(null);
            }
        };

        const timer = setTimeout(updateElement, 150);

        return () => {
            clearTimeout(timer);
            if (highlightedElement) {
                highlightedElement.style.removeProperty('z-index');
                highlightedElement.style.removeProperty('position');
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stepIndex, currentStep.elementSelector]);

    const handleNext = () => {
        if (stepIndex < tourSteps.length - 1) {
            setStepIndex(stepIndex + 1);
        } else {
            onFinish();
        }
    };

    const handlePrev = () => {
        if (stepIndex > 0) {
            setStepIndex(stepIndex - 1);
        }
    };

    const highlightStyle = useMemo(() => {
        if (!elementRect) {
            // When no element is highlighted, we don't need a hole.
            return {};
        }
        const padding = 10;
        return {
            width: `${elementRect.width + padding * 2}px`,
            height: `${elementRect.height + padding * 2}px`,
            top: `${elementRect.top - padding}px`,
            left: `${elementRect.left - padding}px`,
            // This creates the "hole" by clearing the shadow from this area
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)',
            borderRadius: '0.75rem',
        };
    }, [elementRect]);
    
    const popoverPositionClass = useMemo(() => {
        if (!elementRect) return 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2';
        
        switch (currentStep.position) {
            case 'right':
                return 'top-1/2 -translate-y-1/2 left-[calc(100%+1rem)]';
            case 'left':
                return 'top-1/2 -translate-y-1/2 right-[calc(100%+1rem)]';
            case 'bottom':
                return 'left-1/2 -translate-x-1/2 top-[calc(100%+1rem)]';
            case 'top-end':
                 return 'left-auto right-0 bottom-[calc(100%+1rem)]';
            case 'top':
            default:
                return 'left-1/2 -translate-x-1/2 bottom-[calc(100%+1rem)]';
        }
    }, [elementRect, currentStep.position]);


    return (
        <div className="fixed inset-0 z-[1000] transition-opacity duration-300">
            {/* The dark overlay is now part of the main container or managed by the highlight */}
            {/* The element below creates the "hole" in the overlay */}
            <div
                className="absolute pointer-events-none transition-all duration-300 ease-in-out"
                style={highlightStyle}
            />
            {/* If no element is highlighted, we still need the dark overlay */}
            {!elementRect && (
                <div className="absolute inset-0 bg-black/60" />
            )}

            {/* Popover content */}
            <div
                className={`absolute z-[1002] w-80 max-w-sm rounded-lg bg-card text-card-foreground shadow-2xl transition-all duration-300 ease-in-out ${popoverPositionClass}`}
                style={{
                    opacity: 1,
                    transform: 'scale(1)',
                }}
            >
                <div className="p-6 space-y-4">
                    <div className="flex items-center gap-3">
                         <BobIcon className="h-10 w-10 shrink-0" />
                        <h3 className="text-lg font-bold">{currentStep.title}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">{currentStep.content}</p>
                </div>
                <div className="flex items-center justify-between px-6 py-4 bg-muted/50 rounded-b-lg">
                    <Button variant="ghost" size="sm" onClick={onFinish}>Pular</Button>
                    <div className="flex items-center gap-2">
                        {stepIndex > 0 && stepIndex < tourSteps.length -1 && (
                            <Button variant="outline" size="icon" className="h-8 w-8" onClick={handlePrev}>
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                        )}
                        <Button onClick={handleNext} className="h-8">
                            {stepIndex === tourSteps.length - 1 ? 'Finalizar' : 'Próximo'}
                            {stepIndex < tourSteps.length - 1 && <ChevronRight className="ml-1 h-4 w-4" />}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};
