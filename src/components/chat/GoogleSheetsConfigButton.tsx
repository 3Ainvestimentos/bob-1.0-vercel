'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { configureGoogleSheets } from '@/app/actions';
import { FileSpreadsheet, ExternalLink, Loader2 } from 'lucide-react';

interface GoogleSheetsConfigButtonProps {
  jobId: string;
  userId: string;
  onConfigured?: (spreadsheetUrl: string) => void;
}

export function GoogleSheetsConfigButton({
  jobId,
  userId,
  onConfigured,
}: GoogleSheetsConfigButtonProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [spreadsheetUrl, setSpreadsheetUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customName, setCustomName] = useState('');

  async function handleConfigure() {
    setIsLoading(true);
    setError(null);

    const result = await configureGoogleSheets(
      jobId,
      userId,
      customName.trim() || undefined
    );

    setIsLoading(false);

    if (result.success && result.spreadsheet_url) {
      setSpreadsheetUrl(result.spreadsheet_url);
      onConfigured?.(result.spreadsheet_url);
    } else {
      setError(result.error || 'Erro ao criar planilha');
    }
  }

  if (spreadsheetUrl) {
    return (
      <a
        href={spreadsheetUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 transition-colors hover:bg-green-100 dark:border-green-800 dark:bg-green-950/50 dark:text-green-400 dark:hover:bg-green-900/50"
      >
        <FileSpreadsheet className="h-4 w-4" />
        Abrir Planilha
        <ExternalLink className="h-3 w-3" />
      </a>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-green-200 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950/50"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Google Sheets
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Exportar para Google Sheets</DialogTitle>
          <DialogDescription>
            Uma planilha será criada automaticamente com os resultados deste
            processamento (account number e mensagem final).
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <label
            htmlFor="custom-name"
            className="mb-1 block text-sm font-medium text-muted-foreground"
          >
            Nome da planilha (opcional)
          </label>
          <input
            id="custom-name"
            type="text"
            placeholder="Ex: Carteira Digital - Fev 2026"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={isLoading}
          />
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfigure}
            disabled={isLoading}
            className="gap-2 bg-green-600 text-white hover:bg-green-700"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Criando...
              </>
            ) : (
              <>
                <FileSpreadsheet className="h-4 w-4" />
                Criar Planilha
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
