# MemoryTonic

> **A personal long-term memory for researchers.** Drop in everything you read — papers, earnings calls, lab notes, podcast transcripts, market reports — and MemoryTonic turns it into a queryable knowledge graph you can interrogate for years. No subscription, no cloud, no vendor. Just your existing Claude (or any LLM) doing the thinking, and Neo4j on your laptop doing the remembering.

The problem it solves: **you've read 300 documents this year and you can only recall the last five.** The connections between them — the entity that appeared in three earnings calls and one regulatory filing, the gene mentioned in two unrelated 2023 papers, the policy that quietly enabled a market shift — are lost to you. MemoryTonic finds them.

---

## Who it's for

| If you are a … | You feed it … | You get back … |
|---|---|---|
| **Equity researcher** | Earnings transcripts, 10-Ks, broker notes, management interviews, industry reports | A map of which executives, products, suppliers, and policies link companies across your coverage universe. Detect a competitor mentioned in three unrelated calls before consensus catches on. |
| **PhD student / academic** | Papers from your literature review, conference talks, supervisor's recommendations | Bridge concepts across subfields. Spot the methodology that two papers share without citing each other. Survive the "have you read X" trap. |
| **Biology / biomed researcher** | PubMed abstracts, lab notebooks, preprints, drug labels | Connect genes, pathways, compounds, and authors across thousands of papers. Surface mechanism-of-action overlaps you'd otherwise miss. |
| **Policy / geopolitics analyst** | News, think-tank reports, government filings, podcast transcripts | Trace causal chains across countries and decades. See which actors recur. |
| **Builder / founder** | Customer interviews, competitor teardowns, podcast transcripts, YC writeups | Build a private "second brain" of your market that compounds with every conversation. |
| **Student** | Lecture transcripts, textbook chapters, study notes | Long-term memory across semesters. Find every place a concept showed up before the exam. |

Anything text-shaped works. The schema is domain-neutral on purpose (14 ontological entity categories — Person, Organization, System, Process, Technology, Law, …).

---

## Why this exists

**Three honest pitches:**

1. **No subscription.** Notion AI, Mem, Reflect, Recall — all charge $10–30 / month forever. MemoryTonic costs $0. Your Claude / ChatGPT / Gemini subscription you already pay for does the heavy lifting; this repo is the scaffolding.
2. **Your data stays on your laptop.** Neo4j runs locally. The extracted graph is `.json` files in a folder you own. You can back it up, share it, version it, delete it. No "export to CSV" buttons that strip half your structure.
3. **It uses real graph science, not vibes.** PageRank tells you which entities matter most across your corpus. Betweenness Centrality finds the *bridges* between knowledge clusters. Node Similarity surfaces analogues you didn't know existed. spaCy NER and BERT 384-d embeddings under the hood. This is the same Graph Data Science stack used by Lyft, NASA, and biotech research labs — wired up for one person.

---

## What it actually does

Feed in raw text. MemoryTonic extracts **entities** (people, organizations, concepts, …), **relationships** (with evidence quotes from the source), and **causal chains** into Neo4j. Then it surfaces the **bridge entities** — the ones that appear across multiple documents in your library — which are almost always the insights you'd otherwise miss.

Two ways to query:
- **Visually** — interactive force-directed graph (React + react-force-graph-2d).
- **In chat** — point Claude Desktop at your Neo4j with one config line and ask plain-English questions. Claude writes the Cypher, runs it, and synthesizes the answer. See *Query the graph through Claude* below.

Everything runs **locally**. Your data stays on your machine.

---

## What's inside

```
MT v4/
├── components/
│   ├── 01-ingestion/      Python — Neo4j schema, NLP, embeddings, upload pipeline
│   ├── 02-graph-studio/   React + react-force-graph-2d — interactive force-directed graph
│   └── 03-frontend/       React — app shell, 8 page routes, info-card sidebar
├── getting youtube srts/  Helper toolkit — pull transcripts from any YouTube channel
└── README.md              You are here
```

The three components are independent. Ingestion writes to Neo4j over HTTP; Graph Studio and Frontend read over the Bolt protocol. They share nothing else.

---

## Quickstart — let Claude set it up for you (recommended)

If you have **Claude Code** or **Claude Desktop**, you do not need to read the rest of this README to get running. Do this:

```bash
git clone https://github.com/ALGOTDS/memorytonic.git
cd memorytonic
```

Then point Claude at the folder and say something like:

> *"I just cloned MemoryTonic. Read CLAUDE.md and walk me through setting it up on this machine — Neo4j, Python, the UIs. Ask me questions when you need to."*

