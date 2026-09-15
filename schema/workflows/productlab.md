# Optional ProductLab Integration

This integration behaves as an opt-in extension. It is disabled by default. Load it only after the user explicitly requests a ProductLab connection, live read, synchronization, or move. Permission applies to the named task and project; it is not a permanent global enablement. Merely mentioning a project, finding a pointer, or creating a complex artifact does not enable it.

Ordinary Engram output stays directly in `artifact/`. Do not require ProductLab installation, a catalog, ownership classification, or promotion to complete an Engram task.

## Dispatch

- Connect or refresh a named project: use the connection procedure below.
- Read live project state: resolve the named project through the catalog, then read only the entry points in its annotation. Without a connection, use only the exact scope supplied by the user.
- Reconcile project decisions: load [project-decision-housekeeper.md](project-decision-housekeeper.md).
- Move an artifact: load [productlab-migration.md](productlab-migration.md). Artifact complexity is a reason the user may choose this operation, not automatic authorization.

## Project ownership

- **Project decisions are canonical in the project.** Confirmed project decisions belong in the project's `Human/decisions.md`; Engram may retain private provenance and knowledge derived from them, but never a second canonical decision log. When confirmed decisions conflict, the most recently confirmed decision wins and the older entry remains as superseded history. A project housekeeper performs bounded reconciliation via `schema/workflows/project-decision-housekeeper.md`; ordinary project agents never browse the Engram vault.

Active projects live directly under ProductLab; inactive projects live under `ProductLab/archive/`. Existing-project outputs belong in `Artifacts/`, working material in `Work/`, and historical snapshots in `Archive/`. Resolve stable project identity through `_catalog/`; do not scan unrelated projects.

### Connect Project Workflow

For wiring in a living, externally-owned project — a repo or folder that lives **outside the vault** — so the system can draw its *current* context on demand. This is **not** an ingest: nothing is copied in, the project keeps changing, and you create a persistent pointer the LLM follows at runtime.

1. Read `wiki/main/index.md`.
2. Assign or confirm the stable `project_id:` and resolve the project's current location through `<ProductLab>/_catalog/bin/product-lab.mjs resolve <project_id>`. Capture `repo:` and `path:` when available, but treat them as cached locators: `project_id:` is canonical and the catalog is authoritative for active vs archived location.
3. Read the project **read-only** to build a factual index — top-level structure, what each major dir/file is for, scope, and which entry points are worth reading. Never copy content in; never modify anything in the project.
4. Create the page at `wiki/main/projects/<name>.md` from `schema/templates/project.template.md`:
   - Set `project_id:`, `repo:`, and `path:` frontmatter.
   - `## What's worth reading`: factual entry points only — which dirs/files matter, what to skip. No prose synthesis (same rule as `## What's in this source`).
   - `## How it connects`: `[[wikilinks]]` to the concepts, positions, questions, and sources this project feeds or is fed by.
   - `## Where it lives`: the repo URL and the local path.
   - `## My take`: leave `_None yet._` unless the user offers a view — no discussion ceremony, but the take-protection rule still applies.
5. Update relevant entity, concept, position, and question pages to link back to the project where natural.
6. Update `index.md` under a `## Projects` table (alongside `## Sources` and `## Notes`).
7. Append `log.md`: `## [YYYY-MM-DD] connect | <Project>`.
8. Show changed files; run `git status` and confirm the project page and its `path:`/`repo:` pointers stay untracked (they live under `wiki/`).

A project page must contain these headings:

```md
## How it connects
## What's worth reading
## Where it lives
```

(`## My take` is optional, dated when present.) To **refresh** a connected project, re-read it and update `## What's worth reading` and `## How it connects` in place; the project itself is never edited by Engram.


After this workflow is explicitly activated, consult the relevant naming, voice, and privacy sections of [shared page rules](page-rules.md) before writing wiki pages.
