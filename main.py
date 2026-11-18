"""Root-level entrypoint for containerized deployments (Render, Docker).

Allows `uvicorn main:app` to work from the repository root without needing
PYTHONPATH=., by re-exporting the FastAPI app from backend.main.
"""
from backend.main import app  # noqa: F401

__all__ = ["app"]