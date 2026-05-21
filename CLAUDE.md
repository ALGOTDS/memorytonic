# CLAUDE.md

Project guide for Claude (and any other LLM agent) working inside this repository. Read this first — it tells you what each piece does, what the schema looks like, and what you're allowed to touch.

---

## What this repo is

**MemoryTonic** — a personal knowledge-graph research tool. Users feed in raw text (articles, papers, YouTube transcripts). An LLM (you) extracts entities, relationships, and causal chains into Neo4j. Two React UIs let users explore the graph visually.

Everything runs locally. Neo4j on `localhost:7687` (Bolt) and `localhost:7474` (HTTP). No cloud, no API keys.

---

## Which thing does what

| Folder | Role | When you touch it |
|---|---|---|
| `components/01-ingestion/neo4j/` | **Python scripts that talk to Neo4j over HTTP** — bootstrap schema, validate, upload, GDS, export, import, delete. The write path. | When the user is uploading a new document, fixing the schema, or running maintenance. |
| `components/01-ingestion/nlp/` | **Python NLP** — spaCy NER + TF-IDF (`preprocess.py`), BERT 384d embeddings (`embed.py`). Spawn-and-exit, no persistent service. | Only during extraction (steps 2 and 5 of the 6-step pipeline). |
| `components/01-ingestion/skills/` | **Markdown protocols for the LLM agent.** The actual extraction logic lives here, not in code. You read `extraction-pipeline-skill.md` and follow it. | Every time the user wants to add a document. Start with `extraction-pipeline-skill.md`. |
| `components/01-ingestion/data/` | **User data.** `projects/` = raw text, `sources/` = HTML, `extracted/` = JSON artifacts. Repo ships empty. | Read only — never modify another project's artifacts without asking. |
| `components/02-graph-studio/` | **React + react-force-graph-2d viewer.** Reads Neo4j over Bolt. 3 Zustand stores (graph, selection, ui). Custom Canvas2D node painting. | UI bugs, visual changes, new filter logic. |
| `components/03-frontend/` | **React app shell.** 8 hash-based routes (Home, Directory, Collection, Project, Entity, Graph, Source, Settings). Right-side info panel (RSB). Embeds Graph Studio via the `adapters/` boundary. | New page logic, new Neo4j queries, RSB cards. |
| `getting youtube srts/` | **Helper toolkit.** `yt-dlp` wrappers — channel listing, year filtering, transcript downloads. Independent of the main pipeline. | Only when the user wants video sources. |

---

## The 6-step extraction pipeline

This is the user's primary workflow. When the user says "add this document," you walk through:

```
0. SCHEMA BOOTSTRAP   → python neo4j/bootstrap.py   (one-time, idempotent)
1. HTML + PLACEMENT   → 01_html.html + 02_placement.json   (you write these)
2. NLP PREPROCESSING  → python nlp/preprocess.py … > 03_nlp_entities.json
3. ENTITY DISCOVERY   → 04_all_entities.json   (you write this)
4. FULL EXTRACTION    → 06_extraction.json    (you write this — relationships, causal chains, summary)
5. EMBEDDINGS         → python nlp/embed.py …       → 05_embeddings.json
6. STORE + UPLOAD     → validate_project.py → upload.py → gds.py
```

Full protocol: `components/01-ingestion/skills/extraction-pipeline-skill.md`.
Quality bar: `components/01-ingestion/skills/extraction-skill.md`.

**Artifacts live in `data/temp/<project>/` during the run. Move to `data/extracted/<project>/` only after the upload succeeds.**

---

## Neo4j connection

Defaults baked in everywhere:

```
URI       bolt://localhost:7687   (UI side)
HTTP      http://localhost:7474   (Python side)
USER      neo4j
PASSWORD  memorytonic
DATABASE  memorytonic
```

