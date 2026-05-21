# Extraction Agent

**Purpose:** Orchestrates the 6-step extraction pipeline.
**Companion files:** `extraction-skill.md` (quality bar), `checklist-template.md` (live tracker)

---

## FIRST: Instantiate Live Checklist

Before ANY extraction work, copy `checklist-template.md` to `data/temp/<project-name>/checklist.md`.
Fill in `{{PROJECT_NAME}}`, `{{TIMESTAMP}}`, `{{SOURCE_PATH}}`.
Tick checkboxes and fill stats AS YOU GO. The checklist is the audit trail.

---

## Pipeline

```
SCHEMA → STEP 01 → STEP 02 → STEP 03 → STEP 04 → STEP 05 → VALIDATE → STEP 06
(once)   HTML+Place  NLP       Entities   Extraction  Embeddings  Gate      Upload
```

Artifacts live in `data/temp/<project>/` during execution.
Move to `data/extracted/<project>/` only after full success.

---

## STEP 00: SCHEMA BOOTSTRAP (one-time prerequisite)

**In:** Fresh Neo4j DBMS | **Out:** Schema ready for uploads | **Tool:** `python neo4j/bootstrap.py`

**Run ONCE before the first upload. Subsequent projects skip this step.**

The schema creates the structural foundation that all uploads depend on:

| What | Count | Why |
|------|-------|-----|
| **Constraints** | 7 | Unique IDs on Entity, Project, Collection, DirectoryCategory, DateTime, TemporalEvent, CausalChain |
| **Property indexes** | 5 | Fast lookup by entity name/category, project name, collection name, temporal event project |
| **Fulltext index** | 1 | Search across entity name, definition, aliases |
| **Vector indexes** | 2 | 384d cosine similarity on Entity and Project embeddings (BERT) |
| **Default directories** | 3 | Research, Business, Personal |

### Run
```bash
python neo4j/bootstrap.py            # Create schema (idempotent)
python neo4j/bootstrap.py --status   # Verify schema exists
python neo4j/bootstrap.py --clean    # Wipe everything + rebuild (DESTRUCTIVE)
```

