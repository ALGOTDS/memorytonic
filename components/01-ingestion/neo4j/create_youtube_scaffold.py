"""
Create the YouTube directory + collection scaffold in Neo4j.

  DirectoryCategory: youtube_videos
  Collection:        yt_startups_videos

Idempotent: re-running is safe (uses MERGE on name).
"""
import uuid
from db import check_connection, run_cypher


DIRECTORY_NAME = "youtube_videos"
DIRECTORY_DESC = "Transcripts and metadata from YouTube channels (startup ecosystem)"
COLLECTION_NAME = "yt_startups_videos"


def main():
    check_connection()  # exits on failure

    # 1. Directory (MERGE on unique name)
    r = run_cypher(
        """
        MERGE (d:DirectoryCategory {name: $name})
        ON CREATE SET d.description = $desc, d.createdAt = datetime()
        ON MATCH  SET d.description = coalesce(d.description, $desc)
        RETURN d.name AS name, d.description AS description
        """,
        {"name": DIRECTORY_NAME, "desc": DIRECTORY_DESC},
    )
    if not r["ok"]:
        raise SystemExit(f"directory failed: {r['errors']}")
    print(f"directory ok:  {r['data'][0]['data'][0]['row']}")

    # 2. Collection (MERGE on name; create id only if new)
    new_id = f"col-{uuid.uuid4().hex[:12]}"
    r = run_cypher(
        """
        MERGE (c:Collection {name: $name})
        ON CREATE SET c.collectionId = $cid, c.createdAt = datetime()
        RETURN c.collectionId AS id, c.name AS name
        """,
        {"name": COLLECTION_NAME, "cid": new_id},
    )
    if not r["ok"]:
        raise SystemExit(f"collection failed: {r['errors']}")
    cid, cname = r["data"][0]["data"][0]["row"]
    print(f"collection ok: id={cid}  name={cname}")

    # 3. Verify
    r = run_cypher(
        """
        MATCH (d:DirectoryCategory {name: $dname}), (c:Collection {name: $cname})
        RETURN d.name, c.collectionId, c.name
        """,
        {"dname": DIRECTORY_NAME, "cname": COLLECTION_NAME},
    )
    print(f"verify: {r['data'][0]['data'][0]['row']}")
    print("\ndone.")


if __name__ == "__main__":
    main()
