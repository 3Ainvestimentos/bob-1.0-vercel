'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getStorage, ref, listAll, uploadBytes, getDownloadURL, deleteObject, type StorageReference } from 'firebase/storage';
import { app } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileText, Trash2, Download, Copy, Loader2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface StoredFile {
  ref: StorageReference;
  name: string;
  url: string;
}

export default function HomePage() {
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const fetchFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const storage = getStorage(app);
      const listRef = ref(storage, '/');
      const res = await listAll(listRef);
      const filePromises = res.items.map(async (itemRef) => {
        const url = await getDownloadURL(itemRef);
        return { ref: itemRef, name: itemRef.name, url };
      });
      const fetchedFiles = await Promise.all(filePromises);
      setFiles(fetchedFiles);
    } catch (error: any) {
      console.error("Error fetching files:", error);
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar arquivos',
        description: error.message || 'Não foi possível listar os arquivos do bucket.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setFileToUpload(event.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!fileToUpload) return;
    setIsUploading(true);
    const storage = getStorage(app);
    const fileRef = ref(storage, `/${fileToUpload.name}`);
    try {
      await uploadBytes(fileRef, fileToUpload);
      toast({
        title: 'Upload concluído',
        description: `O arquivo "${fileToUpload.name}" foi enviado com sucesso.`,
      });
      setFileToUpload(null);
      if(fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      fetchFiles(); // Refresh file list
    } catch (error: any) {
      console.error("Error uploading file:", error);
      toast({
        variant: 'destructive',
        title: 'Erro no upload',
        description: error.message || `Não foi possível enviar o arquivo "${fileToUpload.name}".`,
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (fileRef: StorageReference) => {
    try {
      await deleteObject(fileRef);
      toast({
        title: 'Arquivo excluído',
        description: `O arquivo "${fileRef.name}" foi excluído com sucesso.`,
      });
      fetchFiles(); // Refresh file list
    } catch (error: any) {
      console.error("Error deleting file:", error);
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir',
        description: error.message || `Não foi possível excluir o arquivo "${fileRef.name}".`,
      });
    }
  };

  const copyToClipboard = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({
      title: 'URL Copiada!',
      description: 'O link para o arquivo foi copiado para a área de transferência.',
    });
  };

  return (
    <div className="container mx-auto p-4 md:p-6 lg:p-8">
      <header className="mb-8">
        <h1 className="text-4xl font-headline font-bold text-primary">Gerenciador de Arquivos</h1>
        <p className="text-lg text-muted-foreground mt-1">
          Faça upload, visualize e gerencie seus arquivos no Firebase Storage.
        </p>
      </header>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Novo Upload</CardTitle>
          <CardDescription>Selecione um arquivo para enviar para o bucket.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <Input
              type="file"
              onChange={handleFileSelect}
              ref={fileInputRef}
              className="flex-grow"
              disabled={isUploading}
            />
            <Button onClick={handleUpload} disabled={!fileToUpload || isUploading}>
              {isUploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {isUploading ? 'Enviando...' : 'Enviar Arquivo'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <section>
        <h2 className="text-2xl font-headline font-semibold mb-4">Arquivos no Bucket</h2>
        {isLoading ? (
          <div className="flex justify-center items-center py-10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-4 text-muted-foreground">Carregando arquivos...</p>
          </div>
        ) : files.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {files.map((file) => (
              <Card key={file.name}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 truncate">
                    <FileText className="h-5 w-5 flex-shrink-0" />
                    <span className="truncate">{file.name}</span>
                  </CardTitle>
                </CardHeader>
                <CardFooter className="flex justify-between gap-2">
                  <Button variant="ghost" size="icon" onClick={() => copyToClipboard(file.url)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                  <a href={file.url} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="icon">
                      <Download className="h-4 w-4" />
                    </Button>
                  </a>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="icon">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Você tem certeza?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta ação não pode ser desfeita. Isso excluirá permanentemente o arquivo "{file.name}" do seu bucket.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(file.ref)}>
                          Sim, excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardFooter>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-10">Nenhum arquivo encontrado no bucket.</p>
        )}
      </section>
    </div>
  );
}
