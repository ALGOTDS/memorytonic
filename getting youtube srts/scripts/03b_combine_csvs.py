"""
Step 3b: Merge multiple CSVs (e.g. videos+shorts+streams of one channel) into one.
Adds a 'tab' column so you can tell rows apart.

Usage:
  python scripts/03b_combine_csvs.py <out_filename> <tab1>:<file1> <tab2>:<file2> ...

Example:
  python scripts/03b_combine_csvs.py runtimebrt_all.csv \
      videos:runtimebrt_videos.csv \
      shorts:runtimebrt_shorts_dated.csv \
      streams:runtimebrt_streams.csv
"""
import csv
import sys
from pathlib import Path

from paths import RAW, ENRICHED, FILTERED


def find_input(name: str) -> Path:
    for d in (RAW, ENRICHED):
        p = d / name
        if p.exists():
            return p
    raise FileNotFoundError(f"{name} not in raw/ or enriched/")


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    out_path = FILTERED / sys.argv[1]
    sources = [s.split(":", 1) for s in sys.argv[2:]]

    all_rows = []
    for tab, fname in sources:
        path = find_input(fname)
        rows = list(csv.DictReader(path.open(encoding="utf-8")))
        for r in rows:
            r["tab"] = tab
        print(f"  {tab:10s} {len(rows):>4} rows  ({path.name})")
        all_rows.extend(rows)

    # union of all field names so missing columns don't break writing
    seen, fields = {"tab"}, ["tab"]
    for r in all_rows:
        for k in r.keys():
            if k not in seen:
                fields.append(k)
                seen.add(k)

    with out_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(all_rows)
    print(f"wrote {out_path} ({len(all_rows)} rows)")


if __name__ == "__main__":
    main()