Claude reads [`CLAUDE.md`](CLAUDE.md) automatically — it has the full schema, every script's role, every locked decision, the troubleshooting traps, and four ways to query the graph. Claude will check what you already have installed, install what's missing, configure the env vars, run the schema bootstrap, and start the dev servers. The whole onboarding becomes a conversation, not a checklist.

Once you're up and running, you can use Claude the same way for the actual research work: *"I just dropped a PDF in `data/projects/foo/script.md`. Extract it for me and tell me which entities already exist in my graph."*

If you don't use Claude (or prefer manual control), the rest of this README walks through every step by hand.

---

## Prerequisites

| Tool        | Version   | Why                                                 |
|-------------|-----------|------------------------------------------------------|
| **Neo4j**   | 5.x + GDS | Graph database — must include the Graph Data Science plugin |
| **Python**  | 3.10+     | NLP preprocessing, embeddings, upload scripts        |
| **Node.js** | 18+       | Build & run Graph Studio and Frontend                |

---

## 1 — Install Neo4j (with GDS)

The fastest path is **Neo4j Desktop**, which bundles the database, browser UI, and a one-click plugin installer.

### Option A — Neo4j Desktop (recommended)

1. Download from <https://neo4j.com/download/> and install.
2. Open Desktop → **New** → **Create project** → **Add → Local DBMS**.
3. Set the **password** to `memorytonic` (or your own — see Configuration below).
4. Set the **DBMS version** to 5.x.
5. Click **Plugins** on the new DBMS → install **Graph Data Science Library** (Community edition is fine) and **APOC**.
6. Click **Start**. The DBMS should report listening on:
   - `bolt://localhost:7687` (used by Graph Studio + Frontend)
   - `http://localhost:7474` (used by the Python upload scripts and the Neo4j Browser)

### Option B — Docker

```bash
docker run \
  --name memorytonic-neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/memorytonic \
  -e NEO4J_PLUGINS='["graph-data-science","apoc"]' \
  -e NEO4J_dbms_security_procedures_unrestricted='gds.*,apoc.*' \
  -v $HOME/neo4j-data:/data \
  neo4j:5
```

### Create the `memorytonic` database

The scripts expect a database named `memorytonic` (not the default `neo4j`).

Open the Neo4j Browser at <http://localhost:7474>, log in, then run:

```cypher
CREATE DATABASE memorytonic;
:use memorytonic
```

> Neo4j Community Edition only supports one user-database. If you're on Community and can't run `CREATE DATABASE`, set `NEO4J_DATABASE=neo4j` in your env (see Configuration) and the scripts will use the default database instead.

---

## 2 — Install Component 01 (Ingestion)

```bash
cd components/01-ingestion/nlp

# Create a virtual environment
python -m venv .venv

# Activate it
#   Windows (PowerShell):
.venv\Scripts\Activate.ps1
#   macOS / Linux:
source .venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt

# One-time: download spaCy model + warm BERT
python setup-nlp.py
```

Then bootstrap the Neo4j schema (constraints, indexes, default directories):

```bash
cd ..              # back to components/01-ingestion
python neo4j/bootstrap.py
```

You should see seven constraints, ~17 indexes, and three default directories (Research, Business, Personal) created. The script is idempotent — safe to re-run.

---

## 3 — Install Components 02 & 03 (Graph Studio + Frontend)

```bash
cd components/02-graph-studio
npm install

cd ../03-frontend
npm install
```

---

## Configuration

All Neo4j connection settings are read from environment variables. Sensible defaults are baked in, but if you've changed anything during setup you can override them.

### For Python scripts (Component 01)

Create `components/01-ingestion/neo4j/.env` (or set OS env vars):

```env
NEO4J_HTTP=http://localhost:7474
NEO4J_USER=neo4j
NEO4J_PASSWORD=memorytonic
NEO4J_DATABASE=memorytonic
```

### For Graph Studio (Component 02) and Frontend (Component 03)

Create `.env.local` inside each component folder:

```env
VITE_NEO4J_URI=bolt://localhost:7687
VITE_NEO4J_USER=neo4j
VITE_NEO4J_PASSWORD=memorytonic
VITE_NEO4J_DATABASE=memorytonic
```

---

## Using it

### Run the UIs

```bash
# Terminal 1 — Graph Studio (force-directed graph)
cd components/02-graph-studio && npm run dev
# → http://localhost:5173

# Terminal 2 — Frontend (full app: directories, collections, projects, entities)
cd components/03-frontend && npm run dev
# → http://localhost:5174
```

Open the Frontend first — that's the front door. It embeds Graph Studio on the `#/graph/:collection` route.

### Add your own knowledge

The graph starts empty. Here is the full pipeline for adding one document.

