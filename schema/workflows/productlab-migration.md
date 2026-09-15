# Engram Artifact to ProductLab Migration

Load only after an explicit user request to move named work through the optional ProductLab integration. Artifact complexity or a completed build is not authorization.

This is the relocation harness for `artifact/` content. It changes ownership and location; it does not reinterpret product content.

## Fixed rules

- Keep the current local `PKS/artifact/_brand/` path in place until the separately approved local-path migration.
- Ordinary new work stays directly in `artifact/`; this workflow handles only the user-requested relocation scope.
- Active projects live directly under ProductLab; inactive projects live under `ProductLab/archive/`.
- A legacy artifact may become either a new project or material inside an existing project.
- Latest confirmed project decisions determine ownership when older folders disagree.
- Git remotes, credentials, and push access are not migration gates.
- Historical absolute paths are recorded in the relocation map instead of mass-rewriting archives.

## Per-item classification

For every legacy top-level folder, record exactly one disposition:

- `new-project` → `ProductLab/<Project>/`
- `project-artifact` → `ProductLab/<Project>/Artifacts/<Name>/`
- `project-work` → `ProductLab/<Project>/Work/<Name>/`
- `project-archive` → `ProductLab/<Project>/Archive/<Name>/`
- `archive-project` → `ProductLab/archive/<Project>/`
- `keep-brand` → remains at the current local `PKS/artifact/_brand/` path until local migration
- `discard` → remove only after explicit confirmation

Unclassified content stays in place.

## Copy, verify, then remove

1. Audit the source: size, file count, nested repositories, dependency/cache folders, current decision files, and absolute-path references.
2. Resolve the stable `project_id` and destination through ProductLab `_catalog/`.
3. Copy the complete project-owned snapshot first. Preserve `Agents/`, `Human/`, source, exports, generated outputs, Storybook/static sites, and historical artifacts.
4. Exclude only reproducible machine-local material such as `node_modules/`, package caches, framework caches, transient logs, and `.DS_Store`. Do not discard a generated output merely because source also exists.
5. Add `.productlab/project.json` to a project root and register every old location in `_catalog/relocations.jsonl`.
6. Compare source and destination manifests after applying the explicit exclusion list. Verify file counts/hashes and open or build the principal deliverable when practical.
7. Update only current routing/instruction files that name the old operating root. Do not rewrite historical decision/task archives.
8. Mark the migration record `verified` with timestamp and checks performed.
9. Remove the Engram source only in a later destructive pass, after verification and a separate confirmation. The first pass is non-destructive.

## Recovery

The relocation map is append-only. Each entry records `project_id`, `old_path`, `new_path`, `moved_at`, and `status`. An agent that encounters an old absolute path runs:

```sh
node <ProductLab>/_catalog/bin/product-lab.mjs resolve "<old-path>"
```

The resolver returns the current active or archived location without scanning all projects.
