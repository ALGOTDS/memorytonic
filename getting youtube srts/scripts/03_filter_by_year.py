"""
Step 3a: Filter a raw CSV by upload_date year. Writes to data/filtered/.

Usage:
  python scripts/03_filter_by_year.py <input_csv_in_raw_or_enriched> <year> <out_filename>

Example:
  python scripts/03_filter_by_year.py backstagewithmillionaires.csv 2026 backstagewithmillionaires_2026.csv
"""
import csv
import sys
from pathlib import Path

from paths import RAW, ENRICHED, FILTERED


def find_input(name: str) -> Path:
    """Look in raw/ first, then enriched/."""
    for d in (RAW, ENRICHED):
        p = d / name
        if p.exists():
            return p
    raise FileNotFoundError(f"{name} not in raw/ or enriched/")


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(1)
    in_path = find_input(sys.argv[1])
    year = sys.argv[2]
    out_path = FILTERED / sys.argv[3]

    rows = list(csv.DictReader(in_path.open(encoding="utf-8")))
    filtered = [r for r in rows if (r.get("upload_date") or "").startswith(f"{year}-")]
    no_date = sum(1 for r in rows if not r.get("upload_date"))

    with out_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=rows[0].keys(), extrasaction="ignore")
        w.writeheader()
        w.writerows(filtered)

    print(f"input:  {in_path.name} ({len(rows)} rows)")
    print(f"year={year}: {len(filtered)} kept")
    print(f"excluded: {len(rows) - len(filtered) - no_date} other years, {no_date} undated")
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
