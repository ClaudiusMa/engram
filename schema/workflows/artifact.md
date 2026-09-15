# Turn Document into Artifact

> This routed procedure is extracted from the root contract. Load it only for this route; repository-relative paths are relative to the Engram root.

When the user asks to turn a complete research, analysis, product-decision, review, or other finished document into an artifact, read and follow `schema/skills/turn-doc-into-artifact/SKILL.md` completely. The skill is the source of truth for the build sequence, two-view contract, user-tone rules, restrained visual language, and validation gates.

The skill builds a faithful, complete **Agent** view first, then a default **Human** view whose sections follow the source's real jobs and sequence. It never forces the story into a fixed number of beats. Use its **humanize mode** for an existing artifact with a discoverable authoritative source; preserve the Agent view and replace only the Human-owned surface and shared switch.

New work lives directly at `artifact/<name>/`. Keep it there after validation. Complexity can motivate a later user-requested move to ProductLab; it never enables migration or ownership checks on its own. Digesting a source does not invoke this artifact skill.

The skill lives inside Engram so every agent entering through this `AGENTS.md` router uses the same instructions. Do not install or fork product-specific copies. The retired 2–3-beat Humanizer remains only at `schema/workflows/archive/artifact-humanize-v1.js` as history and must not receive new work.
