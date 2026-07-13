"""Print non-sensitive pilot metrics (Phase 5 M5).

Usage:
  set EXTENSION_OPS_TOKEN=...
  python scripts/m5_pilot_metrics.py
  python scripts/m5_pilot_metrics.py --since-hours 72 --database-url postgresql://...
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--since-hours", type=int, default=168)
    ap.add_argument("--database-url", default=os.getenv("DATABASE_URL", "sqlite:///./aijob.db"))
    ap.add_argument(
        "--out",
        default=str(BACKEND.parent / "docs" / "PHASE5_M5_PILOT_METRICS.json"),
    )
    args = ap.parse_args()

    url = args.database_url
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]

    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from services.pilot_metrics import collect_pilot_metrics

    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    engine = create_engine(url, connect_args=connect_args, pool_pre_ping=not url.startswith("sqlite"))
    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        report = collect_pilot_metrics(db, since_hours=args.since_hours)
    finally:
        db.close()

    print(json.dumps(report, indent=2))
    Path(args.out).write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
