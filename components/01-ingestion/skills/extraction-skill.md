# Extraction Skill

**Purpose:** Defines the extraction protocol — quality bar, format rules, examples.
**Future:** Becomes `memorytonic_extraction_guide` MCP tool content in Component 4.

---

## Extraction Quality Bar

### Entity Definitions (100+ characters)
Must explain what the entity IS in the system. System mechanics, not dictionary definitions.

```
BAD:  "The IMF is an international organization."
GOOD: "International financial institution that provides conditional loans to countries in fiscal crisis,
       enforcing structural adjustment programs (privatization, austerity, trade liberalization) that
       reshape borrowing nations' economic policy in exchange for emergency liquidity."
```

### Entity Roles (Stance + Mechanics + Reasoning)
Must include: what role the entity played, its position/stance on the central issue, WHY it holds that position, and the mechanics behind it. A researcher should understand this entity WITHOUT reading the source document.

```
BAD:  "Major player in the oil market."
GOOD: "Architects and enforcers of the petrodollar system. Saudi Arabia's stance is to maintain exclusive
       dollar-denomination of oil sales, driven by three mechanics: (1) US military protection guarantee —
       the 1974 pact exchanges dollar-denominated oil for American security umbrella over the kingdom,
       (2) sovereign wealth recycling — petrodollars flow back through US Treasury purchases, giving
       Saudi Arabia leverage in American financial markets, (3) OPEC pricing power — dollar-only trading
       forces all oil importers to maintain dollar reserves, creating permanent global demand for the currency."
```

### Edge Descriptions (80+ characters)
Must explain HOW the relationship works mechanically. Not "is related to."

```
BAD:  "Influences the economy"
GOOD: "Enforces structural adjustment programs that require privatization of state industries,
       elimination of trade barriers, and currency devaluation — fundamentally restructuring
       borrowing nations' economic sovereignty in exchange for emergency loans."
```

### Evidence (Exact Quotes)
Every edge must carry an exact quote from the source text that proves the relationship.

```
BAD:  "The text mentions they are connected."
GOOD: "I have directed Secretary Connally to suspend temporarily the convertibility of the
       dollar into gold or other reserve assets."
```

### Causal Chains (System Mechanics)
Ordered entity-driven sequences explaining HOW and WHY, not narrative summary.

```
BAD:  "Nixon ended gold standard → oil prices rose → petrodollar emerged"
GOOD: "Nixon suspends gold convertibility (1971) → dollar loses intrinsic backing → OPEC
       leverage increases as oil becomes the implicit backing → Kissinger negotiates 1974 pact
       with Saudi Arabia → oil exclusively priced in dollars → all oil-importing nations MUST
       hold dollar reserves → permanent artificial demand for US currency → US can run deficits
       without consequence because the world needs dollars to buy energy"
```

---

## Extraction Format

### Stage 2 Output: Project Overview
```json
{
  "name": "petrodollar-system",
  "summary": "200+ words, system mechanics...",
  "narrative_flow": [
    "Bretton Woods establishes dollar-gold peg (1944)",
    "US overspending breaks the peg (1971)",
    "Nixon Shock removes gold backing",
    "Kissinger-Saudi pact creates petrodollar (1974)",
    "System becomes self-reinforcing through recycling"
  ],
  "tags": {
    "domain": "Economics",
    "subdomain": "International Finance",
    "base_tags": ["petrodollar", "oil", "reserve currency", "OPEC", "monetary policy"]
  },
  "temporal_phases": [
    { "index": 1, "label": "Bretton Woods Era", "period": "1944-1971" },
    { "index": 2, "label": "Nixon Shock", "period": "1971" },
    { "index": 3, "label": "Petrodollar Formation", "period": "1973-1974" },
    { "index": 4, "label": "System Maturation", "period": "1975-2000" },
    { "index": 5, "label": "Modern Challenges", "period": "2000-present" }
  ]
}
```

### Stage 3 Output: Entities
```json
{
  "entities": [
    {
      "name": "Henry Kissinger",
      "aliases": ["Kissinger"],
      "category": "Person",
      "definition": "US Secretary of State who architected the petrodollar system by negotiating a secret 1974 agreement with Saudi Arabia that exchanged exclusive dollar-denomination of oil sales for American military protection of the Saudi kingdom.",
      "role": "Chief architect of the petrodollar pact. Kissinger's stance was that dollar hegemony must survive the collapse of Bretton Woods, and oil was the mechanism to achieve it. The mechanics: (1) identify Saudi Arabia's security vulnerability (regional threats from secular Arab nationalism), (2) offer what no other nation could — unconditional US military protection, (3) extract in return what no other agreement delivered — exclusive dollar pricing of the world's most essential commodity. This single negotiation replaced gold with oil as the dollar's implicit backing.",
      "first_appearance_index": 3
    }
  ]
}
```