#### Step 1 — Drop the source

```
components/01-ingestion/data/projects/my-project-name/script.md
```

Use kebab-case for the folder name. Anything inside the folder is fine; the LLM agent in the next step will read `script.md` (or whatever you point it at).

#### Step 2 — Run extraction (with an LLM)

This is the only non-scripted step. You give the source text to an LLM together with the extraction protocol, and it produces JSON artifacts.

1. Open a fresh chat with **Claude**, **ChatGPT**, **Gemini**, or any LLM that can follow a long markdown protocol and emit JSON.
2. Paste the contents of [`components/01-ingestion/skills/extraction-pipeline-skill.md`](components/01-ingestion/skills/extraction-pipeline-skill.md) as the first message. (This is the "constitution" — it tells the LLM the 6-step pipeline, the quality bar, the schema, and the traps.)
3. Paste your source text from `script.md`.
4. The LLM walks through the steps and produces these artifacts (save each one as the LLM completes it):
   ```
   data/extracted/my-project-name/
     ├── 01_html.html             ← formatted dark-theme HTML
     ├── 02_placement.json        ← directory + collection assignment
     ├── 03_nlp_entities.json     ← (you'll generate this with the Python script below)
     ├── 04_all_entities.json     ← entities + temporal phases
     ├── 05_embeddings.json       ← (you'll generate this with the Python script below)
     └── 06_extraction.json       ← summary, narrative_flow, relationships, causal chains
   ```
5. For the two scripted artifacts (NLP + embeddings), run:
   ```bash
   cd components/01-ingestion
   python nlp/preprocess.py data/projects/my-project-name/script.md \
       > data/extracted/my-project-name/03_nlp_entities.json

   python nlp/embed.py data/extracted/my-project-name/
   ```

For the full quality bar and pass/fail examples, see [`components/01-ingestion/skills/`](components/01-ingestion/skills/) — the README there is the map.

#### Step 3 — Validate

```bash
cd components/01-ingestion
python neo4j/validate_project.py data/extracted/my-project-name
```

This applies ~30 structural and content rules. If anything fails, fix the JSON and re-run.

#### Step 4 — Upload

```bash
python neo4j/upload.py data/extracted/my-project-name
```

Writes nodes, relationships, and embeddings into Neo4j.

#### Step 5 — Compute graph metrics

```bash
python neo4j/gds.py
```

PageRank, Betweenness Centrality, Node Similarity. Stored as node properties for the UI to consume.

#### Step 6 — Explore

Open the Frontend (`http://localhost:5174`), navigate to your project's collection, click into the graph. Bridge entities that connect this document to others in the same collection are highlighted with gold/silver/bronze rings.

#### Bonus — Source material from YouTube

If you want to feed in video content, see [`getting youtube srts/README.md`](getting%20youtube%20srts/README.md). It's a small `yt-dlp`-based toolkit (no API key required) that pulls every video + transcript from any YouTube channel and writes them as `.txt` files. Drop the resulting `.txt` into `components/01-ingestion/data/projects/<name>/script.md` and continue from Step 2 above.

#### Useful maintenance scripts

| Script | What it does |
|--------|--------------|
| `neo4j/bootstrap.py` | Create/upgrade schema (constraints, indexes, default directories). Idempotent. |
| `neo4j/validate_schema.py` | Verify the live schema matches what the scripts expect. |
| `neo4j/delete_project.py <name>` | Cascade-delete a project from Neo4j and the filesystem. `--dry-run` available. |
| `neo4j/export_collection.py <name>` | Export a collection as a portable ZIP (`graph.json` + HTML + embeddings). |
| `neo4j/import_collection.py <zip>` | Import a collection ZIP from another MemoryTonic install. |

---

## Architecture at a glance

```
                       ┌──────────────────────────┐
   Raw text  ──────►   │  01 INGESTION (Python)   │
                       │  • NLP (spaCy, TF-IDF)   │
                       │  • LLM extraction        │
                       │  • BERT embeddings (384d)│
                       │  • Upload + GDS metrics  │
                       └─────────────┬────────────┘
                                     │ HTTP
                                     ▼
                       ┌──────────────────────────┐
                       │   Neo4j  (local, +GDS)   │
                       └─────────────┬────────────┘
                                     │ Bolt
                       ┌─────────────┴────────────┐
                       ▼                          ▼
              ┌────────────────┐         ┌────────────────┐
              │ 02 GRAPH STUDIO│         │ 03 FRONTEND    │
              │ force-directed │◄────────│ app shell,     │
              │ graph viewer   │ embeds  │ 8 routes, RSB  │
              └────────────────┘         └────────────────┘
```

