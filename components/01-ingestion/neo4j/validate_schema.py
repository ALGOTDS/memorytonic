"""
MemoryTonic v4 — Neo4j Schema Validator (Post-Write)

Validates that data IN Neo4j conforms to the canonical schema expected
by Components 02 (Graph Studio) and 03 (Frontend).

This catches the Two-Producer Problem: C01 (upload.py) and C04 (MCP ingest.ts)
both write to Neo4j but may use different property names or relationship types.

Usage:
  python neo4j/validate_schema.py                    # Validate all projects
  python neo4j/validate_schema.py --project <name>   # Validate one project
  python neo4j/validate_schema.py --fix               # Auto-fix known mismatches
  python neo4j/validate_schema.py --human              # Human-readable output

Exit code 0 = valid, exit code 1 = errors found.
No external dependencies — pure Python stdlib.
"""

import json
import sys
import os

# Ensure config is importable from neo4j/ directory
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from db import run_cypher, check_connection


# ---------------------------------------------------------------
# Canonical Schema (what C02/C03 expect)
# ---------------------------------------------------------------

ENTITY_REQUIRED_PROPS = ['name', 'entityId', 'category', 'definition']
ENTITY_EXPECTED_PROPS = ['role', 'projectCount', 'aliases', 'aliases_text', 'firstAppearanceIndex']
ENTITY_WRONG_PROPS = {
    'description': 'definition',      # MCP wrote 'description', should be 'definition'
}

PROJECT_REQUIRED_PROPS = ['name', 'uniqueId', 'summary']
PROJECT_EXPECTED_PROPS = ['domain', 'subdomain', 'baseTags', 'narrativeFlow', 'htmlPath', 'directory']
PROJECT_WRONG_PROPS = {
    'research_summary': 'summary',    # MCP wrote 'research_summary', should be 'summary'
    'topic_domain': 'domain',         # MCP wrote 'topic_domain', should be 'domain'
    'thesis': 'subdomain',            # MCP wrote 'thesis', should be 'subdomain'
    'tags': 'baseTags',               # MCP wrote 'tags' (string[]), should be 'baseTags'
}

# Valid relationship types (what C02/C03 query for)
VALID_REL_TYPES = {
    'RELATES_TO',           # Entity -> Entity (with relType + causalClassification props)
    'MENTIONED_IN',         # Entity -> Project
    'BELONGS_TO',           # Project -> Collection
    'BELONGS_TO_PROJECT',   # CausalChain/TemporalEvent -> Project
    'IN_DIRECTORY',         # Project -> DirectoryCategory
    'FIRST_APPEARS_IN',     # Entity -> TemporalEvent
    'CHAIN_LINK',           # Entity -> Entity (within causal chains)
    'SIMILAR_TO',           # Entity -> Entity (GDS computed)
}

# Relationship types that MCP creates but UI doesn't understand
WRONG_REL_TYPES = {
    'BELONGS_TO': {
        'context': 'Entity->Project',   # Entity BELONGS_TO Project should be MENTIONED_IN
    },
    'MEMBER_OF': {
        'context': 'Project->Collection',  # Should be BELONGS_TO
    },
}

# Typed edges that should be RELATES_TO with properties
TYPED_EDGE_NAMES = [
    'CAUSES', 'ENABLES', 'BLOCKS', 'INFLUENCES', 'DEPENDS_ON',
    'CONTRADICTS', 'SUPPORTS', 'PRECEDES', 'COMPETES_WITH',
    'COOPERATES_WITH', 'REGULATES', 'TRANSFORMS', 'PRODUCES',
    'CONSUMES', 'IMPLEMENTS', 'FUNDS', 'SANCTIONS', 'CONTROLS',
    'OPPOSES', 'THREATENS', 'EXPORTS', 'IMPORTS',
]


# ---------------------------------------------------------------
# Validation Checks
# ---------------------------------------------------------------

