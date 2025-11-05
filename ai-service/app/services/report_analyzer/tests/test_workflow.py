"""
Teste do workflow completo com relatório real.
"""
import asyncio
import base64
import json
import time
from pathlib import Path
import sys
import os

# Adicionar o diretório raiz ao path para imports
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))

from app.workflows.report_workflow import report_analysis_app


async def test_workflow_with_real_report():
    """
    Testa o workflow completo com o relatório real.
    """
    print("🚀 Iniciando teste do workflow com relatório real...")
    
    # 1. Carregar PDF de teste
    pdf_path = Path(__file__).parent / "XPerformance - 5629450 - Ref.29.08 (1).pdf"
    
    if not pdf_path.exists():
        print(f"❌ PDF não encontrado: {pdf_path}")
        return
    
    print(f"📄 Carregando PDF: {pdf_path.name}")
    
    # Converter para base64
    with open(pdf_path, "rb") as f:
        pdf_content = f.read()
        pdf_base64 = base64.b64encode(pdf_content).decode('utf-8')
    
    print(f"✅ PDF carregado: {len(pdf_content)} bytes")
    
    # 2. Preparar state inicial
    state = {
        "file_content": pdf_base64,
        "file_name": pdf_path.name,
        "user_id": "test_user_123",
        "analysis_mode": "auto",  # Testar modo automático completo
        "selected_fields": None
    }
    
    print("📋 State preparado:")
    print(f"  - Arquivo: {state['file_name']}")
    print(f"  - Modo: {state['analysis_mode']}")
    print(f"  - User ID: {state['user_id']}")
    
    # 3. Executar workflow
    print("\n🔄 Executando workflow...")
    start_time = time.time()
    
    try:
        result = await report_analysis_app.ainvoke(state)
        execution_time = time.time() - start_time
        
        print(f"✅ Workflow executado com sucesso em {execution_time:.2f}s")
        
        # 4. Analisar resultados
        print("\n📊 Análise dos resultados:")
        
        # Verificar campos principais
        if "extracted_data" in result:
            extracted = result["extracted_data"]
            print(f"  ✅ Dados extraídos: {len(extracted)} campos")
            print(f"     - Account: {extracted.get('accountNumber', 'N/A')}")
            print(f"     - Mês: {extracted.get('reportMonth', 'N/A')}")
            print(f"     - Rentabilidade mensal: {extracted.get('monthlyReturn', 'N/A')}")
            print(f"     - Classes: {len(extracted.get('classPerformance', []))}")
        
        if "performance_analysis" in result:
            analysis = result["performance_analysis"]
            print(f"  ✅ Análise de performance: {len(analysis)} caracteres")
            print(f"     Preview: {analysis[:100]}...")
        
        if "highlights" in result:
            highlights = result["highlights"]
            print(f"  ✅ Highlights: {len(highlights)} classes")
            for h in highlights:
                print(f"     - {h.get('className', 'N/A')}: {h.get('return', 'N/A')}")
        
        if "detractors" in result:
            detractors = result["detractors"]
            print(f"  ✅ Detractors: {len(detractors)} classes")
            for d in detractors:
                print(f"     - {d.get('className', 'N/A')}: {d.get('return', 'N/A')}")
        
        if "final_message" in result:
            message = result["final_message"]
            print(f"  ✅ Mensagem final: {len(message)} caracteres")
            print(f"     Preview: {message[:200]}...")
        
        # 5. Salvar resultado completo
        output_file = Path(__file__).parent / "test_workflow_result.json"
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        
        print(f"\n💾 Resultado salvo em: {output_file}")
        
        # 6. Verificar performance
        if execution_time > 30:
            print(f"⚠️  Performance: {execution_time:.2f}s (lento)")
        elif execution_time > 10:
            print(f"⚡ Performance: {execution_time:.2f}s (aceitável)")
        else:
            print(f"🚀 Performance: {execution_time:.2f}s (excelente)")
        
        return result
        
    except Exception as e:
        execution_time = time.time() - start_time
        print(f"❌ Erro no workflow após {execution_time:.2f}s: {e}")
        print(f"   Tipo do erro: {type(e).__name__}")
        
        # Salvar erro para debug
        error_file = Path(__file__).parent / "test_workflow_error.json"
        with open(error_file, "w", encoding="utf-8") as f:
            json.dump({
                "error": str(e),
                "error_type": type(e).__name__,
                "execution_time": execution_time,
                "state": state
            }, f, ensure_ascii=False, indent=2)
        
        print(f"💾 Erro salvo em: {error_file}")
        return None


