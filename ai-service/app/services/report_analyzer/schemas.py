"""
Schemas JSON para Structured Output do Gemini.
Garante que as respostas sejam sempre JSON válido e estruturado.
"""
import json

# Schema para extração de dados (modo otimizado)
EXTRACTED_DATA_SCHEMA_OPTIMIZED = {
    "type": "object",
    "properties": {
        "accountNumber": {
            "type": "string",
            "description": "Número da conta do cliente"
        },
        "reportMonth": {
            "type": "string",
            "description": "Mês de referência do relatório (formato: MM/AAAA)"
        },
        "grossEquity": {
            "type": "string",
            "description": "Patrimônio total bruto (formato: R$ X.XXX,XX)"
        },
        "monthlyReturn": {
            "type": "string",
            "description": "Rentabilidade percentual do mês (ex: '1,32%')"
        },
        "monthlyCdi": {
            "type": "string",
            "description": "Rentabilidade em %CDI do mês (ex: '125,03%')"
        },
        "monthlyGain": {
            "type": "string",
            "description": "Ganho financeiro do mês (formato: R$ X.XXX,XX)"
        },
        "yearlyReturn": {
            "type": "string",
            "description": "Rentabilidade percentual do ano (ex: '15,49%')"
        },
        "yearlyCdi": {
            "type": "string",
            "description": "Rentabilidade em %CDI do ano (ex: '119,76%')"
        },
        "yearlyGain": {
            "type": "string",
            "description": "Ganho financeiro do ano (formato: R$ X.XXX,XX)"
        },
        "benchmarkValues": {
            "type": "object",
            "description": "Valores dos benchmarks do mês atual (podem ser negativos)",
            "properties": {
                "CDI": {
                    "type": "string",
                    "description": "Percentual do CDI"
                },
                "Ibovespa": {
                    "type": "string",
                    "description": "Percentual do Ibovespa"
                },
                "IPCA": {
                    "type": "string",
                    "description": "Percentual do IPCA (pode ser negativo)"
                },
                "Dólar": {
                    "type": "string",
                    "description": "Percentual do Dólar (pode ser negativo)"
                }
            },
            "required": ["CDI", "Ibovespa", "IPCA", "Dólar"]
        },
        "classPerformance": {
            "type": "array",
            "description": "Array com performance por classe de ativo",
            "items": {
                "type": "object",
                "properties": {
                    "className": {
                        "type": "string",
                        "description": "Nome da classe de ativo"
                    },
                    "classReturn": {
                        "type": "string",
                        "description": "Rentabilidade percentual do mês"
                    },
                    "benchmark": {
                        "type": "string",
                        "description": "Benchmark correspondente (CDI, IPCA, Ibovespa)"
                    },
                    "benchmarkDifference": {
                        "type": "string",
                        "description": "Diferença em relação ao benchmark (pode ser negativo)"
                    }
                },
                "required": ["className", "classReturn", "benchmark", "benchmarkDifference"]
            }
        },
        "topAssets": {
            "type": "object",
            "description": "Objeto organizado por classe de ativo com os 2 melhores ativos de cada classe",
            "additionalProperties": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "assetName": {
                            "type": "string",
                            "description": "Nome do ativo"
                        },
                        "assetReturn": {
                            "type": "string",
                            "description": "Rentabilidade do ativo (ex: '1,56%')"
                        },
                        "assetType": {
                            "type": "string",
                            "description": "Tipo específico do ativo (ex: 'CDB', 'NTN-B')"
                        }
                    },
                    "required": ["assetName", "assetReturn", "assetType"]
                }
            }
        }
    },
    "required": [
        "accountNumber",
        "reportMonth",
        "grossEquity",
        "monthlyReturn",
        "monthlyCdi",
        "monthlyGain",
        "yearlyReturn",
        "yearlyCdi",
        "yearlyGain",
        "benchmarkValues",
        "classPerformance",
        "topAssets"
    ]
}

