"""
Vercel entrypoint for the Loveneet Suite FastAPI backend.

This file is used when the Vercel project root is MASTER/webapp/frontend.
It imports the existing FastAPI application rather than duplicating API routes.
"""
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = PROJECT_ROOT.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from main import app  # noqa: E402,F401
