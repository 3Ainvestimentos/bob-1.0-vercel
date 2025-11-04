"""
Testes para os nós de formatação de mensagens.
"""
import pytest
import json
from unittest.mock import Mock, patch
from app.services.report_analyzer.nodes.format_message import (
    format_message_auto,
    format_message_custom,
    _filter_data_by_selection,
    _filter_highlights_detractors
)


class TestFormatMessageAuto:
    """Testes para formatação automática."""
    
    @patch('app.services.report_analyzer.nodes.format_message.ChatGoogleGenerativeAI')
    @patch('app.services.report_analyzer.nodes.format_message.os.environ')
    def test_format_message_auto_success(self, mock_env, mock_llm_class):
        """Teste de formatação automática bem-sucedida."""
        # Mock do LLM
        mock_llm = Mock()
        mock_response = Mock()
        mock_response.content = "Olá, 123456!\n🔎 Resumo da performance:\nEm 09/2024 sua carteira rendeu 1,06%..."
        mock_llm.invoke.return_value = mock_response
        mock_llm_class.return_value = mock_llm
        
        # State de teste
        state = {
            "extracted_data": {
                "accountNumber": "123456",
                "reportMonth": "09/2024",
                "monthlyReturn": "1,06%",
                "monthlyCdi": "91,38%",
                "monthlyGain": "R$ 1.234,56",
                "yearlyReturn": "12,34%",
                "yearlyCdi": "136,78%",
                "yearlyGain": "R$ 12.345,67",
                "benchmarkValues": {
                    "CDI": "1,16%",
                    "IPCA": "-0,13%",
                    "Ibovespa": "2,34%",
                    "Dólar": "1,23%"
                },
                "classPerformance": [
                    {"className": "Pós Fixado", "return": "1,17%", "cdiPercentage": "100,86%"}
                ]
            },
            "performance_analysis": "Análise detalhada da performance...",
            "highlights": [
                {
                    "className": "Pós Fixado",
                    "return": "1,17%",
                    "benchmark": "CDI",
                    "difference": "0,01%",
                    "drivers": [
                        {"asset": "LCA BANCO ITAU", "return": "1,15%"}
                    ]
                }
            ],
            "detractors": []
        }
        
        # Executar
        result = format_message_auto(state)
        
        # Verificações
        assert "final_message" in result
        assert result["final_message"] == "Olá, 123456!\n🔎 Resumo da performance:\nEm 09/2024 sua carteira rendeu 1,06%..."
        assert result["metadata"]["format_mode"] == "auto"
        assert result["metadata"]["message_length"] > 0
        
        # Verificar se LLM foi chamado
        mock_llm.invoke.assert_called_once()
        mock_env.__setitem__.assert_called_with("LANGCHAIN_PROJECT", "report-analyzer")
    
    def test_format_message_auto_missing_extracted_data(self):
        """Teste com extracted_data ausente."""
        state = {
            "performance_analysis": "Análise...",
            "highlights": [],
            "detractors": []
        }
        
        result = format_message_auto(state)
        
        assert "error" in result
        assert "extracted_data não encontrado" in result["error"]
    
    def test_format_message_auto_missing_performance_analysis(self):
        """Teste com performance_analysis ausente."""
        state = {
            "extracted_data": {"accountNumber": "123456"},
            "highlights": [],
            "detractors": []
        }
        
        result = format_message_auto(state)
        
        assert "error" in result
        assert "performance_analysis não encontrado" in result["error"]
    
    @patch('app.services.report_analyzer.nodes.format_message.ChatGoogleGenerativeAI')
    def test_format_message_auto_llm_empty_response(self, mock_llm_class):
        """Teste com resposta vazia do LLM."""
        mock_llm = Mock()
        mock_response = Mock()
        mock_response.content = ""
        mock_llm.invoke.return_value = mock_response
        mock_llm_class.return_value = mock_llm
        
        state = {
            "extracted_data": {"accountNumber": "123456"},
            "performance_analysis": "Análise...",
            "highlights": [],
            "detractors": []
        }
        
        result = format_message_auto(state)
        
        assert "error" in result
        assert "LLM retornou resposta vazia" in result["error"]


