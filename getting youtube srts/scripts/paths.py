"""Single source of truth for paths. Import this in every script."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # the "getting youtube srts" folder

DATA = ROOT / "data"
RAW = DATA / "raw"
ENRICHED = DATA / "enriched"
FILTERED = DATA / "filtered"
TRANSCRIPTS = ROOT / "transcripts"
ARCHIVE = ROOT / "archive"

for p in (RAW, ENRICHED, FILTERED, TRANSCRIPTS, ARCHIVE):
    p.mkdir(parents=True, exist_ok=True)