class SchemaValidationResult:
    def __init__(self):
        self.errors = []
        self.warnings = []
        self.stats = {}
        self.fixes_applied = []

    def error(self, category, message, count=1):
        self.errors.append({'category': category, 'message': message, 'count': count})

    def warn(self, category, message, count=1):
        self.warnings.append({'category': category, 'message': message, 'count': count})

    def fix(self, description, count):
        self.fixes_applied.append({'description': description, 'count': count})

    @property
    def valid(self):
        return len(self.errors) == 0

    def to_dict(self):
        return {
            'valid': self.valid,
            'errors': self.errors,
            'warnings': self.warnings,
            'stats': self.stats,
            'fixes_applied': self.fixes_applied,
        }

    def to_human(self):
        lines = []
        status = 'PASS' if self.valid else 'FAIL'
        lines.append('=' * 60)
        lines.append(f'  Neo4j Schema Validation: {status}')
        lines.append('=' * 60)
        lines.append('')

        if self.stats:
            lines.append('  Stats:')
            for k, v in self.stats.items():
                lines.append(f'    {k}: {v}')
            lines.append('')

        if self.errors:
            lines.append(f'  Errors ({len(self.errors)}):')
            for e in self.errors:
                count_str = f' ({e["count"]} affected)' if e['count'] > 1 else ''
                lines.append(f'    [{e["category"]}] {e["message"]}{count_str}')
            lines.append('')

        if self.warnings:
            lines.append(f'  Warnings ({len(self.warnings)}):')
            for w in self.warnings:
                count_str = f' ({w["count"]} affected)' if w['count'] > 1 else ''
                lines.append(f'    [{w["category"]}] {w["message"]}{count_str}')
            lines.append('')

        if self.fixes_applied:
            lines.append(f'  Fixes Applied ({len(self.fixes_applied)}):')
            for f in self.fixes_applied:
                lines.append(f'    [FIXED] {f["description"]} ({f["count"]} records)')
            lines.append('')

        if self.valid and not self.warnings:
            lines.append('  Schema is clean. All data conforms to canonical schema.')
            lines.append('')

        return '\n'.join(lines)


def _count(cypher, params=None):
    """Run a count query, return integer."""
    result = run_cypher(cypher, params)
    if not result['ok']:
        return -1
    rows = result['data']
    if rows and rows[0].get('data'):
        return rows[0]['data'][0]['row'][0]
    return 0


def check_entity_properties(result, project_filter=None):
    """Check entities have required properties with correct names."""
    where = f"WHERE (e)-[:MENTIONED_IN]->(:Project {{name: $project}})" if project_filter else ""
    params = {'project': project_filter} if project_filter else None

    # Total entity count
    total = _count(f"MATCH (e:Entity) {where} RETURN count(e)", params)
    result.stats['total_entities'] = total

    if total == 0:
        result.warn('ENTITY_COUNT', 'No entities found in database')
        return

    # Check for missing entityId (critical — causes dedup collapse in Graph Studio)
    missing_eid = _count(
        f"MATCH (e:Entity) {where} WHERE e.entityId IS NULL RETURN count(e)", params)
    if missing_eid > 0:
        result.error('ENTITY_MISSING_ID', f'{missing_eid}/{total} entities have NULL entityId', missing_eid)

    # Check for missing definition
    missing_def = _count(
        f"MATCH (e:Entity) {where} WHERE e.definition IS NULL RETURN count(e)", params)
    if missing_def > 0:
        result.error('ENTITY_MISSING_DEF', f'{missing_def}/{total} entities have NULL definition', missing_def)

    # Check for wrong property name: description instead of definition
    has_desc = _count(
        f"MATCH (e:Entity) {where} WHERE e.description IS NOT NULL AND e.definition IS NULL RETURN count(e)", params)
    if has_desc > 0:
        result.error('ENTITY_WRONG_PROP', f'{has_desc} entities have "description" instead of "definition"', has_desc)

    # Check for missing projectCount
    missing_pc = _count(
        f"MATCH (e:Entity) {where} WHERE e.projectCount IS NULL RETURN count(e)", params)
    if missing_pc > 0:
        result.warn('ENTITY_MISSING_PCOUNT', f'{missing_pc}/{total} entities have NULL projectCount', missing_pc)

    # Check for missing category
    missing_cat = _count(
        f"MATCH (e:Entity) {where} WHERE e.category IS NULL RETURN count(e)", params)
    if missing_cat > 0:
        result.error('ENTITY_MISSING_CAT', f'{missing_cat}/{total} entities have NULL category', missing_cat)