### Prerequisites
- Neo4j DBMS running (http://localhost:7474)
- Database exists (Community Edition: `neo4j` default database)
- Credentials configured in `neo4j/.env` (not hardcoded)

### Gate 00
- [ ] `bootstrap.py` reports all constraints OK
- [ ] `bootstrap.py` reports all indexes OK
- [ ] `bootstrap.py` reports vector indexes OK
- [ ] `bootstrap.py --status` shows 7 constraints, 8+ indexes, 3 directories

---

## STEP 01: HTML + PLACEMENT

**In:** Raw text | **Out:** `01_html.html` + `02_placement.json`

1. Read `skills/html-template-skill.md` for the styled HTML template.
2. Convert text to styled HTML using the template — dark theme, voice blocks, embedded CSS. Preserve ALL depth — no summarizing.
3. Determine placement: directory, project name (kebab-case), collection.
4. Collection assignment is MANDATORY — pipeline blocks without it.

### SKELETON — 02_placement.json
```json
{
  "directory": "Research",
  "project_name": "kebab-case-name",
  "unique_id": "kebab-case-name",
  "collection": "Collection Name",
  "collection_is_new": false
}
```
**5 fields required. `collection` not `collection_name`. `project_name` not `name`. `unique_id` = `project_name`.**

→ Tick Gate 01 in checklist before proceeding.

---

## STEP 02: NLP PREPROCESSING

**In:** Raw text | **Out:** `03_nlp_entities.json` | **Tool:** `python nlp/preprocess.py`

1. Run preprocess.py on source text.
2. Record: entity_candidates count, keyword sections, stderr.
3. If NLP fails: WARN + continue (Claude handles alone in Step 03).

→ Tick Gate 02 in checklist before proceeding.

---

## STEP 03: ENTITY DISCOVERY

**In:** Raw text + `03_nlp_entities.json` | **Out:** `04_all_entities.json` + `04b_reconciliation.json`

### NLP RECONCILIATION (MANDATORY — hard-enforced by validator)

**RULE: NLP real entities are NEVER reduced, only added to.**
Every real NLP entity MUST appear in the final list. LLM adds what NLP missed — it never drops what NLP found.

**Workflow is STRICTLY NLP-first. Do not start from paper understanding:**

1. **Load NLP candidates** from `03_nlp_entities.json` (`entity_candidates[].text`).
2. **For each candidate, decide real or noise:**
   - Noise is: percentages, math notation (Nint, Bcell, M^3/4), pure numbers, page refs (Table 2), common abbreviations (et al, vol, pp), fragments, brand logos in headers.
   - Everything else defaults to REAL. When in doubt, tag real.
   - Expect 40-70% real rate on academic papers. If >70% noise, re-examine — you are probably under-extracting.
3. **Every "real" candidate becomes a full entity** in `04_all_entities.json` — definition (100+ chars), role (stance + mechanics + reasoning), category (from 14 fixed), aliases.
4. **Then add LLM-discovered entities** — concepts, systems, processes, metrics, laws that NLP missed (NLP is weak at abstract nouns and multi-word concepts).
5. **Write `04b_reconciliation.json`** (see spec below). The validator requires this file and will BLOCK upload if:
   - Any NLP candidate is untagged
   - Any `real` tag lacks `final_entity_name` mapping
   - Any `noise` tag lacks `reason`
   - Retention rate <95% of real count
   - Entity list smaller than real count

**If you are dropping >70% of NLP candidates as noise, stop and audit.** Academic-paper NLP typically yields 30-50% noise (math, refs, fragments). 90%+ noise means you are inverting the rule and LLM-generating entities instead of reconciling NLP.

### 04b_reconciliation.json SPEC

```json
{
  "stats": {
    "nlp_total": 665,
    "nlp_real": 420,
    "nlp_noise": 245,
    "llm_added": 85,
    "final_total": 505
  },
  "nlp_candidates_tagged": [
    {"text": "MNE", "decision": "real", "final_entity_name": "Multinational Enterprise"},
    {"text": "Table 2", "decision": "noise", "reason": "in-paper table reference, not an entity"},
    {"text": "et al", "decision": "noise", "reason": "citation fragment"},
    ...
  ],
  "llm_additions": [
    "Absorptive Capacity",
    "Scaling vs Growth Distinction"
  ]
}
```

Every NLP candidate appears EXACTLY ONCE in `nlp_candidates_tagged`. `final_entity_name` must exist in `04_all_entities.json` by name or alias.

### What Claude Does
1. Review NLP candidates against full text — every real candidate gets a decision.
2. Add entities NLP missed (concepts, systems, processes — NLP is weak here).
3. Write definition (100+ chars, system mechanics) and role (stance + mechanics + reasoning).
4. Identify temporal phases and map `first_appearance_index`.
5. Assign 1-3 aliases per entity (critical for cross-project merge).

### SKELETON — 04_all_entities.json
```json
{
  "temporal_phases": [
    { "index": 1, "label": "Phase Label", "period": "1944-1971" }
  ],
  "entities": [
    {
      "name": "Entity Name",
      "aliases": ["Alias 1", "Alias 2"],
      "category": "Organization",
      "definition": "100+ chars, system mechanics...",
      "role": "Stance + mechanics + reasoning...",
      "first_appearance_index": 1
    }
  ]
}
```
**Category must be one of 14: Person, Organization, Place, Event, Concept, System, Process, Technology, Law, Agreement, Metric, Document, Resource, Other.**

→ Tick Gate 03 in checklist before proceeding.

---

## STEP 04: FULL EXTRACTION

**In:** Raw text + `04_all_entities.json` | **Out:** `06_extraction.json`

### What Claude Does
1. Write summary (200+ words, system mechanics, adaptive to content type).
2. Write narrative_flow (4+ ordered key moments AS STRINGS).
3. Assign tags: domain, subdomain, 3+ base_tags.
4. Build relationships between Step 03 entities (minimum 15).
5. Build causal chains (minimum 2, each 3+ links).

### SKELETON — 06_extraction.json

**CRITICAL: The `"project"` wrapper is MANDATORY. `upload.py` reads `extraction["project"]`.**

```json
{
  "project": {
    "name": "Human-Readable Display Title",
    "unique_id": "kebab-case-slug",
    "summary": "200+ words...",
    "narrative_flow": [
      "Key moment 1 as a string",
      "Key moment 2 as a string"
    ],
    "tags": {
      "domain": "Economics",
      "subdomain": "International Finance",
      "base_tags": ["tag1", "tag2", "tag3"]
    }
  },
  "relationships": [
    {
      "source": "Entity A",
      "target": "Entity B",
      "relType": "SPECIFIC_VERB",
      "causalClassification": "ENABLES",
      "description": "80+ chars, HOW this works...",
      "evidence": "Exact quote from source text",
      "evidenceStrength": "established",
      "magnitude": "foundational",
      "year": "1974"
    }
  ],
  // NOTE: For ongoing/structural relationships without a specific year, use "ongoing"
  "causal_chains": [
    {
      "name": "Chain Name",
      "description": "What this chain traces",
      "links": [
        {
          "source": "Entity A",
          "target": "Entity B",
          "explanation": "HOW and WHY, system mechanics"
        }
      ]
    }
  ]
}
```

### STRUCTURE TRAPS (every one has caused a real failure)
| Wrong | Right | What breaks |
|-------|-------|-------------|
| No `project` wrapper | `"project": { ... }` | KeyError in upload.py line 137 |
| `narrative_flow` as objects | Array of STRINGS | Neo4j string[] property fails |
| `source_entity` / `target_entity` | `source` / `target` | KeyError in upload.py |
| `period` in relationship | `year` | Wrong field stored |
| `from` / `to` in chain links | `source` / `target` | Format inconsistency |
| Tags at top level | Tags inside `project` | Schema mismatch |
| Entity name != Step 03 name | Exact match required | Relationship skipped silently |

### Validation
- Source/target names MUST match Step 03 entity names exactly.
- `causalClassification` must be one of 15: CAUSES, ENABLES, BLOCKS, INFLUENCES, DEPENDS_ON, CONTRADICTS, SUPPORTS, PRECEDES, COMPETES_WITH, COOPERATES_WITH, REGULATES, TRANSFORMS, PRODUCES, CONSUMES, IMPLEMENTS.
- `evidenceStrength`: established, claimed, disputed, speculative.
- `magnitude`: foundational, significant, marginal.

→ Tick Gate 04 in checklist before proceeding.

---

## STEP 05: EMBEDDINGS

**In:** `04_all_entities.json` + `06_extraction.json` | **Out:** `05_embeddings.json` | **Tool:** `python nlp/embed.py` (stdin)

1. Build input: `{"texts": ["def+role concat", ...], "names": ["Entity Name", ...]}`.
   Last text = project summary, last name = project unique_id.
2. Pipe to embed.py stdin, capture stdout to `05_embeddings.json`.
3. If embeddings fail: WARN + continue (graph works without them).

### INPUT FORMAT (stdin to embed.py)
```json
{"texts": ["definition + role concatenated", ...], "names": ["Entity Name", ...]}
```

### OUTPUT FORMAT — 05_embeddings.json
```json
{
  "model": "all-MiniLM-L6-v2",
  "dimensions": 384,
  "embeddings": [
    { "name": "Entity Name", "embedding": [0.023, -0.041, ...], "dimensions": 384 }
  ]
}
```
Last embedding = project (name matches unique_id). upload.py reads this directly.

→ Tick Gate 05 in checklist before proceeding.

---

## STEP 05.5: VALIDATION GATE (MANDATORY)

**In:** All artifacts in project dir | **Out:** Pass/fail report | **Tool:** `python neo4j/validate_project.py`

**This step is NOT optional. Do NOT proceed to upload without passing validation.**

1. Run validation: `python neo4j/validate_project.py --human <project-dir>`
2. If ERRORS: fix the specific issues reported, re-run validation.
3. If PASS: proceed to Step 06.
4. Maximum 2 fix-and-revalidate cycles. After that, stop and report to user.

### What It Checks (30+ rules)
- File presence (all 6 artifacts)
- 02_placement.json: field names, types, ID consistency
- 04_all_entities.json: phases, entity fields, categories, definitions, duplicates
- 06_extraction.json: structure, summary length, narrative format, relationship fields, entity name matches, causal chain fields
- 05_embeddings.json: correct `embeddings` array format, dimensions, entity name matches, count
- Cross-file: unique_id consistency, entity name references

→ Tick Gate 05.5 in checklist before proceeding.

---

## STEP 06: STORE + UPLOAD

**In:** All artifacts | **Action:** Upload to Neo4j + move to permanent storage.

1. Verify Neo4j is running.
2. Run `python neo4j/upload.py <temp-project-dir>` in FOREGROUND.
3. Verify: project node, entity count, relationship count, bridge entities.
4. Copy all artifacts to `data/extracted/<project-name>/`.
5. Copy `01_html.html` to `data/sources/YYYY-MM-DD/<project-name>/01_html.html`.
   This is the path stored in the Neo4j Project node (`htmlPath` property).
   `upload.py` generates this path as `data/sources/{today}/{project-name}/01_html.html`.
6. Copy source script to `data/projects/<project-name>/`.
7. Copy stderr logs.
8. Clean temp only after verification.

### Storage Layout (after Step 06)
```
data/
├── extracted/<project>/    ← All 6 JSON/HTML artifacts (permanent archive)
├── sources/YYYY-MM-DD/<project>/01_html.html  ← HTML served to frontend (matches Neo4j htmlPath)
├── projects/<project>/     ← Original source script.md
└── temp/<project>/         ← Working directory (deleted after success)
```

→ Tick Gate 06 in checklist. Fill pipeline summary table.

---

## Error Handling

| Failure | Response |
|---------|----------|
| Stage fails | STOP. Report stage + error. Do not proceed. |
| Validation fails | Retry that stage only (max 2 retries). |
| Neo4j down | Report. No partial writes. |
| NLP fails | WARN + continue. Claude handles alone. |
| Embeddings fail | WARN + continue. Graph still works. |

Retry floors: < entity floor → "extract more." < 15 relationships → "dig deeper."
After 2 retries → stop, report to user.

---

## Quality Bar (see extraction-skill.md for full details + examples)

- Entity definitions: 100+ chars, system mechanics.
- Entity roles: stance + mechanics + reasoning.
- Edge descriptions: 80+ chars, HOW it works.
- Evidence: exact quotes from source.
- Causal chains: system mechanics, not narrative summary.
