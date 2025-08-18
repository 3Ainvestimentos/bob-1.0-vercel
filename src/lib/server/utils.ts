
'use server';

import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import * as xlsx from 'xlsx';

/**
 * Estimates the number of tokens in a given text.
 * A common approximation is that one token is roughly 4 characters.
 * @param text The input string.
 * @returns The estimated number of tokens.
 */
export async function estimateTokens(text: string): Promise<number> {
  return Math.ceil((text || '').length / 4);
}

/**
 * Extracts the text content from a file provided as a data URI.
 * Supports PDF, Word (.doc, .docx), and Excel (.xls, .xlsx) files.
 * @param fileDataUri The file encoded as a data URI.
 * @param mimeType The MIME type of the file.
 * @returns A promise that resolves to the extracted text content.
 */
export async function getFileContent(fileDataUri: string, mimeType: string): Promise<string> {
    const base64Data = fileDataUri.split(',')[1];
    if (!base64Data) {
        throw new Error('Formato de Data URI inválido.');
    }

    const fileBuffer = Buffer.from(base64Data, 'base64');

    if (mimeType === 'application/pdf') {
        try {
            const data = await pdf(fileBuffer);
            return data.text;
        } catch (error: any) {
            console.error("Error parsing PDF:", error);
            throw new Error(`Falha ao processar o arquivo PDF: ${error.message}`);
        }
    } else if (
        mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || // .docx
        mimeType === 'application/msword' // .doc
    ) {
        try {
            const result = await mammoth.extractRawText({ buffer: fileBuffer });
            return result.value;
        } catch (error: any) {
            console.error("Error parsing Word document:", error);
            throw new Error(`Falha ao processar o arquivo Word: ${error.message}`);
        }
    } else if (
        mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || // .xlsx
        mimeType === 'application/vnd.ms-excel' // .xls
    ) {
        try {
            const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
            let fullText = '';
            workbook.SheetNames.forEach(sheetName => {
                fullText += `\n\n### Início da Planilha: ${sheetName} ###\n\n`;
                const worksheet = workbook.Sheets[sheetName];
                const sheetData = xlsx.utils.sheet_to_csv(worksheet, { header: 1 });
                fullText += sheetData;
                fullText += `\n\n### Fim da Planilha: ${sheetName} ###\n`;
            });
            return fullText;
        } catch (error: any) {
            console.error("Error parsing Excel file:", error);
            throw new Error(`Falha ao processar o arquivo Excel: ${error.message}`);
        }
    }

    
    throw new Error(`O processamento de arquivos do tipo '${mimeType}' não é suportado.`);
}


/**
 * Formats raw text content from a tutorial document into Markdown.
 * It creates subtitles and bulleted lists to improve readability.
 * @param rawContent The raw text content from the document.
 * @param title The title of the tutorial.
 * @returns A formatted Markdown string.
 */
export async function formatTutorialToMarkdown(rawContent: string, title: string): Promise<string> {
    if (!rawContent) return 'Conteúdo não encontrado.';

    let processedContent = rawContent.trim();
    
    const titleToRemove = `TUTORIAL - ${title.toUpperCase()}`;
    if (processedContent.toUpperCase().startsWith(titleToRemove)) {
        processedContent = processedContent.substring(titleToRemove.length).trim();
    }
    
    const lines = processedContent.split('\n');
    let markdownResult = '';

    lines.forEach(line => {
        const trimmedLine = line.trim();
        if (trimmedLine.length === 0) return;

        // Matches lines that are all caps, likely subtitles
        const isAllCaps = /^[A-ZÀ-Ú\s]+$/.test(trimmedLine) && /[A-Z]/.test(trimmedLine);

        if (isAllCaps && trimmedLine.split(' ').length > 1) {
             markdownResult += `\n\n**${trimmedLine.trim()}**\n\n`;
        } else {
            // Splits content by '.' to create list items, for text that is not a subtitle
            const listItems = trimmedLine.split('. ').filter(item => item.trim() !== '');
            listItems.forEach(item => {
                markdownResult += `- ${item.trim()}\n`;
            });
        }
    });

    return markdownResult.trim();
}