def check_project_properties(result, project_filter=None):
    """Check projects have required properties with correct names."""
    where = f"WHERE p.name = $project" if project_filter else ""
    params = {'project': project_filter} if project_filter else None

    total = _count(f"MATCH (p:Project) {where} RETURN count(p)", params)
    result.stats['total_projects'] = total

    if total == 0:
        result.warn('PROJECT_COUNT', 'No projects found in database')
        return

    # Check for missing summary
    missing_sum = _count(
        f"MATCH (p:Project) {where} WHERE p.summary IS NULL RETURN count(p)", params)
    if missing_sum > 0:
        result.error('PROJECT_MISSING_SUM', f'{missing_sum}/{total} projects have NULL summary', missing_sum)

    # Check wrong property names
    for wrong, correct in PROJECT_WRONG_PROPS.items():
        has_wrong = _count(
            f"MATCH (p:Project) {where} WHERE p.{wrong} IS NOT NULL AND p.{correct} IS NULL RETURN count(p)", params)
        if has_wrong > 0:
            result.error('PROJECT_WRONG_PROP', f'{has_wrong} projects have "{wrong}" instead of "{correct}"', has_wrong)

    # Check for missing domain
    missing_dom = _count(
        f"MATCH (p:Project) {where} WHERE p.domain IS NULL RETURN count(p)", params)
    if missing_dom > 0:
        result.warn('PROJECT_MISSING_DOM', f'{missing_dom}/{total} projects have NULL domain', missing_dom)

    # Check for missing baseTags
    missing_tags = _count(
        f"MATCH (p:Project) {where} WHERE p.baseTags IS NULL RETURN count(p)", params)
    if missing_tags > 0:
        result.warn('PROJECT_MISSING_TAGS', f'{missing_tags}/{total} projects have NULL baseTags', missing_tags)

    # Check for missing uniqueId
    missing_uid = _count(
        f"MATCH (p:Project) {where} WHERE p.uniqueId IS NULL RETURN count(p)", params)
    if missing_uid > 0:
        result.error('PROJECT_MISSING_UID', f'{missing_uid}/{total} projects have NULL uniqueId', missing_uid)


def check_relationships(result, project_filter=None):
    """Check relationship types match canonical schema."""

    # Check for Entity->Project using BELONGS_TO instead of MENTIONED_IN
    bad_belongs = _count(
        "MATCH (e:Entity)-[r:BELONGS_TO]->(p:Project) RETURN count(r)")
    if bad_belongs > 0:
        result.error('REL_WRONG_TYPE',
            f'{bad_belongs} Entity-[:BELONGS_TO]->Project edges (should be MENTIONED_IN)', bad_belongs)

    # Check for Project->Collection using MEMBER_OF instead of BELONGS_TO
    bad_member = _count(
        "MATCH (p:Project)-[r:MEMBER_OF]->(c:Collection) RETURN count(r)")
    if bad_member > 0:
        result.error('REL_WRONG_TYPE',
            f'{bad_member} Project-[:MEMBER_OF]->Collection edges (should be BELONGS_TO)', bad_member)

    # Check for typed edges that should be RELATES_TO
    for edge_type in TYPED_EDGE_NAMES:
        count = _count(f"MATCH ()-[r:{edge_type}]->() RETURN count(r)")
        if count > 0:
            result.error('REL_TYPED_EDGE',
                f'{count} [{edge_type}] edges (should be RELATES_TO with relType property)', count)

    # Check RELATES_TO edges have required properties
    total_rt = _count("MATCH ()-[r:RELATES_TO]->() RETURN count(r)")
    result.stats['total_relates_to'] = total_rt

    if total_rt > 0:
        missing_reltype = _count(
            "MATCH ()-[r:RELATES_TO]->() WHERE r.relType IS NULL RETURN count(r)")
        if missing_reltype > 0:
            result.warn('REL_MISSING_PROP',
                f'{missing_reltype}/{total_rt} RELATES_TO edges have NULL relType', missing_reltype)

        missing_cc = _count(
            "MATCH ()-[r:RELATES_TO]->() WHERE r.causalClassification IS NULL RETURN count(r)")
        if missing_cc > 0:
            result.warn('REL_MISSING_PROP',
                f'{missing_cc}/{total_rt} RELATES_TO edges have NULL causalClassification', missing_cc)

    # Check MENTIONED_IN edges exist
    total_mi = _count("MATCH ()-[r:MENTIONED_IN]->() RETURN count(r)")
    result.stats['total_mentioned_in'] = total_mi

    # Check MENTIONED_IN edges have role property
    if total_mi > 0:
        missing_role = _count(
            "MATCH ()-[r:MENTIONED_IN]->() WHERE r.role IS NULL RETURN count(r)")
        if missing_role > 0:
            result.warn('REL_MISSING_ROLE',
                f'{missing_role}/{total_mi} MENTIONED_IN edges have NULL role', missing_role)

    # Check Collection nodes exist and have projects
    total_col = _count("MATCH (c:Collection) RETURN count(c)")
    result.stats['total_collections'] = total_col

    orphan_projects = _count(
        "MATCH (p:Project) WHERE NOT (p)-[:BELONGS_TO]->(:Collection) RETURN count(p)")
    if orphan_projects > 0:
        result.warn('PROJECT_NO_COLLECTION',
            f'{orphan_projects} projects not linked to any collection', orphan_projects)


