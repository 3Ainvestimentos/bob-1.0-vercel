"""
Workflows da aplicação.
"""
from .meeting_workflow import meeting_analysis_app
from .report_workflow import create_report_analysis_workflow

__all__ = [
    "meeting_analysis_app",
    "create_report_analysis_workflow",  # ✅ Mudança aqui
]