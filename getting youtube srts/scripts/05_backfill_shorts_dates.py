"""
Backfill upload_date (+ likes, comments, tags) for entries that lack dates.
Per-video fetch — flat mode doesn't return dates for /shorts.

Usage:
  python scripts/05_backfill_shorts_dates.py <raw_csv_name> <out_filename>

Example:
  python scripts/05_backfill_shorts_dates.py runtimebrt_shorts.csv runtimebrt_shorts_dated.csv

Reads from data/raw/, writes to data/enriched/. Resumable.
"""
import csv
import json
import subprocess
import sys
import time

from paths import RAW, ENRICHED

if len(sys.argv) < 3:
    print(__doc__)
    sys.exit(1)
IN_CSV = RAW / sys.argv[1]
OUT_CSV = ENRICHED / sys.argv[2]

FIELDS = [
    "id", "url", "title", "upload_date", "duration_sec",
    "view_count", "like_count", "comment_count",
    "channel", "channel_id", "tags",
]


def fetch_one(video_url: str) -> dict | None:
    cmd = [
        sys.executable, "-m", "yt_dlp",
        "--dump-json", "--skip-download", "--no-warnings",
        video_url,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    if proc.returncode != 0:
        return None
    try:
        d = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return None
    raw_date = d.get("upload_date")  # YYYYMMDD
    iso_date = (
        f"{raw_date[:4]}-{raw_date[4:6]}-{raw_date[6:8]}" if raw_date else None
    )
    return {
        "id": d.get("id"),
        "url": d.get("webpage_url"),
        "title": d.get("title"),
        "upload_date": iso_date,
        "duration_sec": d.get("duration"),
        "view_count": d.get("view_count"),
        "like_count": d.get("like_count"),
        "comment_count": d.get("comment_count"),
        "channel": d.get("channel"),
        "channel_id": d.get("channel_id"),
        "tags": "|".join(d.get("tags") or []),
    }


def load_done(path: Path) -> set[str]:
    if not path.exists():
        return set()
    return {r["id"] for r in csv.DictReader(path.open(encoding="utf-8"))}


def main():
    rows = list(csv.DictReader(IN_CSV.open(encoding="utf-8")))
    done = load_done(OUT_CSV)
    print(f"input: {len(rows)} shorts | already done: {len(done)}")

    write_header = not OUT_CSV.exists()
    with OUT_CSV.open("a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        if write_header:
            w.writeheader()
        for i, row in enumerate(rows, 1):
            if row["id"] in done:
                continue
            safe_title = row['title'][:55].encode('ascii', 'replace').decode('ascii')
            print(f"[{i}/{len(rows)}] {row['id']}  {safe_title}")
            data = fetch_one(row["url"])
            if data:
                w.writerow(data)
                f.flush()
            else:
                print("   FAIL")
            time.sleep(0.5)

    print(f"\nwrote {OUT_CSV}")


if __name__ == "__main__":
    main()
