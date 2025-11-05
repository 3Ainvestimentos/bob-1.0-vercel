"""
Nó de chunking (divisão de texto).
"""
from typing import Dict, Any, List
from langchain.text_splitter import RecursiveCharacterTextSplitter
from app.models.schema import MeetingAnalysisState
from app.config import CHUNK_SIZE, CHUNK_OVERLAP


def chunk_text(state: MeetingAnalysisState) -> Dict[str, Any]:
    """
    Divide o texto em chunks menores para processamento MapReduce.
    
    Input (do estado):
        - raw_text: str (texto completo)
    
    Output (atualiza o estado):
        - chunks: List[str] (lista de pedaços de texto)
    
    Por que fazer chunking?
        - LLMs têm limite de contexto
        - Processamento paralelo é mais rápido
        - MapReduce requer chunks
    
    Estratégia:
        RecursiveCharacterTextSplitter divide por:
        1. Parágrafos (\n\n)
        2. Linhas (\n)
        3. Frases (.)
        4. Palavras ( )
        
        Mantém overlap para não perder contexto entre chunks.
    """
    print(f"[chunk_text] Iniciando chunking do texto")
    
    try:
        raw_text = state['raw_text']
        
        # 1. Validar se há texto para dividir
        if not raw_text or not raw_text.strip():
            raise ValueError("raw_text está vazio. Execute extract_text primeiro.")
        
        # 2. Criar o splitter com configurações do config.py
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=CHUNK_SIZE,        # 2000 caracteres por chunk
            chunk_overlap=CHUNK_OVERLAP,  # 150 caracteres de overlap
            length_function=len,
            separators=["\n\n", "\n", ". ", " ", ""]
        )
        
        # 3. Dividir o texto
        chunks = text_splitter.split_text(raw_text)
        
        # 4. Validar resultado
        if not chunks:
            raise ValueError("Chunking resultou em lista vazia")
        
        print(f"[chunk_text] ✅ Texto dividido em {len(chunks)} chunks")
        
        # 5. Log de informação sobre os chunks
        for i, chunk in enumerate(chunks):
            print(f"  Chunk {i+1}: {len(chunk)} caracteres")
        
        # 6. Retornar atualização do estado
        return {
            "chunks": chunks,
            "metadata": {
                **state.get('metadata', {}),
                "chunks_count": len(chunks),
                "avg_chunk_size": sum(len(c) for c in chunks) // len(chunks),
            }
        }
    
    except Exception as e:
        error_msg = f"Erro ao fazer chunking: {str(e)}"
        print(f"[chunk_text] ❌ {error_msg}")
        return {
            "error": error_msg
        }