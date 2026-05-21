"""
Step 6: Build a structured JSON corpus for a transcript set.
Joins filtered CSV (metadata) + manifest (file paths) + .txt content.

Usage:
  python scripts/06_build_json.py <filtered_csv_name> <transcript_subdir> <out_json_name>

Example:
  python scripts/06_build_json.py runtimebrt_2026.csv runtimebrt_2026 runtimebrt_2026.json

Output goes to data/json/<out_json_name>.

Each record:
{
  "id": "abc123",
  "url": "https://...",
  "title": "...",
  "channel": "...",
  "upload_date": "2026-04-24",
  "duration_sec": 628,
  "view_count": 26447,
  "tab": "videos",         # if combined CSV had this
  "word_count": 1544,
  "transcript": "full text..."
}
"""
import csv
import json
import sys
from pathlib import Path

from paths import FILTERED, TRANSCRIPTS, DATA

JSON_DIR = DATA / "json"
JSON_DIR.mkdir(exist_ok=True)


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(1)
    filtered_csv = FILTERED / sys.argv[1]
    transcript_dir = TRANSCRIPTS / sys.argv[2]
    out_json = JSON_DIR / sys.argv[3]

    if not filtered_csv.exists():
        sys.exit(f"missing: {filtered_csv}")
    if not transcript_dir.exists():
        sys.exit(f"missing: {transcript_dir}")

    # 1. metadata from filtered CSV (keyed by id)
    meta = {r["id"]: r for r in csv.DictReader(filtered_csv.open(encoding="utf-8"))}

    # 2. manifest tells us which transcript file matches which id
    manifest_path = transcript_dir / "_manifest.csv"
    manifest = list(csv.DictReader(manifest_path.open(encoding="utf-8")))

    records = []
    missing_meta = missing_txt = 0
    for m in manifest:
        if m["status"] != "ok":
            continue
        vid = m["id"]
        md = meta.get(vid)
        if not md:
            missing_meta += 1
            continue
        txt_path = transcript_dir / m["txt_path"]
        if not txt_path.exists():
            missing_txt += 1
            continue
        transcript = txt_path.read_text(encoding="utf-8").strip()

        rec = {
            "id": vid,
            "url": md.get("url"),
            "title": md.get("title"),
            "channel": md.get("channel"),
            "channel_id": md.get("channel_id"),
            "upload_date": md.get("upload_date"),
            "upload_timestamp": _to_int(md.get("upload_timestamp")),
            "duration_sec": _to_int(md.get("duration_sec")),
            "duration_string": md.get("duration_string"),
            "view_count": _to_int(md.get("view_count")),
            "tab": md.get("tab"),
            "description_preview": md.get("description_preview"),
            "word_count": int(m.get("word_count") or 0),
            "transcript": transcript,
        }
        records.append(rec)

    # sort newest first
    records.sort(key=lambda r: r.get("upload_date") or "", reverse=True)

    out_json.write_text(
        json.dumps(records, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    total_words = sum(r["word_count"] for r in records)
    print(f"records:      {len(records)}")
    print(f"total words:  {total_words:,}")
    print(f"file size:    {out_json.stat().st_size / 1024:.1f} KB")
    print(f"missing meta: {missing_meta}, missing txt: {missing_txt}")
    print(f"wrote {out_json}")


def _to_int(v):
    try:
        return int(v) if v not in (None, "", "None") else None
    except (TypeError, ValueError):
        return None


if __name__ == "__main__":
    main()
