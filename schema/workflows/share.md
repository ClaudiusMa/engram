# Share Workflow

> This routed procedure is extracted from the root contract. Load it only for this route; repository-relative paths are relative to the Engram root.

For "share <page or note> with <person>". The agent prepares a reviewed humanized clip from originals the user explicitly selected and writes **one self-contained HTML file** that carries the clip, the originals, and the save instructions. The human sends that file however they like. The agent never picks a recipient and never sends anything on its own.

**Precondition.** This route needs `bin/engram-sharing.mjs` and `bin/sharing/` in this checkout (`node bin/engram-sharing.mjs --help` prints its usage). If they are absent, tell the user the sharing tool is not installed here and stop; do not fetch, copy, or write it. Everything this workflow creates lives under the ignored `.local/engram-sharing/` directory: manifest, prepared package, service state, outbox, relay records. Nothing from it enters `wiki/`, `artifact/`, a commit, or the public export.

## 1. Select originals

1. Resolve what the user named to files, and nothing more:
   - a source page → the original(s) its `file:` frontmatter points to under `wiki/main/raw/`;
   - a note → the note file itself under `wiki/main/notes/`;
   - a file named directly in `wiki/main/raw/` → that file.
2. Do not add related pages, linked originals, takes, or any other vault content the user did not name. One share holds 1–20 originals in the tool's supported types; the tool enforces size limits.
3. State the file list back in one message and get a yes before continuing.

## 2. Write the manifest with verified attribution

1. Read every selected original in full.
2. Write the manifest at `.local/engram-sharing/<share-slug>.json` (`version: 1`). Use `--root wiki/main` and paths relative to it (`raw/<file>`, `notes/<file>`).
3. `preview` is the complete humanized clip: prose that preserves the meaning of the originals, in plain words, long enough to stand alone. It adds no reasoning, caveats, or interpretation the originals do not contain. A source page's `My take` is not part of the clip unless the user says so.
4. Attribution fields follow the evidence rule in the root contract. `sender` is the name the user confirms for themself in this session. `author` and `source` come only from what the originals state; omit them when unsupported. `senderThoughts` holds only words the user typed for this share; never derive them from a take or a prior agent draft.
5. Check the clip and each attribution field against the originals. Only then set `previewReviewed: true`.
6. Show the user the clip, the attribution fields, and the file list. Continue only on their yes; apply their edits literally.

## ## 3. Export the file

```sh
node bin/engram-sharing.mjs prepare --manifest .local/engram-sharing/<share-slug>.json --root wiki/main
node bin/engram-sharing.mjs export
```

- `export` writes `.local/engram-sharing/export/<title>.html` (owner-only). Pass `--out <path>` only to a location the user named. The file embeds the reviewed package: the recipient's page offers **Save package**, which writes `engram-selection.json`, and the instruction their agent receives uses `import --package`.
- Tell the user the path once, offer to reveal it in Finder, and stop. Sending is theirs: attachment, message, AirDrop. Do not email, upload, or post the file.
- There is no link, server, expiry, or revocation: once sent, the recipient has it. Say so if the user asks whether it can be withdrawn.
- The recipient needs the sharing tool from a published Engram to save the clip; the page walks them through setup. If the published Engram does not yet include sharing, say so.

## Archived: links, local server, relay

The earlier path, `serve` with a capability link (optionally behind an HTTPS tunnel with `--public-url`) and the connected-agent mail relay, remains in the tool but is not the default. It needs this computer awake and the service running for seven days, and quick tunnels change address on restart. Use it only when the user asks for a link rather than a file, and then follow `bin/sharing/README.md`: hand over the sender URL once, let the human press Share, and in relay mode claim one invitation, send once, record one receipt.

Never

- Choose, guess, look up, or prefill a recipient.
- Send an invitation the human did not create by pressing Share, or send one twice.
- Send, upload, or post the exported file yourself; the human sends it.
- Run `relay-next` as a resend, or rerun a send whose result is unknown.
- Put the clip, originals, or local paths in an email, or a sender URL anywhere but this chat.
- Share content the user did not name, or mark a clip reviewed without checking it against the originals.