class TestFormatMessageCustom:
    """Testes para formatação personalizada."""
    
    @patch('app.services.report_analyzer.nodes.format_message.ChatGoogleGenerativeAI')
    def test_format_message_custom_success(self, mock_llm_class):
        """Teste de formatação personalizada bem-sucedida."""
        # Mock do LLM
        mock_llm = Mock()
        mock_response = Mock()
        mock_response.content = "Olá, 123456!\n🔎 Resumo personalizado..."
        mock_llm.invoke.return_value = mock_response
        mock_llm_class.return_value = mock_llm
        
        # State de teste
        state = {
            "extracted_data": {
                "accountNumber": "123456",
                "reportMonth": "09/2024",
                "monthlyReturn": "1,06%",
                "yearlyReturn": "12,34%",
                "benchmarkValues": {"CDI": "1,16%"},
                "classPerformance": [
                    {"className": "Pós Fixado", "return": "1,17%", "cdiPercentage": "100,86%"}
                ]
            },
            "selected_fields": {
                "monthlyReturn": True,
                "yearlyReturn": True,
                "classPerformance": {"Pós Fixado": True},
                "highlights": {"Pós Fixado": {0: True}},
                "detractors": {}
            },
            "performance_analysis": "Análise personalizada...",
            "highlights": [
                {
                    "className": "Pós Fixado",
                    "return": "1,17%",
                    "benchmark": "CDI",
                    "difference": "0,01%"
                }
            ],
            "detractors": []
        }
        
        # Executar
        result = format_message_custom(state)
        
        # Verificações
        assert "final_message" in result
        assert result["metadata"]["format_mode"] == "custom"
        assert result["metadata"]["fields_selected"] == 5
        
        # Verificar se LLM foi chamado
        mock_llm.invoke.assert_called_once()
    
    @patch('app.services.report_analyzer.nodes.format_message.format_message_auto')
    def test_format_message_custom_no_selection_fallback(self, mock_format_auto):
        """Teste de fallback para formatação automática quando não há seleção."""
        mock_format_auto.return_value = {"final_message": "Mensagem automática"}
        
        state = {
            "extracted_data": {"accountNumber": "123456"},
            "selected_fields": {},  # Vazio
            "performance_analysis": "Análise...",
            "highlights": [],
            "detractors": []
        }
        
        result = format_message_custom(state)
        
        # Deve chamar format_message_auto
        mock_format_auto.assert_called_once_with(state)
        assert result == {"final_message": "Mensagem automática"}
    
    def test_format_message_custom_missing_extracted_data(self):
        """Teste com extracted_data ausente."""
        state = {
            "selected_fields": {"monthlyReturn": True},
            "performance_analysis": "Análise...",
            "highlights": [],
            "detractors": []
        }
        
        result = format_message_custom(state)
        
        assert "error" in result
        assert "extracted_data não encontrado" in result["error"]


class TestFilterDataBySelection:
    """Testes para filtragem de dados por seleção."""
    
    def test_filter_data_by_selection_basic_fields(self):
        """Teste de filtragem de campos básicos."""
        extracted_data = {
            "accountNumber": "123456",
            "reportMonth": "09/2024",
            "monthlyReturn": "1,06%",
            "monthlyCdi": "91,38%",
            "yearlyReturn": "12,34%",
            "yearlyGain": "R$ 12.345,67",
            "benchmarkValues": {"CDI": "1,16%"},
            "classPerformance": [
                {"className": "Pós Fixado", "return": "1,17%"},
                {"className": "Inflação", "return": "0,89%"}
            ]
        }
        
        selected_fields = {
            "monthlyReturn": True,
            "yearlyReturn": True,
            "monthlyCdi": False,  # Não selecionado
            "classPerformance": {
                "Pós Fixado": True,
                "Inflação": False
            }
        }
        
        result = _filter_data_by_selection(extracted_data, selected_fields)
        
        # Verificações
        assert "accountNumber" not in result  # Não está na lista de campos top-level
        assert "monthlyReturn" in result
        assert "yearlyReturn" in result
        assert "monthlyCdi" not in result  # Não selecionado
        assert "benchmarkValues" in result  # Sempre incluído
        
        # classPerformance filtrado
        assert len(result["classPerformance"]) == 1
        assert result["classPerformance"][0]["className"] == "Pós Fixado"
    
    def test_filter_data_by_selection_empty_selection(self):
        """Teste com seleção vazia."""
        extracted_data = {
            "monthlyReturn": "1,06%",
            "benchmarkValues": {"CDI": "1,16%"},
            "classPerformance": [{"className": "Pós Fixado", "return": "1,17%"}]
        }
        
        selected_fields = {}
        
        result = _filter_data_by_selection(extracted_data, selected_fields)
        
        # Deve retornar apenas benchmarkValues
        assert "benchmarkValues" in result
        assert "monthlyReturn" not in result
        assert "classPerformance" not in result