def check_entities_visible(result):
    """Check that entities are actually visible in the UI (have MENTIONED_IN edges)."""
    total_entities = result.stats.get('total_entities', 0)
    if total_entities == 0:
        return

    invisible = _count(
        "MATCH (e:Entity) WHERE NOT (e)-[:MENTIONED_IN]->(:Project) RETURN count(e)")
    if invisible > 0:
        result.error('ENTITY_INVISIBLE',
            f'{invisible}/{total_entities} entities have no MENTIONED_IN edge (invisible in UI)', invisible)


# ---------------------------------------------------------------
# Auto-Fix Functions
# ---------------------------------------------------------------

def apply_fixes(result):
    """Apply known schema fixes. Modifies database."""

    # Fix 1: Copy description -> definition where definition is NULL
    r = run_cypher(
        "MATCH (e:Entity) WHERE e.description IS NOT NULL AND e.definition IS NULL "
        "SET e.definition = e.description RETURN count(e) AS fixed")
    if r['ok'] and r['data'] and r['data'][0].get('data'):
        count = r['data'][0]['data'][0]['row'][0]
        if count > 0:
            result.fix('Copied Entity.description -> Entity.definition', count)

    # Fix 2: Copy research_summary -> summary
    r = run_cypher(
        "MATCH (p:Project) WHERE p.research_summary IS NOT NULL AND p.summary IS NULL "
        "SET p.summary = p.research_summary RETURN count(p) AS fixed")
    if r['ok'] and r['data'] and r['data'][0].get('data'):
        count = r['data'][0]['data'][0]['row'][0]
        if count > 0:
            result.fix('Copied Project.research_summary -> Project.summary', count)

    # Fix 3: Copy topic_domain -> domain
    r = run_cypher(
        "MATCH (p:Project) WHERE p.topic_domain IS NOT NULL AND p.domain IS NULL "
        "SET p.domain = p.topic_domain RETURN count(p) AS fixed")
    if r['ok'] and r['data'] and r['data'][0].get('data'):
        count = r['data'][0]['data'][0]['row'][0]
        if count > 0:
            result.fix('Copied Project.topic_domain -> Project.domain', count)

    # Fix 4: Copy thesis -> subdomain
    r = run_cypher(
        "MATCH (p:Project) WHERE p.thesis IS NOT NULL AND p.subdomain IS NULL "
        "SET p.subdomain = p.thesis RETURN count(p) AS fixed")
    if r['ok'] and r['data'] and r['data'][0].get('data'):
        count = r['data'][0]['data'][0]['row'][0]
        if count > 0:
            result.fix('Copied Project.thesis -> Project.subdomain', count)

    # Fix 5: Copy tags -> baseTags (only if tags is a list)
    r = run_cypher(
        "MATCH (p:Project) WHERE p.tags IS NOT NULL AND p.baseTags IS NULL "
        "SET p.baseTags = p.tags RETURN count(p) AS fixed")
    if r['ok'] and r['data'] and r['data'][0].get('data'):
        count = r['data'][0]['data'][0]['row'][0]
        if count > 0:
            result.fix('Copied Project.tags -> Project.baseTags', count)

    # Fix 6: Generate entityId for entities missing it
    r = run_cypher(
        "MATCH (e:Entity) WHERE e.entityId IS NULL "
        "SET e.entityId = 'ent-' + randomUUID() RETURN count(e) AS fixed")
    if r['ok'] and r['data'] and r['data'][0].get('data'):
        count = r['data'][0]['data'][0]['row'][0]
        if count > 0:
            result.fix('Generated entityId for entities with NULL entityId', count)

    # Fix 7: Compute projectCount from MENTIONED_IN count
    r = run_cypher(
        "MATCH (e:Entity) WHERE e.projectCount IS NULL "
        "OPTIONAL MATCH (e)-[:MENTIONED_IN]->(p:Project) "
        "WITH e, count(p) AS pc SET e.projectCount = pc RETURN count(e) AS fixed")
    if r['ok'] and r['data'] and r['data'][0].get('data'):
        count = r['data'][0]['data'][0]['row'][0]
        if count > 0:
            result.fix('Computed projectCount from MENTIONED_IN edges', count)

    # Fix 8: Create MENTIONED_IN from BELONGS_TO (Entity->Project)
    r = run_cypher(
        "MATCH (e:Entity)-[b:BELONGS_TO]->(p:Project) "
        "WHERE NOT (e)-[:MENTIONED_IN]->(p) "
        "MERGE (e)-[:MENTIONED_IN]->(p) RETURN count(b) AS fixed")
    if r['ok'] and r['data'] and r['data'][0].get('data'):
        count = r['data'][0]['data'][0]['row'][0]
        if count > 0:
            result.fix('Created MENTIONED_IN from Entity-[:BELONGS_TO]->Project', count)

    # Fix 9: Create BELONGS_TO from MEMBER_OF (Project->Collection)
    r = run_cypher(
        "MATCH (p:Project)-[m:MEMBER_OF]->(c:Collection) "
        "WHERE NOT (p)-[:BELONGS_TO]->(c) "
        "MERGE (p)-[:BELONGS_TO]->(c) RETURN count(m) AS fixed")
    if r['ok'] and r['data'] and r['data'][0].get('data'):
        count = r['data'][0]['data'][0]['row'][0]
        if count > 0:
            result.fix('Created BELONGS_TO from Project-[:MEMBER_OF]->Collection', count)

    # Fix 10: Migrate typed edges -> RELATES_TO with properties
    for edge_type in TYPED_EDGE_NAMES:
        count = _count(f"MATCH ()-[r:{edge_type}]->() RETURN count(r)")
        if count > 0:
            causal_class = edge_type  # The typed edge name IS the causalClassification
            r = run_cypher(
                f"MATCH (s)-[r:{edge_type}]->(t) "
                f"MERGE (s)-[nr:RELATES_TO {{relType: $relType, causalClassification: $cc}}]->(t) "
                f"ON CREATE SET nr.description = coalesce(r.description, ''), "
                f"  nr.evidence = coalesce(r.evidence, ''), "
                f"  nr.evidenceStrength = coalesce(r.evidenceStrength, 'established'), "
                f"  nr.magnitude = coalesce(r.magnitude, 'significant') "
                f"RETURN count(r) AS fixed",
                {'relType': edge_type, 'cc': causal_class})
            if r['ok'] and r['data'] and r['data'][0].get('data'):
                fixed = r['data'][0]['data'][0]['row'][0]
                if fixed > 0:
                    result.fix(f'Migrated [{edge_type}] -> RELATES_TO with properties', fixed)
                    # Delete old typed edges
                    run_cypher(f"MATCH ()-[r:{edge_type}]->() DELETE r")


