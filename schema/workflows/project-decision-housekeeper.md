# Project Decision Housekeeper

Portable reconciliation contract between private Engram knowledge and a ProductLab project. The mechanism is filesystem-based JSON/Markdown plus a dependency-free CLI; editor- or model-specific adapters are optional.

Load only after an explicit request to reconcile a named project through the optional ProductLab integration. Ordinary source ingest, queries, artifact creation, and project mentions do not activate this workflow.

## Authority

- The project's `Human/decisions.md` is the canonical source of truth for project decisions.
- Engram may contain the conversation, note, take, concept, or position from which a project decision arose. Those records are provenance or knowledge—not a second canonical project decision log.
- Only explicitly confirmed user decisions may cross from Engram into a project.
- When confirmed decisions conflict, the one with the later `confirmed_at` timestamp becomes active by default. Preserve the older decision as superseded history.
- Surface a conflict to the user only when confirmation status is unclear, timestamps tie or are missing, the two decisions do not share a reliable decision key, or the newer decision cannot safely be projected into agent instructions.

## Context boundary

Ordinary project agents never open, mount, symlink, index, or search the Engram vault. The housekeeper runs as two separate processes or sessions:

1. **Engram export** discovers candidates and emits one bounded packet.
2. **Project apply** validates the redacted packet and updates only the named project.

Only the packet crosses the boundary. Never send the Engram root router, `index.md`, `log.md`, `raw/`, attachments, unrelated pages, absolute private source paths, or raw quotations into the project.

Default packet limits:

- at most 8 discovery candidates / 1,000 words;
- at most 2 selected knowledge pages / 4,000 words plus manifest;
- hard cap 3 pages / 6,000 words, graph depth 1;
- oversized pages return matching headings and line-bounded excerpts only.

Fail closed when a packet exceeds a limit.

## Stable join

Every connected project has the same opaque `project_id` in:

- Engram `wiki/main/projects/<name>.md` frontmatter;
- ProductLab `_catalog/projects.json`;
- project `.productlab/project.json`.

Absolute paths are cached locators. Resolve the current active or archived path through ProductLab `_catalog/`.

## Packet (`project-decision-bridge/v1`)

The Engram-side private packet contains:

```json
{
  "schema_version": "project-decision-bridge/v1",
  "packet_id": "opaque-id",
  "project_id": "stable-project-id",
  "decision_key": "stable-topic-key",
  "action": "add|supersede|withdraw",
  "supersedes_id": null,
  "confirmed_at": "2026-08-12T12:00:00-07:00",
  "authority": "user-confirmed",
  "visibility": "private|publishable",
  "source_type": "note|confirmed-take|position|explicit-decision",
  "source_sha256": "sha256",
  "target_base_sha256": "sha256",
  "decision": {
    "Date": "2026-08-12",
    "Decision": "Exact approved decision.",
    "Why": "Exact approved rationale.",
    "Tradeoffs": "Exact approved tradeoffs.",
    "Follow-up": "Exact approved follow-up."
  },
  "agent_projection": {
    "scope_tags": ["routing"],
    "directive": "Optional exact approved worker-facing direction."
  }
}
```

Keep the private source locator in `.local/project-housekeeper/<project_id>/ledger.json`, never in the project packet. The redacted project inbox contains the opaque packet ID and source hash but no Engram page title, URL, path, or quote.

## Engram export

1. Resolve `project_id` and read only the project page's `## How it connects` and `## What's worth reading` sections.
2. Search the private index outside model context. Return only bounded candidates.
3. Decide whether the candidate is actually a project decision. This requires a reasoning-capable session; a fast worker must not infer applicability, rationale, visibility, or supersession.
4. Obtain explicit user confirmation for the complete Date / Decision / Why / Tradeoffs / Follow-up packet and, when needed, the agent directive.
5. Hash the source and target base. Record the full provenance in the Engram-private ledger.
6. Export the redacted packet to the named project's `.productlab/inbox/`.

Candidate discovery never advances the applied watermark. Record separate `seen`, `proposed`, `approved`, `applied`, and `rejected` states.

## Project apply

Application is deterministic and may be performed by a low-cost worker with zero discretion:

1. Validate schema, `project_id`, `authority=user-confirmed`, visibility, source hash, target base hash, and packet uniqueness.
2. Read only `.productlab/project.json`, the inbox packet, `Human/decisions.md`, and the generated agent projection.
3. Match active history by `decision_key`.
4. If no active decision exists, append the approved five-field decision.
5. If a matching decision exists, compare `confirmed_at`:
   - incoming newer: append it and mark the older ID superseded in the bridge state/projection;
   - incoming older: retain it as history but do not activate it;
   - equal/missing/ambiguous: stop and surface the conflict.
6. Never rewrite or delete historical Human entries. Store bridge metadata in `Human/.pks-sync/ledger.json` when the project's Human layer allows sidecars; otherwise use `.productlab/decision-ledger.json`. Do not add unapproved fields to a project's fixed Human decision format.
7. Mark the packet applied only after verifying both canonical history and projection.

If `Human/decisions.md` is tracked or publishable, a packet with `visibility=private` must not be applied there. Return a privacy conflict.

## Agent projection

Ordinary project agents may intentionally avoid `Human/`. Therefore the housekeeper also generates a bounded `Agents/active-decisions.md` containing only current decisions relevant to execution:

- opaque decision ID;
- `decision_key` and scope tags;
- exact approved Decision sentence or agent directive;
- confirmation timestamp;
- supersession state.

Do not copy Why, Tradeoffs, raw evidence, Engram locators, or historical superseded bodies into the active projection. Task-specific decisions belong in the owning task contract instead. If no approved directive or reliable scope exists, stop after canonical Human history and queue planner review rather than inventing an implementation constraint.

## Decisions made inside the project

They are already canonical. The housekeeper records a hash/cursor so it can detect new project decisions without duplicating them into Engram. It may propose that a reusable idea become an Engram concept, position, or question, but that promotion follows the normal Engram workflow and requires user approval. It never copies the project decision log into the vault.

## Conflict exits

Stop without canonical mutation when:

- confirmation or authority is missing;
- decision key or scope is ambiguous;
- timestamps tie or cannot be compared;
- source or target changed after approval;
- packet was already applied with different content;
- privacy/visibility does not match the target;
- required five-field content is incomplete;
- the proposed agent directive conflicts with newer live project direction.

Otherwise latest confirmed wins automatically; this normal supersession is recorded, not surfaced as a blocking conflict.

## Legacy migration

Do not rewrite or fully backfill large legacy decision logs. Create a one-time human-reviewed index of only currently active legacy decisions. Any incoming keyed decision that may overlap an unkeyed legacy entry exits to review. New bridge entries use the v1 packet and ledger from that point forward.
