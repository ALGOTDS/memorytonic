# Skills

The extraction pipeline isn't a single script — it's a sequence of steps that a human (or an LLM acting on the user's behalf) walks through. These markdown files are the **instructions for that LLM**.

You hand the LLM (Claude, ChatGPT, Gemini — anything that can read markdown and write JSON) one of these skills, and it knows what to do.

## Where to start

Read these in order the first time:

| # | File | What it teaches |
|---|------|-----------------|
| 1 | [`extraction-pipeline-skill.md`](extraction-pipeline-skill.md) | **Start here.** Zero-context agent guide — full end-to-end pipeline with exact commands and traps. A fresh LLM reads this first and can run the pipeline. |
| 2 | [`extraction-agent.md`](extraction-agent.md) | The 6-step orchestration: HTML → NLP → entity discovery → full extraction → embeddings → upload. Step-by-step inputs/outputs. |
| 3 | [`extraction-skill.md`](extraction-skill.md) | Quality bar — entity definitions ≥100 chars, edge descriptions ≥80 chars, evidence as exact quotes, etc. Pass/fail examples for every field. |
| 4 | [`checklist-template.md`](checklist-template.md) | Per-project tracker. Copy into `data/temp/<project>/checklist.md` before extracting and tick boxes as you go. |
| 5 | [`extraction-checklist.md`](extraction-checklist.md) | Quick reference for common mistakes (case-sensitive merges, missing aliases, …). |

## Reference (read when needed)

| File | When to read |
|------|--------------|
| [`nlp-setup-skill.md`](nlp-setup-skill.md) | Setting up the Python NLP environment, spaCy + BERT |
| [`html-template-skill.md`](html-template-skill.md) | Building the dark-theme HTML source document in Step 01 |
| [`neo4j-operations-skill.md`](neo4j-operations-skill.md) | CRUD, search, explore, gap-finding, bridge analysis |
| [`cypher-queries-skill.md`](cypher-queries-skill.md) | 30+ ready-made Cypher patterns |
| [`gds-skill.md`](gds-skill.md) | Running PageRank, Betweenness, Degree, Node Similarity |
| [`gds-catalog-skill.md`](gds-catalog-skill.md) | Full GDS algorithm catalog with relevance ratings |
| [`maintenance-skill.md`](maintenance-skill.md) | Post-upload checks, periodic maintenance |
| [`import-pipeline-skill.md`](import-pipeline-skill.md) | Importing a collection ZIP exported from another MemoryTonic install |

## How to use a skill with an LLM

1. Open a fresh chat with Claude / ChatGPT / your LLM of choice.
2. Paste the contents of `extraction-pipeline-skill.md` as the first message — that's the agent's "constitution" for this task.
3. Paste your source text and ask it to extract.
4. The LLM produces the JSON artifacts (`02_placement.json`, `04_all_entities.json`, `06_extraction.json`) following the format spec.
5. Save each artifact under `data/extracted/<project-name>/`.
6. Run `python neo4j/validate_project.py data/extracted/<project-name>` to gate-check.
7. Run `python neo4j/upload.py data/extracted/<project-name>` to push to Neo4j.
8. Run `python neo4j/gds.py` to compute graph metrics.