async def test_extract_only_mode():
    """
    Testa apenas a extração (modo extract_only).
    """
    print("\n🔍 Testando modo extract_only...")
    
    pdf_path = Path(__file__).parent / "XPerformance - 5629450 - Ref.29.08 (1).pdf"
    
    with open(pdf_path, "rb") as f:
        pdf_content = f.read()
        pdf_base64 = base64.b64encode(pdf_content).decode('utf-8')
    
    state = {
        "file_content": pdf_base64,
        "file_name": pdf_path.name,
        "user_id": "test_user_123",
        "analysis_mode": "extract_only",
        "selected_fields": None
    }
    
    start_time = time.time()
    
    try:
        result = await report_analysis_app.ainvoke(state)
        execution_time = time.time() - start_time
        
        print(f"✅ Extração concluída em {execution_time:.2f}s")
        
        if "extracted_data" in result:
            extracted = result["extracted_data"]
            print(f"  📊 Dados extraídos: {len(extracted)} campos")
            
            # Verificar campos obrigatórios
            required_fields = ['accountNumber', 'reportMonth', 'benchmarkValues', 'classPerformance']
            missing_fields = [field for field in required_fields if field not in extracted]
            
            if missing_fields:
                print(f"  ⚠️  Campos obrigatórios ausentes: {missing_fields}")
            else:
                print(f"  ✅ Todos os campos obrigatórios presentes")
            
            # Mostrar alguns dados extraídos
            print(f"  📋 Account Number: {extracted.get('accountNumber', 'N/A')}")
            print(f"  📅 Report Month: {extracted.get('reportMonth', 'N/A')}")
            print(f"  📈 Monthly Return: {extracted.get('monthlyReturn', 'N/A')}")
            
            if 'benchmarkValues' in extracted:
                benchmarks = extracted['benchmarkValues']
                print(f"  🎯 Benchmarks: CDI={benchmarks.get('CDI', 'N/A')}, IPCA={benchmarks.get('IPCA', 'N/A')}")
            
            if 'classPerformance' in extracted:
                classes = extracted['classPerformance']
                print(f"  📊 Classes de ativo: {len(classes)}")
                for cls in classes[:3]:  # Mostrar apenas as primeiras 3
                    print(f"     - {cls.get('className', 'N/A')}: {cls.get('return', 'N/A')}")
        
        # Salvar resultado da extração
        output_file = Path(__file__).parent / "test_extract_only_result.json"
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        
        print(f"  💾 Resultado salvo em: {output_file}")
        
        return result
        
    except Exception as e:
        execution_time = time.time() - start_time
        print(f"❌ Erro na extração após {execution_time:.2f}s: {e}")
        print(f"   Tipo do erro: {type(e).__name__}")
        
        # Salvar erro para debug
        error_file = Path(__file__).parent / "test_extract_only_error.json"
        with open(error_file, "w", encoding="utf-8") as f:
            json.dump({
                "error": str(e),
                "error_type": type(e).__name__,
                "execution_time": execution_time,
                "state": state
            }, f, ensure_ascii=False, indent=2)
        
        print(f"💾 Erro salvo em: {error_file}")
        return None


