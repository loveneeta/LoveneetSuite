"""Vercel function entrypoint for a single Loveneet Suite API route."""
import sys
from pathlib import Path

FRONTEND_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = FRONTEND_ROOT.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from main import app  # noqa: E402,F401
