# Artifact Sync Workflow

> This routed procedure is extracted from the root contract. Load it only for this route; repository-relative paths are relative to the Engram root.

When the user asks to sync/update/refresh an **artifact** with current Engram knowledge, run the dynamic workflow at `schema/workflows/artifact-sync.js`. **The script is the source of truth for its own mechanism** (stages, agent fan-out, cost, the `adds` materiality bar) — don't restate it here, and don't reconcile by hand in one context.

What it does: reconciles Engram knowledge **added since the last sync** against an artifact's claims surfaces (`index.html` primary; a populated HAI-Harness `Human/` layer as supplement). The default target is an Engram artifact. An external target requires an explicit user request; ProductLab targets pass through the optional integration first. It **proposes, never applies** — writes exactly one dated report `<artifact>/Human/knowledge-sync-<date>.md` (creating `Human/` if needed), and never touches the canonical `Human/` files, `Agents/`, or the deliverable. If an artifact has neither an `index.html` nor a populated `Human/`, it stops without a report.

**Dispatch (before launching):** if a prior `knowledge-sync-*.md` exists, pass `mode: incremental`; if none, **ask the user latest-delta vs full-backfill** and pass `mode: latest|backfill`; to target a specific change, pass `preselectedPages: [{path,title}]`.

```
Workflow({ scriptPath: "<pksRoot>/schema/workflows/artifact-sync.js",
  args: { pksRoot: "<abs repo root>", artifactPath: "<absolute artifact path or artifact/<name>>", today: "<YYYY-MM-DD>", mode: "incremental" } })
```
