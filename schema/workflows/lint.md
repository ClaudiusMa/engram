# Lint Workflow

> This routed procedure is extracted from the root contract. Load it only for this route; repository-relative paths are relative to the Engram root.

Read [shared page rules](page-rules.md) for page conventions, creation thresholds, voice, and privacy.

Default cadence: manual, with a suggested lint every 10 ingests.

Check for:

- pages missing from `index.md`
- stale index summaries
- orphan pages
- source pages missing required headings
- contradictions between takes and positions
- repeated concepts without concept pages
- takes ready for promotion
- inconsistent frontmatter
- filename or link drift
- only when the [human-skill intent gate](human-skill.md) passes: human-skill pages missing from their private registry, registry rows whose `Applies when` / `Not for` boundary has drifted, and human-skill pages that violate their closed section contract
- project annotations with missing or inconsistent recorded pointers; live path, structure, and catalog checks run only when the user explicitly requests the external integration