# ---------------------------------------------------------------
# Main
# ---------------------------------------------------------------

def validate_schema(project_filter=None, auto_fix=False):
    """Run all schema validation checks. Returns result dict."""
    result = SchemaValidationResult()

    check_entity_properties(result, project_filter)
    check_project_properties(result, project_filter)
    check_relationships(result, project_filter)
    check_entities_visible(result)

    if auto_fix and not result.valid:
        apply_fixes(result)
        # Re-run checks after fixes
        result2 = SchemaValidationResult()
        check_entity_properties(result2, project_filter)
        check_project_properties(result2, project_filter)
        check_relationships(result2, project_filter)
        check_entities_visible(result2)
        # Merge: keep fixes from result, use errors/warnings from result2
        result2.fixes_applied = result.fixes_applied
        result2.stats['pre_fix_errors'] = len(result.errors)
        return result2

    return result


def main():
    args = sys.argv[1:]
    human_mode = False
    auto_fix = False
    project_filter = None

    remaining = []
    i = 0
    while i < len(args):
        if args[i] == '--human':
            human_mode = True
        elif args[i] == '--fix':
            auto_fix = True
        elif args[i] == '--project' and i + 1 < len(args):
            project_filter = args[i + 1]
            i += 1
        else:
            remaining.append(args[i])
        i += 1

    check_connection()
    result = validate_schema(project_filter=project_filter, auto_fix=auto_fix)

    if human_mode:
        print(result.to_human())
    else:
        print(json.dumps(result.to_dict(), indent=2))

    sys.exit(0 if result.valid else 1)


if __name__ == '__main__':
    main()
