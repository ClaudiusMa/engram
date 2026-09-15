# Human Skill Workflow

Maintain private, user-owned playbooks for capabilities the human performs. A human skill is not a Codex skill: the human executes the practice; the agent retrieves it, helps the user reflect, and applies only approved changes.

Human skills live at `wiki/main/human-skills/<name>.md`. Their compact routing registry lives at `wiki/main/human-skills/index.md`.

## Route without loading skill context

Apply this gate from the user's message alone. Do not read the human-skill registry or any human-skill page unless at least one condition is true:

1. The user explicitly asks to create, show, use, review, or update one of their human skills.
2. The user asks for help immediately before, during, or after personally performing a repeatable activity, and consulting an existing personal playbook is necessary to fulfill that request.

Topical overlap is not enough. A mention of meetings, critique, writing, presenting, design, or another skilled activity does not trigger this workflow by itself. Questions about past events, general advice, source ingestion, note filing, artifact humanization, and agent `SKILL.md` work stay in their own workflows.

When the gate passes:

1. Read only `wiki/main/human-skills/index.md`. If it is missing, treat **use** and **update** as no match and do not scan the folder. In **create** mode only, seed it from `schema/templates/human-skills-index.template.md` as part of the explicitly approved creation.
2. Choose at most one direct match using both `Applies when` and `Not for`. If there is no direct match, do not scan the folder; continue with the otherwise applicable workflow and tell the user no matching human skill exists.
3. Read only the matched skill. In **use** mode, read `## Intent` and `## Current practice`; read `## Review prompts` only when the user asks to reflect. In **update** mode, read the complete page so the proposed change can be checked against its history and related knowledge.

## Modes

### Create

Create a human skill only when the user explicitly asks for one or explicitly approves creating one after no match is found.

1. Use `schema/templates/human-skill.template.md`.
2. File it at `wiki/main/human-skills/<lowercase-kebab-case>.md`.
3. Write only practices, goals, and judgments the user expressed or explicitly approved. Questions and scaffolding may help the user articulate the skill, but agent-generated advice never becomes the user's playbook without confirmation.
4. Keep the skill specific enough to guide action and broad enough to recur. If two contexts need materially different behavior, create separate skills rather than adding a large conditional tree.
5. Add one compact row to `wiki/main/human-skills/index.md`. `Applies when` describes the human action intent; `Not for` names the closest false-positive route.
6. Add one pointer under `## Human Skills` in `wiki/main/index.md` if it is not already present. Do not list individual skills in the main index.
7. Append `wiki/main/log.md`: `## [YYYY-MM-DD] human-skill | <Title> created`.

Creation and iteration have no draft/publish lifecycle. Once the user approves a create or update diff, write it as the current skill.

### Use

Surface the current playbook for the human to follow.

- Preserve the skill's wording and sequence.
- Tailor the presentation only with facts from the user's current request; label situational suggestions instead of writing them back into the skill.
- Do not edit the skill, its registry row, related pages, or the log.
- Do not surface the iteration record unless the user asks how the skill evolved.

### Update

Update only when the user explicitly asks to record a learning or approves a proposed change. A reflection, meeting note, or completed activity does not authorize an automatic update.

1. Read the complete matched skill and the user-provided learning. Read a linked note or source only when the user identifies it as the evidence for this update.
2. State the proposed change as a small diff: what current guidance changes, what is added or removed, and whether anything is superseded.
3. Ask for explicit approval before writing. Preserve the user's meaning under the same voice-protection rule used for notes and `My take`.
4. Apply an approved learning to `## Current practice`; do not merely append it. Remove or revise superseded guidance so the playbook remains current and concise.
5. Add one dated line to `## Iteration record` describing the approved change, with a wikilink to its evidence when one exists. Do not duplicate the old playbook.
6. Update `updated:` and the registry row only if the skill's routing boundary changed.
7. Append `wiki/main/log.md`: `## [YYYY-MM-DD] human-skill | <Title> updated`.

### Retire or split

Retire, merge, or split a skill only with explicit approval. Keep retired pages for provenance and remove them from the routing registry without deleting them.

## Required page contract

A human-skill page contains exactly these `##` sections:

```md
## Intent
## Current practice
## Review prompts
## Iteration record
## Related knowledge
```

Subheadings under `## Current practice` may follow the activity's real sequence. Keep the page concise: current instructions belong in `## Current practice`; historical detail stays in the linked knowledge pages, while `## Iteration record` retains only the change lineage.

The context budget is the compact registry plus one matched skill. Do not traverse `## Related knowledge` during use. During update, read at most the one evidence page the user identified; broader synthesis belongs to the Query Workflow, not this workflow.

## Privacy and verification

- Human-skill pages, their registry, links, and iteration records are private knowledge and remain under ignored `wiki/` paths.
- Never copy a human skill into tracked `schema/`, an agent skill, or a project.
- After a create or update, verify the registry has one row for the page, all wikilinks resolve, the required headings are present, and `git status` does not show the human-skill content as tracked.

After this workflow is explicitly activated, consult the relevant naming, voice, and privacy sections of [shared page rules](page-rules.md) before writing wiki pages.