Python: read via `components/01-ingestion/neo4j/config.py` (env vars override).
UI: read via `import.meta.env.VITE_NEO4J_*` (see each component's `.env.example`).

**Trap:** the database is `memorytonic`, not the default `neo4j`. If a query returns zero results, check the database name before debugging anything else.

---

## Schema (you will be asked to query this)

### Node labels

| Label | Key | Meaning |
|---|---|---|
| `Project` | `unique_id` | One extracted document |
| `Entity` | `name` | A person/org/place/concept/etc. mentioned across one or more projects |
| `Collection` | `name` | Basket of related projects (cross-directory allowed) |
| `DirectoryCategory` | `name` | Top-level organizer: Research, Business, Personal, … |
| `DateTime` (also `Date`) | `date` | Commit date |
| `TemporalEvent` | (project + orderIndex) | Project-internal timeline phase |
| `CausalChain` | `chainId` | An ordered cause→effect sequence inside a project |

### Relationships

| Type | From → To | Useful properties |
|---|---|---|
| `IN_DIRECTORY` | Project → DirectoryCategory | — |
| `BELONGS_TO` | Project → Collection | — |
| `BELONGS_TO_PROJECT` | CausalChain / TemporalEvent → Project | — |
| `MENTIONED_IN` | Entity → Project | `role` (project-scoped stance + mechanics) |
| `RELATES_TO` | Entity → Entity | `relType`, `causalClassification`, `description`, `evidence`, `evidenceStrength`, `magnitude` |
| `CHAIN_LINK` | Entity → Entity | `chainId`, `orderIndex`, `explanation` |
| `SIMILAR_TO` | Entity → Entity | `score` (GDS Node Similarity) |
| `FIRST_APPEARS_IN` | Entity → TemporalEvent | — |

### Locked vocabularies

**14 entity categories:** Person, Organization, Place, Event, Concept, System, Process, Technology, Law, Agreement, Metric, Document, Resource, Other.

**15 causal-classification families:** CAUSES, ENABLES, BLOCKS, INFLUENCES, DEPENDS_ON, CONTRADICTS, SUPPORTS, PRECEDES, COMPETES_WITH, COOPERATES_WITH, REGULATES, TRANSFORMS, PRODUCES, CONSUMES, IMPLEMENTS.

These are ontological — do not add domain-specific ones.

### Bridge entities

Entities that appear in multiple projects. The primary research-insight mechanism.

- **Gold** — appears in 3+ projects
- **Silver** — appears in 2 projects
- **Bronze** — 1 project but high betweenness centrality

---

## Querying the graph (you can do this directly)

When the user asks a research question — "what connects X and Y?" "which entities bridge the most documents?" "what's the causal chain from A to B?" — you don't have to open the UI. **Query Neo4j yourself.**

Four paths, in order of convenience:

### 1. Neo4j MCP server (best for Claude Desktop)

Install the community Neo4j MCP server and Claude Desktop can run Cypher directly:

```bash
pip install mcp-neo4j-cypher
```

Add to your Claude Desktop config (`%APPDATA%\Claude\claude_desktop_config.json` on Windows, `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "neo4j": {
      "command": "python",
      "args": ["-m", "mcp_neo4j_cypher"],
      "env": {
        "NEO4J_URI": "bolt://localhost:7687",
        "NEO4J_USERNAME": "neo4j",
        "NEO4J_PASSWORD": "memorytonic",
        "NEO4J_DATABASE": "memorytonic"
      }
    }
  }
}
```

Restart Claude Desktop. Now you have `read-neo4j-cypher` and `write-neo4j-cypher` tools — ask the user's question and write the Cypher yourself.

### 2. Claude Code — shell out to `cypher-shell`

If `cypher-shell` is on PATH (ships with Neo4j Desktop):

```bash
cypher-shell -a bolt://localhost:7687 -u neo4j -p memorytonic -d memorytonic \
  "MATCH (e:Entity)-[:MENTIONED_IN]->(p:Project) RETURN e.name, count(p) AS projects ORDER BY projects DESC LIMIT 10"
```

### 3. Claude Code — one-off Python query via `db.py`

The shared HTTP client is already in the repo:

```python
from components.01_ingestion.neo4j.db import run_cypher
rows = run_cypher("MATCH (e:Entity) WHERE e.bridgeTier = 'gold' RETURN e.name, e.pageRank ORDER BY e.pageRank DESC")
print(rows)
```

### 4. Browser fallback

If none of the above are wired up, paste the Cypher into the Neo4j Browser at `http://localhost:7474` and ask the user to paste the result back.

### Query patterns to know

Read [`components/01-ingestion/skills/cypher-queries-skill.md`](components/01-ingestion/skills/cypher-queries-skill.md) before composing complex queries — it has 30+ ready-made patterns (bridge detection, hop expansion, similarity, gap analysis, causal chain traversal).

---

## Locked decisions (do not relitigate)

1. **14 entity categories, 15 causal families** — fixed ontological set. Adding domain-specific values breaks downstream filtering.
2. **Entity merge is case-sensitive on `name + aliases[]`** — bridge detection depends on this. Always supply 2–3 aliases per entity.
3. **`upload.py` uses `CREATE` (not `MERGE`) for `RELATES_TO`** — multiple edges between the same pair are allowed and meaningful.
4. **C01 uses HTTP API; C02/C03 use Bolt** — two connection methods to the same DB. Intentional.
5. **Embeddings run on FINAL rich data** (definitions + roles + summary), not bare names.
6. **Pipeline is atomic via temp folder** — only move artifacts from `data/temp/<project>/` to `data/extracted/<project>/` after the upload succeeds.

---

## What you should not do

- Don't add new node labels or relationship types without the user's explicit OK — the UIs hard-code the known ones.
- Don't modify `upload.py` or `validate_project.py` to "be more flexible" — they're the contract gate. Other code trusts them.
- Don't commit the user's `data/extracted/<project>/` — gitignored by design. The repo ships empty so each user starts fresh.
- Don't reintroduce the deleted components (`04-mcp`, `05-electron`, `06-platform`, `07-platform`). They were removed deliberately to keep this repo simple.
- Don't write a `.env` file — write `.env.example` and tell the user to copy it.

---

## Where to look first

| You are about to … | Read this |
|---|---|
| Extract a new document | `components/01-ingestion/skills/extraction-pipeline-skill.md` |
| Write a Cypher query | `components/01-ingestion/skills/cypher-queries-skill.md` |
| Run GDS metrics | `components/01-ingestion/skills/gds-skill.md` |
| Modify Graph Studio behavior | `components/02-graph-studio/DESIGN-SPEC.md` |
| Add a new page or query in the app | `components/03-frontend/DESIGN-SPEC.md` |
| Pull YouTube transcripts | `getting youtube srts/README.md` |