# Schema para análise de relatório
ANALYSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "highlights": {
            "type": "array",
            "description": "Lista de classes acima do benchmark com ativos drivers",
            "items": {
                "type": "object",
                "properties": {
                    "className": {
                        "type": "string",
                        "description": "Nome da classe"
                    },
                    "classReturn": {
                        "type": "string",
                        "description": "Rentabilidade da classe"
                    },
                    "classBenchmark": {
                        "type": "string",
                        "description": "Benchmark correspondente"
                    },
                    "classBenchmarkValue": {
                        "type": "string",
                        "description": "Valor do benchmark"
                    },
                    "benchmarkDifference": {
                        "type": "string",
                        "description": "Diferença em relação ao benchmark"
                    },
                    "drivers": {
                        "type": "array",
                        "description": "Ativos individuais que impulsionaram o resultado",
                        "items": {
                            "type": "object",
                            "properties": {
                                "assetName": {
                                    "type": "string",
                                    "description": "Nome do ativo"
                                },
                                "assetReturn": {
                                    "type": "string",
                                    "description": "Rentabilidade do ativo"
                                },
                                "assetType": {
                                    "type": "string",
                                    "description": "Tipo específico do ativo"
                                }
                            },
                            "required": ["assetName", "assetReturn", "assetType"]
                        }
                    }
                },
                "required": ["className", "classReturn", "classBenchmark", "classBenchmarkValue", "benchmarkDifference", "drivers"]
            }
        },
        "detractors": {
            "type": "array",
            "description": "Lista de classes abaixo do benchmark (pode ser vazia)",
            "items": {
                "type": "object",
                "properties": {
                    "className": {
                        "type": "string",
                        "description": "Nome da classe"
                    },
                    "classReturn": {
                        "type": "string",
                        "description": "Rentabilidade da classe"
                    },
                    "classBenchmark": {
                        "type": "string",
                        "description": "Benchmark correspondente"
                    },
                    "classBenchmarkValue": {
                        "type": "string",
                        "description": "Valor do benchmark"
                    },
                    "benchmarkDifference": {
                        "type": "string",
                        "description": "Diferença em relação ao benchmark (negativo)"
                    }
                },
                "required": ["className", "classReturn", "classBenchmark", "classBenchmarkValue", "benchmarkDifference"]
            }
        }
    },
    "required": ["highlights", "detractors"]
}

# Schema para extração de dados (modo personalizado - FULL)
EXTRACTED_DATA_SCHEMA_FULL = {
    "type": "object",
    "properties": {
        "accountNumber": {
            "type": "string",
            "description": "Número da conta do cliente"
        },
        "reportMonth": {
            "type": "string",
            "description": "Mês de referência do relatório (formato: MM/AAAA)"
        },
        "grossEquity": {
            "type": "string",
            "description": "Patrimônio total bruto (formato: R$ X.XXX,XX)"
        },
        "monthlyReturn": {
            "type": "string",
            "description": "Rentabilidade percentual do mês (ex: '1,32%')"
        },
        "monthlyCdi": {
            "type": "string",
            "description": "Rentabilidade em %CDI do mês (ex: '125,03%')"
        },
        "monthlyGain": {
            "type": "string",
            "description": "Ganho financeiro do mês (formato: R$ X.XXX,XX)"
        },
        "yearlyReturn": {
            "type": "string",
            "description": "Rentabilidade percentual do ano (ex: '15,49%')"
        },
        "yearlyCdi": {
            "type": "string",
            "description": "Rentabilidade em %CDI do ano (ex: '119,76%')"
        },
        "yearlyGain": {
            "type": "string",
            "description": "Ganho financeiro do ano (formato: R$ X.XXX,XX)"
        },
        "benchmarkValues": {
            "type": "object",
            "description": "Valores dos benchmarks do mês atual (podem ser negativos)",
            "properties": {
                "CDI": {
                    "type": "string",
                    "description": "Percentual do CDI"
                },
                "Ibovespa": {
                    "type": "string",
                    "description": "Percentual do Ibovespa"
                },
                "IPCA": {
                    "type": "string",
                    "description": "Percentual do IPCA (pode ser negativo)"
                },
                "Dólar": {
                    "type": "string",
                    "description": "Percentual do Dólar (pode ser negativo)"
                }
            },
            "required": ["CDI", "Ibovespa", "IPCA", "Dólar"]
        },
        "classPerformance": {
            "type": "array",
            "description": "Array com performance por classe de ativo",
            "items": {
                "type": "object",
                "properties": {
                    "className": {
                        "type": "string",
                        "description": "Nome da classe de ativo"
                    },
                    "classReturn": {
                        "type": "string",
                        "description": "Rentabilidade percentual do mês"
                    },
                    "benchmark": {
                        "type": "string",
                        "description": "Benchmark correspondente (CDI, IPCA, Ibovespa)"
                    },
                    "benchmarkDifference": {
                        "type": "string",
                        "description": "Diferença em relação ao benchmark (pode ser negativo)"
                    }
                },
                "required": ["className", "classReturn", "benchmark", "benchmarkDifference"]
            }
        },
        "allAssets": {
            "type": "object",
            "description": "Objeto com TODOS os ativos listados, agrupados por classe de ativo",
            "additionalProperties": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "assetName": {
                            "type": "string",
                            "description": "Nome completo do ativo"
                        },
                        "assetReturn": {
                            "type": "string",
                            "description": "Rentabilidade do mês (ex: '2,57%')"
                        },
                        "assetType": {
                            "type": "string",
                            "description": "Tipo específico do ativo (opcional, mas recomendado)"
                        }
                    },
                    "required": ["assetName", "assetReturn"]
                }
            }
        }
    },
    "required": [
        "accountNumber",
        "reportMonth",
        "grossEquity",
        "monthlyReturn",
        "monthlyCdi",
        "monthlyGain",
        "yearlyReturn",
        "yearlyCdi",
        "yearlyGain",
        "benchmarkValues",
        "classPerformance",
        "allAssets"
    ]
}

