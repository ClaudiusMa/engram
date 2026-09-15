# Artifact workspace

`artifact/` is the temporary home for work created with AI in Engram. Create outputs directly here:

- `artifact/<name>/` for a deliverable with supporting files;
- `artifact/<Name>.md` for a single working document;
- `artifact/_brand/` for the permanent shared design guide.

Existing files and folders stay in place until the user explicitly requests a move or cleanup; this routing policy is not permission to delete or reorganize them.

## Source digest boundary

A request to digest a source follows the root Ingest Workflow and creates or updates its source annotation in `wiki/main/sources/`. It does not create a note or a companion artifact. Build a separate artifact from that material only when the user separately requests one.

## Building and syncing

For a visual artifact from a complete document, follow [the artifact skill](../schema/skills/turn-doc-into-artifact/SKILL.md). Read `_brand/design.md`, `_brand/design.dark.md`, and `_brand/BUILD-INSTRUCTIONS.md` for the shared visual conventions.

[Artifact sync](../schema/workflows/artifact-sync.js) remains proposal-only: it writes one dated report and never edits the canonical decisions, agent instructions, or deliverable. An external target requires an explicit user request.

After validation, report the result and leave it in `artifact/`. Files here remain private and gitignored, except this public README shell.

## Optional ProductLab integration

ProductLab is disabled by default. Do not inspect its catalog, classify ownership, or initiate a handoff during ordinary Engram work. When the user explicitly asks to connect, read, sync, or move work through ProductLab, load [the optional integration](../schema/workflows/productlab.md).

An artifact can move to ProductLab when it becomes complex and the user chooses to move it. Complexity itself does not enable the integration or authorize a move. Once explicitly enabled, the integration preserves project-owned decisions and verifies migration before any separately authorized cleanup.
