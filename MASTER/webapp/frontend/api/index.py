"""
Vercel entrypoint for the Loveneet Suite FastAPI backend.
"""
import sys
from pathlib import Path

API_DIR = Path(__file__).resolve().parent
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

# Also allow local backend resolution if present
BACKEND_DIR = API_DIR.parents[1] / "backend"
if BACKEND_DIR.exists() and str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

try:
    from .main import app  # noqa: F401
except ImportError:
    from main import app  # noqa: F401
