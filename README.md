# MemoryTonic

> A personal knowledge-graph research tool that discovers connections between documents that no single document contains.

Feed in raw text (articles, papers, transcripts). MemoryTonic extracts entities, relationships, and causal chains into a Neo4j graph — then surfaces the **bridge entities** that connect documents you'd never have linked manually.

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

The graph starts empty. To add a document:

1. **Prepare the source.** Drop raw text into `components/01-ingestion/data/projects/<project-name>/script.md`.
2. **Run extraction.** This step uses an LLM (Claude, GPT, or any model that can follow the skills in `components/01-ingestion/skills/`). The output is a set of JSON artifacts in `data/extracted/<project-name>/`. Read `components/01-ingestion/README.md` for the full 6-step pipeline.
3. **Validate.**
   ```bash
   python neo4j/validate_project.py data/extracted/<project-name>
   ```
4. **Upload.**
   ```bash
   python neo4j/upload.py data/extracted/<project-name>
   ```
5. **Compute graph metrics** (PageRank, Betweenness, Node Similarity):
   ```bash
   python neo4j/gds.py
   ```
6. **Explore.** Open the Frontend → navigate to your project's collection → click into the graph.

### Pulling YouTube transcripts (optional)

If your source material is video, see [`getting youtube srts/README.md`](getting%20youtube%20srts/README.md) — a small Python toolkit (built on `yt-dlp`) that pulls every video and transcript from any YouTube channel into clean CSVs and `.txt` files. No API key required.

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

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `Neo.ClientError.Database.DatabaseNotFound` | The `memorytonic` database doesn't exist | Run `CREATE DATABASE memorytonic;` in Neo4j Browser, or set `NEO4J_DATABASE=neo4j` |
| `Could not find gds.*` procedures | GDS plugin not installed | Install Graph Data Science plugin in Neo4j Desktop |
| `Auth failed` | Wrong password | Reset in Neo4j Desktop, update env vars |
| Graph Studio shows zero nodes | Database empty or wrong database name | Verify in Neo4j Browser: `MATCH (e:Entity) RETURN count(e)` |
| `ModuleNotFoundError: spacy` | Virtualenv not activated | Re-activate `.venv` and re-run |
| Windows blocks `.venv` DLLs | Application Control restriction in some folders | Move project out of `Downloads/`, or use system Python |

---

## License

MIT — do what you like, no warranty.
