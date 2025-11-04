"""
Testes unitários para o nó analyze_report.
"""
import pytest
from unittest.mock import Mock, patch, MagicMock
from app.services.report_analyzer.nodes.analyze_report import (
    validate_extracted_data,
    parse_json_response,
    call_llm_with_retry,
    validate_analysis_structure,
    analyze_report
)


# ==================== TESTES DE VALIDAÇÃO DE DADOS ====================

def test_validate_extracted_data_valid():
    """Testa validação com dados completos e válidos."""
    data = {
        'accountNumber': '123456',
        'reportMonth': '09/2024',
        'benchmarkValues': {
            'CDI': '1,16%',
            'IPCA': '-0,13%',
            'Ibovespa': '2,45%'
        },
        'classPerformance': [
            {'className': 'Pós Fixado', 'return': '1,17%', 'cdiPercentage': '100,86%'}
        ]
    }
    
    is_valid, error = validate_extracted_data(data)
    assert is_valid is True
    assert error is None


def test_validate_extracted_data_missing_field():
    """Testa validação com campo obrigatório ausente."""
    data = {
        'accountNumber': '123456',
        'reportMonth': '09/2024',
        # benchmarkValues ausente
        'classPerformance': [
            {'className': 'Pós Fixado', 'return': '1,17%'}
        ]
    }
    
    is_valid, error = validate_extracted_data(data)
    assert is_valid is False
    assert 'benchmarkValues' in error


def test_validate_extracted_data_empty_benchmarks():
    """Testa validação com benchmarkValues vazio."""
    data = {
        'accountNumber': '123456',
        'reportMonth': '09/2024',
        'benchmarkValues': {},  # Vazio
        'classPerformance': [
            {'className': 'Pós Fixado', 'return': '1,17%'}
        ]
    }
    
    is_valid, error = validate_extracted_data(data)
    assert is_valid is False
    assert 'benchmark' in error.lower()


def test_validate_extracted_data_empty_class_performance():
    """Testa validação com classPerformance vazio."""
    data = {
        'accountNumber': '123456',
        'reportMonth': '09/2024',
        'benchmarkValues': {'CDI': '1,16%'},
        'classPerformance': []  # Lista vazia
    }
    
    is_valid, error = validate_extracted_data(data)
    assert is_valid is False
    assert 'classPerformance' in error


# ==================== TESTES DE PARSING JSON ====================

def test_parse_json_response_valid():
    """Testa parsing de JSON válido."""
    response_text = '{"performance_analysis": "Análise completa", "highlights": [], "detractors": []}'
    
    result = parse_json_response(response_text)
    assert result is not None
    assert result['performance_analysis'] == 'Análise completa'
    assert isinstance(result['highlights'], list)


def test_parse_json_response_with_markdown():
    """Testa parsing de JSON com markdown code blocks."""
    response_text = '''```json
{
  "performance_analysis": "Análise",
  "highlights": [],
  "detractors": []
}
```'''
    
    result = parse_json_response(response_text)
    assert result is not None
    assert result['performance_analysis'] == 'Análise'


def test_parse_json_response_malformed():
    """Testa parsing de JSON malformado."""
    response_text = '{"performance_analysis": "Análise", invalid json}'
    
    result = parse_json_response(response_text)
    assert result is None


# ==================== TESTES DE VALIDAÇÃO DE ESTRUTURA ====================

def test_validate_analysis_structure_valid():
    """Testa validação de estrutura correta."""
    analysis = {
        'performance_analysis': 'Análise detalhada',
        'highlights': [
            {
                'className': 'Pós Fixado',
                'return': '1,17%',
                'benchmark': 'CDI',
                'difference': '0,01%',
                'drivers': [{'asset': 'LCA BANCO', 'return': '1,15%'}]
            }
        ],
        'detractors': []
    }
    
    is_valid, error = validate_analysis_structure(analysis)
    assert is_valid is True
    assert error is None


def test_validate_analysis_structure_missing_key():
    """Testa validação com campo obrigatório ausente."""
    analysis = {
        'performance_analysis': 'Análise',
        'highlights': []
        # detractors ausente
    }
    
    is_valid, error = validate_analysis_structure(analysis)
    assert is_valid is False
    assert 'detractors' in error


def test_validate_analysis_structure_wrong_type():
    """Testa validação com tipo incorreto."""
    analysis = {
        'performance_analysis': 'Análise',
        'highlights': "não é lista",  # Deveria ser lista
        'detractors': []
    }
    
    is_valid, error = validate_analysis_structure(analysis)
    assert is_valid is False
    assert 'lista' in error.lower()


# ==================== TESTES DE RETRY LOGIC ====================