### Graph schema

**Nodes:** `Project`, `Entity`, `Collection`, `DirectoryCategory`, `DateTime`, `TemporalEvent`, `CausalChain`

**Relationships:** `BELONGS_TO`, `BELONGS_TO_PROJECT`, `MENTIONED_IN`, `RELATES_TO` (with `relType`, `causalClassification`, `evidence`, `magnitude`), `SIMILAR_TO`, `CHAIN_LINK`, `IN_DIRECTORY`, …

**14 entity categories** (fixed): Person, Organization, Place, Event, Concept, System, Process, Technology, Law, Agreement, Metric, Document, Resource, Other.

**15 causal classification families** (fixed): CAUSES, ENABLES, BLOCKS, INFLUENCES, DEPENDS_ON, CONTRADICTS, SUPPORTS, PRECEDES, COMPETES_WITH, COOPERATES_WITH, REGULATES, TRANSFORMS, PRODUCES, CONSUMES, IMPLEMENTS.

**Bridge entities** — entities that appear in multiple projects — are tiered Gold (3+), Silver (2), Bronze (high betweenness) and visually highlighted. This is the core research-insight mechanism.

For the complete schema and the rationale behind it, see:

- [`components/01-ingestion/README.md`](components/01-ingestion/README.md) — extraction pipeline, NLP, Neo4j scripts
- [`components/02-graph-studio/DESIGN-SPEC.md`](components/02-graph-studio/DESIGN-SPEC.md) — graph viewer architecture
- [`components/03-frontend/DESIGN-SPEC.md`](components/03-frontend/DESIGN-SPEC.md) — application shell, queries, routes

---

## Query the graph through Claude (or any LLM)

The two UIs are one way in. The other is just talking to Claude.

Once your graph has data in it, you can ask questions like *"which entities bridge the most documents in my Finance collection?"* or *"trace the causal chain from sanctions to currency devaluation,"* and have Claude write and run the Cypher for you. Three setups, pick whichever fits your workflow:

### Option 1 — Claude Desktop + Neo4j MCP server (most polished)

There's a community MCP server that exposes Neo4j to Claude Desktop:

```bash
pip install mcp-neo4j-cypher
```

Edit your Claude Desktop config:

- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

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

Restart Claude Desktop. You can now ask things like *"show me the gold-tier bridge entities sorted by PageRank"* and Claude will write the Cypher, run it, and explain the results.

### Option 2 — Claude Code (or any terminal-using agent)

If you use Claude Code, point it at this repository and Claude reads [`CLAUDE.md`](CLAUDE.md) automatically — that file documents the schema, the locked vocabularies, and shells out to `cypher-shell` or the bundled Python `db.py` helper to run queries on your behalf.

### Option 3 — Paste the schema into any chat

Even without an MCP server, you can copy the **Graph schema** section above (or all of [`CLAUDE.md`](CLAUDE.md)) into a fresh Claude/ChatGPT/Gemini chat, describe your question, and ask the LLM to write the Cypher. Paste the query into Neo4j Browser (`http://localhost:7474`), paste the result back to the LLM, and it'll synthesize an answer.

The schema is the whole protocol — once an LLM has the labels, relationships, and the 14/15 locked vocabularies, it can reason about your graph as well as it reasons about code.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `Neo.ClientError.Database.DatabaseNotFound` | The `memorytonic` database doesn't exist | Run `CREATE DATABASE memorytonic;` in Neo4j Browser, or set `NEO4J_DATABASE=neo4j` |
| `Could not find gds.*` procedures | GDS plugin not installed | Install Graph Data Science plugin in Neo4j Desktop |
| `Auth failed` | Wrong password | Reset in Neo4j Desktop, update env vars |
| Graph Studio shows zero nodes | Database empty or wrong database name | Verify in Neo4j Browser: `MATCH (e:Entity) RETURN count(e)` |
| `ModuleNotFoundError: spacy` | Virtualenv not activated | Re-activate `.venv` and re-run |
| `DLL load failed while importing` on `import spacy` / `sentence_transformers` (Windows) | Smart App Control / Application Control is blocking unsigned DLLs inside the `.venv`. Common in `Downloads\`, `Desktop\`, OneDrive-synced folders, and USB drives. Not a Python-version issue — affects 3.10 / 3.11 / 3.12 equally. | **Easiest:** move the whole project to a trusted folder like `C:\dev\memorytonic\` and recreate the venv there. **Or:** use system Python (skip the venv) so DLLs load from the trusted Python install location. **Or:** install via Conda/Miniforge — its packages are signed and usually pass Smart App Control. |

---

## License

MIT — do what you like, no warranty.
