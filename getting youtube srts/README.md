# getting youtube srts

Pull every video's metadata + transcript from any YouTube channel into clean CSVs and `.txt` files.

## Setup

```bash
pip install yt-dlp
```

Python 3.10+. No API key needed.

## Quick start

```bash
cd "getting youtube srts"

# List channel
python scripts/01_list_videos.py "https://youtube.com/@ycombinator/videos" ycombinator.csv

# Filter to 2026
python scripts/03_filter_by_year.py ycombinator.csv 2026 ycombinator_2026.csv

# Download transcripts
python scripts/04_download_transcripts.py ycombinator_2026.csv ycombinator_2026
```

Result: `transcripts/ycombinator_2026/` full of `.txt` files + a `_manifest.csv`.

## Multi-tab channels (videos + shorts + streams)

Shorts need an extra date-backfill step:

```bash
python scripts/01_list_videos.py "https://youtube.com/@CH/videos"  CH_videos.csv
python scripts/01_list_videos.py "https://youtube.com/@CH/shorts"  CH_shorts.csv
python scripts/05_backfill_shorts_dates.py CH_shorts.csv CH_shorts_dated.csv
python scripts/03b_combine_csvs.py CH_all.csv \
    videos:CH_videos.csv shorts:CH_shorts_dated.csv
python scripts/03_filter_by_year.py CH_all.csv 2026 CH_2026.csv
python scripts/04_download_transcripts.py CH_2026.csv CH_2026
```

## Folder map

| Folder | What's in it |
|---|---|
| `scripts/` | All Python — run from project root with `python scripts/NN_x.py ...` |
| `data/raw/` | Flat-list CSVs from yt-dlp (one per channel/tab) |
| `data/enriched/` | Per-video backfills (dates added to shorts, etc.) |
| `data/filtered/` | Year/channel subsets — the inputs to transcript downloads |
| `transcripts/` | One subfolder per filtered set: `.txt` files + `_manifest.csv` + `_vtt_raw/` |
| `archive/` | Superseded files |

See [CLAUDE.md](CLAUDE.md) for full context, [INDEX.md](INDEX.md) for the file map.