@patch('app.services.report_analyzer.nodes.analyze_report.time.sleep')
@patch('app.services.report_analyzer.nodes.analyze_report.ChatGoogleGenerativeAI')
def test_call_llm_with_retry_success_first_attempt(mock_llm_class, mock_sleep):
    """Testa sucesso na primeira tentativa."""
    # Mock do LLM
    mock_llm = Mock()
    mock_response = Mock()
    mock_response.content = '{"performance_analysis": "Análise", "highlights": [], "detractors": []}'
    mock_llm.invoke.return_value = mock_response
    mock_llm_class.return_value = mock_llm
    
    result = call_llm_with_retry("prompt teste")
    
    assert result is not None
    assert result['performance_analysis'] == 'Análise'
    assert mock_llm.invoke.call_count == 1
    mock_sleep.assert_not_called()


@patch('app.services.report_analyzer.nodes.analyze_report.time.sleep')
@patch('app.services.report_analyzer.nodes.analyze_report.ChatGoogleGenerativeAI')
def test_call_llm_with_retry_success_second_attempt(mock_llm_class, mock_sleep):
    """Testa sucesso na segunda tentativa."""
    # Mock do LLM
    mock_llm = Mock()
    
    # Primeira tentativa: JSON inválido
    mock_response_1 = Mock()
    mock_response_1.content = 'invalid json'
    
    # Segunda tentativa: JSON válido
    mock_response_2 = Mock()
    mock_response_2.content = '{"performance_analysis": "Análise", "highlights": [], "detractors": []}'
    
    mock_llm.invoke.side_effect = [mock_response_1, mock_response_2]
    mock_llm_class.return_value = mock_llm
    
    result = call_llm_with_retry("prompt teste", max_retries=3)
    
    assert result is not None
    assert result['performance_analysis'] == 'Análise'
    assert mock_llm.invoke.call_count == 2
    mock_sleep.assert_called_once()


@patch('app.services.report_analyzer.nodes.analyze_report.time.sleep')
@patch('app.services.report_analyzer.nodes.analyze_report.ChatGoogleGenerativeAI')
def test_call_llm_with_retry_all_attempts_fail(mock_llm_class, mock_sleep):
    """Testa falha em todas as tentativas."""
    # Mock do LLM
    mock_llm = Mock()
    mock_response = Mock()
    mock_response.content = 'invalid json sempre'
    mock_llm.invoke.return_value = mock_response
    mock_llm_class.return_value = mock_llm
    
    result = call_llm_with_retry("prompt teste", max_retries=3)
    
    assert result is None
    assert mock_llm.invoke.call_count == 3
    assert mock_sleep.call_count == 2  # Entre tentativas 1-2 e 2-3


@patch('app.services.report_analyzer.nodes.analyze_report.time.sleep')
@patch('app.services.report_analyzer.nodes.analyze_report.ChatGoogleGenerativeAI')
def test_call_llm_with_retry_exception_handling(mock_llm_class, mock_sleep):
    """Testa tratamento de exceções."""
    # Mock do LLM
    mock_llm = Mock()
    
    # Primeiras 2 tentativas lançam exceção
    # Terceira tentativa retorna sucesso
    mock_response = Mock()
    mock_response.content = '{"performance_analysis": "Análise", "highlights": [], "detractors": []}'
    
    mock_llm.invoke.side_effect = [
        Exception("API error"),
        Exception("API error"),
        mock_response
    ]
    mock_llm_class.return_value = mock_llm
    
    result = call_llm_with_retry("prompt teste", max_retries=3)
    
    assert result is not None
    assert mock_llm.invoke.call_count == 3


# ==================== TESTES INTEGRADOS (analyze_report) ====================

@patch('app.services.report_analyzer.nodes.analyze_report.ChatGoogleGenerativeAI')
@patch('app.services.report_analyzer.nodes.analyze_report.time.sleep')
def test_analyze_report_success(mock_sleep, mock_llm_class):
    """Testa fluxo completo de análise bem-sucedido."""
    # Mock do LLM
    mock_llm = Mock()
    mock_response = Mock()
    mock_response.content = '''{
        "performance_analysis": "Sua carteira teve excelente performance no mês.",
        "highlights": [
            {
                "className": "Pós Fixado",
                "return": "1,17%",
                "benchmark": "CDI",
                "difference": "0,01%",
                "drivers": [{"asset": "LCA BANCO", "return": "1,15%"}]
            }
        ],
        "detractors": []
    }'''
    mock_llm.invoke.return_value = mock_response
    mock_llm_class.return_value = mock_llm
    
    # State de entrada
    state = {
        'extracted_data': {
            'accountNumber': '123456',
            'reportMonth': '09/2024',
            'benchmarkValues': {'CDI': '1,16%'},
            'classPerformance': [
                {'className': 'Pós Fixado', 'return': '1,17%', 'cdiPercentage': '100,86%'}
            ]
        }
    }
    
    result = analyze_report(state)
    
    assert result['error'] is None
    assert 'performance_analysis' in result
    assert len(result['highlights']) == 1
    assert result['highlights'][0]['className'] == 'Pós Fixado'
    assert 'metadata' in result
    assert result['metadata']['model_used'] == 'gemini-2.0-flash-exp'


