"""
Step 1: Flat-list every video on a YouTube channel into a CSV.
Fast (~30s for 600 videos). Uses approximate_date for upload timestamps.

Usage:
  python scripts/01_list_videos.py <channel_url> <out_filename>
  python scripts/01_list_videos.py "https://youtube.com/@ycombinator/videos" ycombinator.csv

Output goes to data/raw/<out_filename>.

Fields: id, url, title, upload_date, view_count, duration, channel, description_preview.
NOT included (need 02_enrich): like_count, comment_count, tags, subs.
NOTE: /shorts tabs return no dates — run 05_backfill afterward.
"""
import csv
import json
import subprocess
import sys
from datetime import datetime, timezone

from paths import RAW

FIELDS = [
    "id", "url", "title",
    "upload_date", "upload_timestamp",
    "duration_sec", "duration_string",
    "view_count",
    "channel", "channel_id",
    "description_preview",
]


def list_videos(channel_url: str) -> list[dict]:
    cmd = [
        sys.executable, "-m", "yt_dlp",
        "--flat-playlist", "--dump-json", "--no-warnings",
        "--extractor-args", "youtubetab:approximate_date",
        channel_url,
    ]
    print(f"running: yt-dlp --flat-playlist on {channel_url}")
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    if proc.returncode != 0:
        print("stderr:", proc.stderr[-500:])
        proc.check_returncode()

    videos = []
    for line in proc.stdout.splitlines():
        if not line.strip():
            continue
        d = json.loads(line)
        ts = d.get("timestamp")
        upload_date = (
            datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
            if ts else None
        )
        videos.append({
            "id": d.get("id"),
            "url": d.get("webpage_url") or f"https://youtu.be/{d.get('id')}",
            "title": d.get("title"),
            "upload_date": upload_date,
            "upload_timestamp": ts,
            "duration_sec": d.get("duration"),
            "duration_string": d.get("duration_string"),
            "view_count": d.get("view_count"),
            "channel": d.get("playlist_channel"),
            "channel_id": d.get("playlist_channel_id"),
            "description_preview": (d.get("description") or "").replace("\n", " ").strip()[:300],
        })
    return videos


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    channel_url = sys.argv[1]
    out_csv = RAW / sys.argv[2]

    videos = list_videos(channel_url)
    print(f"found {len(videos)} videos")

    with out_csv.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(videos)

    print(f"wrote {out_csv}")
    print("\nfirst 5 rows:")
    for v in videos[:5]:
        safe = (v['title'] or '')[:55].encode('ascii', 'replace').decode('ascii')
        print(f"  {v['upload_date']}  views={(v['view_count'] or 0):>8}  {v['id']}  {safe}")
    dated = sum(1 for v in videos if v["upload_date"])
    total_views = sum(v["view_count"] or 0 for v in videos)
    print(f"\nstats: {dated}/{len(videos)} have dates, total views = {total_views:,}")


if __name__ == "__main__":
    main()
