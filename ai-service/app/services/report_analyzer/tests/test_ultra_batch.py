# Criar test_ultra_batch_folder.py na pasta ai-service/
import asyncio
import uuid
import base64
import os
from app.services.report_analyzer.ultra_batch_processing import process_ultra_batch_reports

async def test_with_report_folder():
    """Teste com todos os PDFs da pasta report_folder"""
    
    try:
        # Caminho da pasta
        folder_path = 'report_folder/'
        
        # Listar todos os PDFs
        pdf_files = []
        for file in os.listdir(folder_path):
            if file.endswith('.pdf'):
                pdf_files.append(file)
        
        print(f"📁 Encontrados {len(pdf_files)} PDFs na pasta:")
        for pdf in pdf_files:
            print(f"  - {pdf}")
        
        # Ler todos os PDFs e converter para base64
        test_files = []
        for pdf_file in pdf_files:
            pdf_path = os.path.join(folder_path, pdf_file)
            
            with open(pdf_path, 'rb') as f:
                pdf_content = f.read()
                pdf_base64 = base64.b64encode(pdf_content).decode('utf-8')
            
            test_files.append({
                "name": pdf_file,
                "dataUri": pdf_base64
            })
            
            print(f"✅ {pdf_file} convertido para base64 ({len(pdf_base64)} chars)")
        
        # Criar job no Firestore PRIMEIRO
        from app.config import get_firestore_client
        from firebase_admin import firestore
        
        db = get_firestore_client()
        job_id = str(uuid.uuid4())
        user_id = "test_user"
        
        # Criar documento do job
        job_ref = db.collection('ultra_batch_jobs').document(job_id)
        job_ref.set({
            "userId": user_id,
            "status": "processing",
            "totalFiles": len(test_files),
            "processedFiles": 0,
            "successCount": 0,
            "failureCount": 0,
            "createdAt": firestore.SERVER_TIMESTAMP,
            "completedAt": None,
            "error": None
        })
        
        print(f"✅ Job criado no Firestore: {job_id}")
        print(f"📊 Total de arquivos: {len(test_files)}")
        
        # Processar ultra batch
        print(f"🚀 Iniciando processamento ultra batch...")
        await process_ultra_batch_reports(test_files, user_id, job_id)
        
        print("✅ Teste com pasta completa concluído!")
        print(f"🔗 Verifique no Firestore Console: ultra_batch_jobs/{job_id}")
        
    except FileNotFoundError as e:
        print(f"⚠️  Erro: {e}")
        print("📁 Verificando estrutura de pastas...")
        if os.path.exists('.'):
            print("📁 Conteúdo da pasta atual:")
            for item in os.listdir('.'):
                print(f"  - {item}")
        else:
            print("❌ Pasta tests não encontrada")
    except Exception as e:
        print(f"❌ Erro no teste: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_with_report_folder())