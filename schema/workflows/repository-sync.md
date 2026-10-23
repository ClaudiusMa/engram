# Repository boundaries and synchronization

This procedure supplements the selected knowledge workflow; it never changes its write permissions, provenance rules, or destinations.

## Determine the mode

Without `.engram/private.json`, this is a public/default installation: knowledge stays local and ignored. Before reporting or committing, verify `git check-ignore wiki/main/index.md` succeeds and `git ls-files wiki` is empty. Inspect the exact staged diff for private content.

With `.engram/private.json`, this is a private daily workspace. Read that configuration. Before synchronization, verify the Git origin matches its `privateRepo` and GitHub reports that repository as PRIVATE. A missing or unverifiable remote blocks upload; never fall back to a public destination. Private knowledge may be tracked here, but secrets and generated machine state remain excluded. Check the staged file list and diff before committing; do not stage unrelated work.

## Daily collaboration

The private checkout is the working source of truth. Fetch before starting; integrate remote changes without overwriting local work. Concurrent writers use separate branches/checkouts and review merges into main. Preserve source originals and the selected workflow's existing gates.

In an explicitly configured private workspace, commit completed task changes at a coherent boundary with only those files staged. A commit is local; it does not authorize a push, synchronization, or publication. Do not run synchronization after a commit or retry it after a failure. Run `node .engram/sync.mjs sync` only when the user explicitly requests synchronization, after verifying the private destination as described above. Feature-branch pushes also require an explicit user request. Do not claim GitHub is current until the requested push succeeds.

Clones do not inherit local hooks. Do not install an automatic synchronization hook. Commits remain local until the user requests synchronization. Existing public installations keep their current commit/publication permissions, but publication still requires an explicit user request.

## Public export

`.engram/public.gitignore` preserves the public path policy, independently of the private `.gitignore`. The export includes only committed, allowed system files and maps that policy to the public `.gitignore`. Private configuration, knowledge, personal incident records, credentials, symlinks, and nested Git repositories are never exported. An already tracked file is still checked against the policy.

The helper copies file contents into a separate public checkout; private commits and history never cross this boundary. When the user explicitly requests synchronization, system changes may open or update a draft PR on the configured dedicated branch. Do not upload or publish these changes without that request. Public main is never pushed or automatically merged. Review remains required before merge. PR titles, descriptions, and commit messages contain only generic descriptions of public system changes.

Any public branch or PR is already publicly readable. Path filtering and content checks must run before pushing that branch; PR review is not a privacy boundary. Automated scans catch common mistakes but do not establish that arbitrary content is safe to publish. Keep personal details out of reusable system files, and inspect new export-policy exceptions before enabling them.

Before a status report, confirm knowledge is excluded from the public candidate export, secret/runtime files are excluded from the private candidate commit, and the actual synchronization outcome is known. Keep detailed migration inventories and private paths in private operational files only.
