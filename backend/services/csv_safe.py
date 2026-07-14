"""Safe CSV cell formatting (formula / injection hardening).

Spreadsheet apps may interpret cells beginning with =, +, -, or @ as formulas.
Prefix those values with a single quote so Excel / Sheets treat them as text.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

_FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")


def csv_safe_cell(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        text = value.isoformat()
    elif isinstance(value, date):
        text = value.isoformat()
    else:
        text = str(value)

    # Normalize newlines so formulas cannot span rows when improperly escaped.
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    if text.startswith(_FORMULA_PREFIXES):
        return f"'{text}"
    return text


def csv_safe_row(values: list[Any]) -> list[str]:
    return [csv_safe_cell(v) for v in values]
