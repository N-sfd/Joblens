"""Backward-compatible Submissions API — aliases the Unified Pipeline router."""
from routers.pipeline import router, _to_response  # noqa: F401