async def test_personalized_mode():
    """
    Testa modo personalizado com campos selecionados.
    """
    print("\n🎯 Testando modo personalized...")
    
    pdf_path = Path(__file__).parent / "XPerformance - 5629450 - Ref.29.08 (1).pdf"
    
    with open(pdf_path, "rb") as f:
        pdf_content = f.read()
        pdf_base64 = base64.b64encode(pdf_content).decode('utf-8')
    
    # Campos selecionados para teste
    selected_fields = {
        "monthlyReturn": True,
        "yearlyReturn": True,
        "monthlyCdi": False,  # Não selecionado
        "classPerformance": {
            "Pós Fixado": True,
            "Inflação": False  # Não selecionado
        },
        "highlights": {
            "Pós Fixado": {0: True}
        },
        "detractors": {}
    }
    
    state = {
        "file_content": pdf_base64,
        "file_name": pdf_path.name,
        "user_id": "test_user_123",
        "analysis_mode": "personalized",
        "selected_fields": selected_fields
    }
    
    start_time = time.time()
    
    try:
        result = await report_analysis_app.ainvoke(state)
        execution_time = time.time() - start_time
        
        print(f"✅ Análise personalizada concluída em {execution_time:.2f}s")
        
        if "final_message" in result:
            message = result["final_message"]
            print(f"  📝 Mensagem personalizada: {len(message)} caracteres")
            print(f"     Preview: {message[:200]}...")
        
        # Verificar se apenas campos selecionados foram incluídos
        if "extracted_data" in result:
            extracted = result["extracted_data"]
            print(f"  🔍 Verificação de filtros:")
            print(f"     - monthlyReturn incluído: {'monthlyReturn' in extracted}")
            print(f"     - yearlyReturn incluído: {'yearlyReturn' in extracted}")
            print(f"     - monthlyCdi excluído: {'monthlyCdi' not in extracted}")
        
        # Salvar resultado
        output_file = Path(__file__).parent / "test_personalized_result.json"
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        
        print(f"  💾 Resultado salvo em: {output_file}")
        
        return result
        
    except Exception as e:
        execution_time = time.time() - start_time
        print(f"❌ Erro na análise personalizada após {execution_time:.2f}s: {e}")
        return None


async def main():
    """
    Executa todos os testes.
    """
    print("🧪 TESTE COMPLETO DO WORKFLOW REPORT ANALYZER")
    print("=" * 60)
    
    # Teste 1: Modo extract_only
    print("\n1️⃣ TESTE: Modo Extract Only")
    print("-" * 40)
    extract_result = await test_extract_only_mode()
    
    # Teste 2: Modo auto completo
    print("\n2️⃣ TESTE: Modo Auto Completo")
    print("-" * 40)
    auto_result = await test_workflow_with_real_report()
    
    # Teste 3: Modo personalized
    print("\n3️⃣ TESTE: Modo Personalized")
    print("-" * 40)
    personalized_result = await test_personalized_mode()
    
    # Resumo final
    print("\n" + "=" * 60)
    print("📊 RESUMO DOS TESTES:")
    print(f"  ✅ Extract Only: {'SUCESSO' if extract_result else 'FALHA'}")
    print(f"  ✅ Auto Completo: {'SUCESSO' if auto_result else 'FALHA'}")
    print(f"  ✅ Personalized: {'SUCESSO' if personalized_result else 'FALHA'}")
    
    success_count = sum([bool(extract_result), bool(auto_result), bool(personalized_result)])
    print(f"\n🎯 Taxa de sucesso: {success_count}/3 ({success_count/3*100:.1f}%)")
    
    if success_count == 3:
        print("🎉 TODOS OS TESTES PASSARAM! Workflow está funcionando perfeitamente.")
    elif success_count >= 2:
        print("⚠️  Maioria dos testes passou. Verificar falhas individuais.")
    else:
        print("❌ Muitos testes falharam. Verificar configuração e dependências.")
    
    print("\n🏁 Testes concluídos!")


if __name__ == "__main__":
    asyncio.run(main())