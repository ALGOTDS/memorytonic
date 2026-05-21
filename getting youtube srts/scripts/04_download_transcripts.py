"""
Step 4: Download transcripts for every video in a CSV, save as .txt.

Pipeline per video:
  1. yt-dlp downloads English VTT (manual subs preferred, falls back to auto)
  2. VTT parsed → deduped plain text
  3. Save as transcripts/<id>_<title-slug>.txt
  4. Track success/failure in a manifest CSV

Resumable: skips ids already present in transcripts/.
"""
import csv
import re
import subprocess
import sys
import time
from pathlib import Path

from paths import FILTERED, TRANSCRIPTS

# CLI: python scripts/04_download_transcripts.py <filtered_csv_name> <output_subdir>
# Example: python scripts/04_download_transcripts.py runtimebrt_2026.csv runtimebrt_2026
if len(sys.argv) < 3:
    print(__doc__)
    sys.exit(1)
IN_CSV = FILTERED / sys.argv[1]
OUT_DIR = TRANSCRIPTS / sys.argv[2]
OUT_DIR.mkdir(parents=True, exist_ok=True)
VTT_DIR = OUT_DIR / "_vtt_raw"
VTT_DIR.mkdir(exist_ok=True)
MANIFEST = OUT_DIR / "_manifest.csv"


def slugify(s: str, maxlen: int = 60) -> str:
    s = re.sub(r"[^\w\s-]", "", s).strip()
    s = re.sub(r"[\s-]+", "_", s)
    return s[:maxlen] or "untitled"


def download_vtt(video_url: str, out_template: str) -> Path | None:
    """Download English subs (manual or auto) as VTT. Returns path or None."""
    cmd = [
        sys.executable, "-m", "yt_dlp",
        "--skip-download",
        "--write-subs", "--write-auto-subs",
        "--sub-langs", "en.*",
        "--sub-format", "vtt",
        "--no-warnings",
        "-o", out_template,
        video_url,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    if proc.returncode != 0:
        return None
    # find the .vtt file matching this video (yt-dlp adds .en.vtt or similar)
    base = Path(out_template.replace("%(ext)s", ""))
    matches = list(base.parent.glob(base.name + "*.vtt"))
    return matches[0] if matches else None


def vtt_to_text(vtt_path: Path) -> str:
    lines = vtt_path.read_text(encoding="utf-8").splitlines()
    out, seen_last = [], None
    for ln in lines:
        if not ln.strip():
            continue
        if ln.startswith(("WEBVTT", "Kind:", "Language:", "NOTE")):
            continue
        if "-->" in ln:
            continue
        if re.match(r"^\d+$", ln):
            continue
        clean = re.sub(r"<[^>]+>", "", ln).strip()
        clean = re.sub(r"\s+", " ", clean)
        if not clean or clean == seen_last:
            continue
        out.append(clean)
        seen_last = clean
    return " ".join(out)


def load_manifest_done() -> set[str]:
    if not MANIFEST.exists():
        return set()
    with MANIFEST.open(encoding="utf-8") as f:
        return {row["id"] for row in csv.DictReader(f) if row.get("status") == "ok"}


def main():
    rows = list(csv.DictReader(IN_CSV.open(encoding="utf-8")))
    print(f"input: {IN_CSV.name} ({len(rows)} videos)")
    done = load_manifest_done()
    print(f"already downloaded: {len(done)}")

    write_header = not MANIFEST.exists()
    mf = MANIFEST.open("a", newline="", encoding="utf-8")
    w = csv.DictWriter(mf, fieldnames=["id", "title", "url", "status", "txt_path", "word_count"])
    if write_header:
        w.writeheader()

    ok = fail = 0
    for i, row in enumerate(rows, 1):
        vid = row["id"]
        if vid in done:
            continue

        title = row["title"]
        url = row["url"]
        slug = slugify(title)
        out_template = str(VTT_DIR / f"{vid}_{slug}.%(ext)s")

        safe_title = title[:55].encode('ascii', 'replace').decode('ascii')
        print(f"[{i}/{len(rows)}] {vid}  {safe_title}")
        vtt = download_vtt(url, out_template)
        if not vtt or not vtt.exists():
            w.writerow({"id": vid, "title": title, "url": url,
                        "status": "no_subs", "txt_path": "", "word_count": 0})
            mf.flush()
            fail += 1
            print(f"   [SKIP] no subs available")
            continue

        text = vtt_to_text(vtt)
        words = len(text.split())
        txt_path = OUT_DIR / f"{vid}_{slug}.txt"
        txt_path.write_text(text, encoding="utf-8")
        w.writerow({"id": vid, "title": title, "url": url,
                    "status": "ok", "txt_path": txt_path.name, "word_count": words})
        mf.flush()
        ok += 1
        print(f"   [OK] {words:,} words -> {txt_path.name}")
        time.sleep(0.5)  # polite

    mf.close()
    print(f"\ndone — ok={ok}, no_subs={fail}")
    print(f"transcripts: {OUT_DIR}")
    print(f"manifest:    {MANIFEST}")


if __name__ == "__main__":
    main()