class TestFilterHighlightsDetractors:
    """Testes para filtragem de highlights e detractors."""
    
    def test_filter_highlights_detractors_with_selection(self):
        """Teste de filtragem com seleção específica."""
        items = [
            {
                "className": "Pós Fixado",
                "return": "1,17%",
                "benchmark": "CDI",
                "difference": "0,01%"
            },
            {
                "className": "Inflação",
                "return": "0,89%",
                "benchmark": "IPCA",
                "difference": "1,02%"
            }
        ]
        
        selection = {
            "Pós Fixado": {0: True, 1: False},
            "Inflação": {0: True, 1: True}
        }
        
        result = _filter_highlights_detractors(items, selection)
        
        # Deve incluir ambos (ambos têm pelo menos um índice selecionado)
        assert len(result) == 2
        assert result[0]["className"] == "Pós Fixado"
        assert result[1]["className"] == "Inflação"
    
    def test_filter_highlights_detractors_no_selection(self):
        """Teste sem seleção (deve retornar todos)."""
        items = [
            {"className": "Pós Fixado", "return": "1,17%"},
            {"className": "Inflação", "return": "0,89%"}
        ]
        
        selection = {}
        
        result = _filter_highlights_detractors(items, selection)
        
        # Deve retornar todos os itens
        assert len(result) == 2
        assert result == items
    
    def test_filter_highlights_detractors_empty_items(self):
        """Teste com lista vazia."""
        items = []
        selection = {"Pós Fixado": {0: True}}
        
        result = _filter_highlights_detractors(items, selection)
        
        assert result == []


class TestIntegration:
    """Testes de integração."""
    
    @patch('app.services.report_analyzer.nodes.format_message.ChatGoogleGenerativeAI')
    def test_format_message_custom_with_filtering(self, mock_llm_class):
        """Teste de formatação personalizada com filtragem real."""
        # Mock do LLM
        mock_llm = Mock()
        mock_response = Mock()
        mock_response.content = "Mensagem personalizada filtrada"
        mock_llm.invoke.return_value = mock_response
        mock_llm_class.return_value = mock_llm
        
        # State completo
        state = {
            "extracted_data": {
                "accountNumber": "123456",
                "reportMonth": "09/2024",
                "monthlyReturn": "1,06%",
                "monthlyCdi": "91,38%",
                "yearlyReturn": "12,34%",
                "yearlyGain": "R$ 12.345,67",
                "benchmarkValues": {"CDI": "1,16%", "IPCA": "-0,13%"},
                "classPerformance": [
                    {"className": "Pós Fixado", "return": "1,17%", "cdiPercentage": "100,86%"},
                    {"className": "Inflação", "return": "0,89%", "cdiPercentage": "76,72%"}
                ]
            },
            "selected_fields": {
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
            },
            "performance_analysis": "Análise personalizada...",
            "highlights": [
                {
                    "className": "Pós Fixado",
                    "return": "1,17%",
                    "benchmark": "CDI",
                    "difference": "0,01%"
                },
                {
                    "className": "Inflação",
                    "return": "0,89%",
                    "benchmark": "IPCA",
                    "difference": "1,02%"
                }
            ],
            "detractors": []
        }
        
        # Executar
        result = format_message_custom(state)
        
        # Verificações
        assert "final_message" in result
        assert result["metadata"]["format_mode"] == "custom"
        
        # Verificar se o prompt foi construído com dados filtrados
        call_args = mock_llm.invoke.call_args[0][0][0].content
        
        # Deve conter dados filtrados
        assert "monthlyReturn" in call_args
        assert "yearlyReturn" in call_args
        assert "monthlyCdi" not in call_args  # Não selecionado
        
        # Deve conter apenas Pós Fixado na classPerformance
        assert "Pós Fixado" in call_args
        assert "Inflação" not in call_args  # Não selecionado


if __name__ == "__main__":
    pytest.main([__file__])