def test_analyze_report_missing_extracted_data():
    """Testa erro quando extracted_data está ausente."""
    state = {}  # Sem extracted_data
    
    result = analyze_report(state)
    
    assert result['error'] is not None
    assert 'extracted_data não encontrado' in result['error']
    assert result['performance_analysis'] == ''
    assert result['highlights'] == []


def test_analyze_report_invalid_extracted_data():
    """Testa erro com dados extraídos inválidos."""
    state = {
        'extracted_data': {
            'accountNumber': '123456'
            # Campos obrigatórios ausentes
        }
    }
    
    result = analyze_report(state)
    
    assert result['error'] is not None
    assert 'inválidos' in result['error']
    assert result['performance_analysis'] == ''


@patch('app.services.report_analyzer.nodes.analyze_report.ChatGoogleGenerativeAI')
@patch('app.services.report_analyzer.nodes.analyze_report.time.sleep')
def test_analyze_report_llm_failure(mock_sleep, mock_llm_class):
    """Testa erro quando LLM falha após todas as tentativas."""
    # Mock do LLM
    mock_llm = Mock()
    mock_response = Mock()
    mock_response.content = 'invalid json sempre'
    mock_llm.invoke.return_value = mock_response
    mock_llm_class.return_value = mock_llm
    
    state = {
        'extracted_data': {
            'accountNumber': '123456',
            'reportMonth': '09/2024',
            'benchmarkValues': {'CDI': '1,16%'},
            'classPerformance': [
                {'className': 'Pós Fixado', 'return': '1,17%'}
            ]
        }
    }
    
    result = analyze_report(state)
    
    assert result['error'] is not None
    assert '3 tentativas' in result['error']


@patch('app.services.report_analyzer.nodes.analyze_report.ChatGoogleGenerativeAI')
def test_analyze_report_invalid_structure(mock_llm_class):
    """Testa erro quando estrutura da resposta é inválida."""
    # Mock do LLM
    mock_llm = Mock()
    mock_response = Mock()
    # Resposta com estrutura incorreta (falta 'detractors')
    mock_response.content = '''{
        "performance_analysis": "Análise",
        "highlights": []
    }'''
    mock_llm.invoke.return_value = mock_response
    mock_llm_class.return_value = mock_llm
    
    state = {
        'extracted_data': {
            'accountNumber': '123456',
            'reportMonth': '09/2024',
            'benchmarkValues': {'CDI': '1,16%'},
            'classPerformance': [
                {'className': 'Pós Fixado', 'return': '1,17%'}
            ]
        }
    }
    
    result = analyze_report(state)
    
    assert result['error'] is not None
    assert 'Estrutura de análise inválida' in result['error']


# ==================== TESTES DE DRILL-DOWN ====================

@patch('app.services.report_analyzer.nodes.analyze_report.ChatGoogleGenerativeAI')
def test_analyze_report_with_drivers(mock_llm_class):
    """Testa se drill-down de ativos drivers está presente."""
    # Mock do LLM
    mock_llm = Mock()
    mock_response = Mock()
    mock_response.content = '''{
        "performance_analysis": "Análise com drivers",
        "highlights": [
            {
                "className": "Pós Fixado",
                "return": "1,17%",
                "benchmark": "CDI",
                "difference": "0,01%",
                "drivers": [
                    {"asset": "LCA BANCO ITAU", "return": "1,15%"},
                    {"asset": "CDB BANCO XYZ", "return": "1,14%"}
                ]
            }
        ],
        "detractors": []
    }'''
    mock_llm.invoke.return_value = mock_response
    mock_llm_class.return_value = mock_llm
    
    state = {
        'extracted_data': {
            'accountNumber': '123456',
            'reportMonth': '09/2024',
            'benchmarkValues': {'CDI': '1,16%'},
            'classPerformance': [
                {'className': 'Pós Fixado', 'return': '1,17%'}
            ]
        }
    }
    
    result = analyze_report(state)
    
    assert result['error'] is None
    assert len(result['highlights']) == 1
    assert 'drivers' in result['highlights'][0]
    assert len(result['highlights'][0]['drivers']) == 2
    assert result['highlights'][0]['drivers'][0]['asset'] == 'LCA BANCO ITAU'