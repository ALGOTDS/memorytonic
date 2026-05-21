## What this PR does

<!-- One paragraph. What changes, and why. Link issues with "Closes #N" if applicable. -->

## Component(s) touched

- [ ] `01-ingestion` (Python — Neo4j, NLP, embeddings)
- [ ] `02-graph-studio` (React graph viewer)
- [ ] `03-frontend` (React app shell)
- [ ] `getting youtube srts` (transcript helper)
- [ ] Docs only

## How I tested

<!--
For 01-ingestion: which scripts you ran end-to-end, what artifacts you produced.
For UIs: `npm run dev`, what you clicked, screenshots welcome.
For schema changes: Cypher run before/after to prove the migration.
-->

## Schema impact

- [ ] No schema change
- [ ] Adds new node label or relationship type (requires UI updates)
- [ ] Adds a new property to existing nodes/edges
- [ ] Changes the locked vocabularies (14 categories / 15 causal families) — **needs strong justification**

## Checklist

- [ ] I read `CLAUDE.md` and didn't relitigate locked decisions
- [ ] If I added a Python dep, it's in `nlp/requirements.txt`
- [ ] If I added a JS dep, it's in the right `package.json` (not the root)
- [ ] No tokens, passwords, or `.env` files committed