# Schema para análise de relatório (modo personalizado)
ANALYSIS_SCHEMA_PERSONALIZED = {
    "type": "object",
    "properties": {
        "highlights": {
            "type": "array",
            "description": "Lista de classes acima do benchmark com ativos drivers",
            "items": {
                "type": "object",
                "properties": {
                    "className": {
                        "type": "string",
                        "description": "Nome da classe"
                    },
                    "classReturn": {
                        "type": "string",
                        "description": "Rentabilidade da classe"
                    },
                    "classBenchmark": {
                        "type": "string",
                        "description": "Benchmark correspondente"
                    },
                    "classBenchmarkValue": {
                        "type": "string",
                        "description": "Valor do benchmark"
                    },
                    "benchmarkDifference": {
                        "type": "string",
                        "description": "Diferença em relação ao benchmark"
                    },
                    "drivers": {
                        "type": "array",
                        "description": "Ativos individuais que impulsionaram o resultado",
                        "items": {
                            "type": "object",
                            "properties": {
                                "assetName": {
                                    "type": "string",
                                    "description": "Nome do ativo"
                                },
                                "assetReturn": {
                                    "type": "string",
                                    "description": "Rentabilidade do ativo"
                                },
                                "assetType": {
                                    "type": "string",
                                    "description": "Tipo específico do ativo"
                                }
                            },
                            "required": ["assetName", "assetReturn", "assetType"]
                        }
                    }
                },
                "required": ["className", "classReturn", "classBenchmark", "classBenchmarkValue", "benchmarkDifference", "drivers"]
            }
        },
        "detractors": {
            "type": "array",
            "description": "Lista de classes abaixo do benchmark (pode ser vazia)",
            "items": {
                "type": "object",
                "properties": {
                    "className": {
                        "type": "string",
                        "description": "Nome da classe"
                    },
                    "classReturn": {
                        "type": "string",
                        "description": "Rentabilidade da classe"
                    },
                    "classBenchmark": {
                        "type": "string",
                        "description": "Benchmark correspondente"
                    },
                    "classBenchmarkValue": {
                        "type": "string",
                        "description": "Valor do benchmark"
                    },
                    "benchmarkDifference": {
                        "type": "string",
                        "description": "Diferença em relação ao benchmark (negativo)"
                    }
                },
                "required": ["className", "classReturn", "classBenchmark", "classBenchmarkValue", "benchmarkDifference"]
            }
        },
        "allAssets": {
            "type": "object",
            "description": "Todos os ativos agrupados por classe",
            "additionalProperties": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "assetName": {
                            "type": "string",
                            "description": "Nome completo do ativo"
                        },
                        "assetReturn": {
                            "type": "string",
                            "description": "Rentabilidade do mês"
                        },
                        "assetType": {
                            "type": "string",
                            "description": "Tipo específico do ativo"
                        },
                        "cdiPercentage": {
                            "type": "string",
                            "description": "Rentabilidade em %CDI do mês"
                        },
                        "yearlyReturn": {
                            "type": "string",
                            "description": "Rentabilidade do ano"
                        },
                        "yearlyCdi": {
                            "type": "string",
                            "description": "Rentabilidade do ano em %CDI"
                        }
                    },
                    "required": ["assetName", "assetReturn"]
                }
            }
        }
    },
    "required": ["highlights", "detractors", "allAssets"]
}