### Stage 4 Output: Relationships + Causal Chains
```json
{
  "relationships": [
    {
      "source": "Henry Kissinger",
      "target": "Saudi Arabia",
      "relType": "NEGOTIATES_WITH",
      "causalClassification": "ENABLES",
      "description": "Negotiated the 1974 petrodollar pact offering US military protection in exchange for exclusive dollar-denomination of Saudi oil sales, creating the foundational agreement that replaced gold-backed currency with oil-backed currency.",
      "evidence": "a Secretary of State and a king made a deal. And that deal — never ratified by any legislature, never approved by any electorate — became the invisible operating system of the global economy.",
      "evidenceStrength": "established",
      "magnitude": "foundational",
      "year": "1974"
    }
  ],
  "causal_chains": [
    {
      "name": "Dollar Hegemony Through Oil",
      "description": "How the US replaced gold-backed currency with oil-backed currency",
      "links": [
        {
          "source": "United States",
          "target": "Gold Standard",
          "explanation": "Nixon suspends gold convertibility in 1971 because US foreign dollar holdings exceed gold reserves 3:1 — the arithmetic is fatal."
        },
        {
          "source": "Henry Kissinger",
          "target": "Saudi Arabia",
          "explanation": "1974 pact: military protection in exchange for dollar-only oil pricing. Secret, never ratified by any legislature."
        },
        {
          "source": "Saudi Arabia",
          "target": "OPEC",
          "explanation": "As OPEC's dominant producer, Saudi Arabia enforces dollar-only pricing across the cartel, making it the de facto global standard."
        },
        {
          "source": "OPEC",
          "target": "Global Economy",
          "explanation": "Every oil-importing nation must hold dollar reserves to purchase energy, creating permanent artificial demand for US currency regardless of US fiscal discipline."
        }
      ]
    }
  ]
}
```

---

## 14 Entity Categories (Reference)

| Category | When to Use |
|----------|-------------|
| Person | Named individuals |
| Organization | Companies, governments, agencies, NGOs, alliances |
| Place | Countries, cities, regions, strategic locations |
| Event | Specific historical events, agreements, battles, crises |
| Concept | Ideas, theories, doctrines, ideologies |
| System | Economic systems, political systems, operational frameworks |
| Process | Ongoing processes, procedures, mechanisms |
| Technology | Tools, weapons, platforms, infrastructure |
| Law | Laws, treaties, regulations, sanctions |
| Agreement | Pacts, deals, accords (not formal law) |
| Metric | Economic indicators, measurements, statistics |
| Document | Reports, studies, publications |
| Resource | Natural resources, commodities, assets |
| Other | Doesn't fit above — use sparingly |

---

## 15 Causal Classification Families (Reference)

| Family | Meaning | Example |
|--------|---------|---------|
| CAUSES | Direct causation | "Overspending CAUSES gold reserve depletion" |
| ENABLES | Makes possible | "Military pact ENABLES dollar-only oil pricing" |
| BLOCKS | Prevents | "Sanctions BLOCK Iran's oil exports" |
| INFLUENCES | Indirect effect | "Oil prices INFLUENCE geopolitical alliances" |
| DEPENDS_ON | Requires | "Petrodollar DEPENDS_ON Saudi compliance" |
| CONTRADICTS | Opposes/conflicts | "Gold standard CONTRADICTS deficit spending" |
| SUPPORTS | Reinforces | "OPEC pricing SUPPORTS dollar demand" |
| PRECEDES | Temporal ordering | "Bretton Woods PRECEDES Nixon Shock" |
| COMPETES_WITH | Rivalry | "Euro COMPETES_WITH dollar for reserves" |
| COOPERATES_WITH | Alliance | "US COOPERATES_WITH Saudi on security" |
| REGULATES | Controls/governs | "Fed REGULATES dollar supply" |
| TRANSFORMS | Changes nature | "Pact TRANSFORMS oil into currency backing" |
| PRODUCES | Creates/generates | "Oil exports PRODUCE petrodollars" |
| CONSUMES | Uses/depletes | "Military spending CONSUMES reserves" |
| IMPLEMENTS | Executes/applies | "Treasury IMPLEMENTS sanctions regime" |
