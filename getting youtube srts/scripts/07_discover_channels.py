"""
Step 7: Discover YouTube channels related to a topic.
Searches videos for a query, groups results by channel, ranks by frequency.

Usage:
  python scripts/07_discover_channels.py "<query>" [num_results]

Example:
  python scripts/07_discover_channels.py "indian climate tech" 50
"""
import json
import subprocess
import sys
from collections import Counter


def discover(query: str, n: int = 30):
    cmd = [
        sys.executable, "-m", "yt_dlp",
        "--flat-playlist", "--dump-json", "--no-warnings",
        f"ytsearch{n}:{query}",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    if proc.returncode != 0:
        sys.exit(proc.stderr[-500:])

    channels: Counter[str] = Counter()
    handles: dict[str, str] = {}
    for line in proc.stdout.splitlines():
        if not line.strip():
            continue
        d = json.loads(line)
        ch = d.get("channel") or d.get("uploader")
        if not ch:
            continue
        channels[ch] += 1
        if ch not in handles and d.get("uploader_url"):
            handles[ch] = d["uploader_url"]

    return channels, handles


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    query = sys.argv[1]
    n = int(sys.argv[2]) if len(sys.argv) >= 3 else 30

    print(f'searching {n} results for: "{query}"')
    channels, handles = discover(query, n)

    print(f"\nfound {len(channels)} unique channels:\n")
    for ch, count in channels.most_common():
        url = handles.get(ch, "")
        print(f"  {count:>2}x  {ch:<40}  {url}")


if __name__ == "__main__":
    main()
