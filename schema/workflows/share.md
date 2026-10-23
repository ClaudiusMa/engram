# Share Workflow

> This routed procedure is extracted from the root contract. Load it only for this route; repository-relative paths are relative to the Engram root.

For "share <page or note> with <person>". The agent prepares a reviewed humanized clip from originals the user explicitly selected, starts the local sharing service, and hands the human one sender URL. The human types the recipient's email and presses **Share knowledge** in the browser. The agent never picks a recipient and never sends anything on its own.

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

## 3. Prepare and serve

```sh
node bin/engram-sharing.mjs prepare --manifest .local/engram-sharing/<share-slug>.json --root wiki/main
node bin/engram-sharing.mjs serve
```

- Run `serve` in the background and keep it running. Links expire exactly seven days after creation, and a stopped service cannot serve or expire them.
- The server binds to `127.0.0.1`. Its link opens only on this computer. A link the recipient can open needs `--public-url <https origin>` pointing at a tunnel or hosted HTTPS front for this service, arranged by the user. Say this before the human invites anyone remote. Relay mode with `--local-setup` is loopback-only and cannot take `--public-url`.
- Tell the user the recipient needs the sharing tool from a published Engram to save the clip; the browser page walks them through it. If the published Engram does not yet include sharing, say so.

## 4. Hand over the sender URL and wait

1. Copy the `Open locally:` URL from the server output into chat, once. It is a credential: do not put it in any file, note, log, or message to anyone else.
2. The human opens it, reviews the clip, types the recipient's email, and presses **Share knowledge**. The agent waits. It does not open the sender page itself, fill the form, or press Share.
3. In the default outbox mode the service writes the invitation to `.local/engram-sharing/outbox/` and sends no email. Tell the user that the page shows the capability link and that they deliver it themselves. Do not read the outbox to find an address and deliver it for them.

## 5. Relay mode only

Use relay only when the user asked for it and this session has an authorized mail connector. Start the service with `serve --delivery relay` (add `--local-setup` for a loopback preview). After the human says they pressed Share:

```sh
node bin/engram-sharing.mjs relay-next --state .local/engram-sharing --wait-ms 45000
```

1. `null` means nothing was pressed yet; run it again only while the human is still at the page. A job is an exclusive claim that authorizes exactly one send attempt.
2. Check `invitation.expiresAt` is in the future. Send through the connector exactly once: to `invitation.email` as entered, with `invitation.subject` and `invitation.body`. Nothing else goes in the email: not the clip, originals, importer paths, or source data.
3. Write an owner-only result file inside `.local/engram-sharing/` with `id`, `claim`, and the provider's accepted message ID, then:

```sh
node bin/engram-sharing.mjs relay-complete --state .local/engram-sharing --receipt .local/engram-sharing/provider-result.json
```

4. A definite provider rejection records `"status": "failed"`; an outcome you cannot determine records `"status": "unknown"`. Both go through `relay-fail` with the same `--state` and `--receipt` flags. Neither releases the claim, and neither is retried. After an interruption, inspect the claim and the connector's own evidence before choosing; a missing receipt proves nothing.
5. Report the recorded status to the user. `sent` means the provider accepted the message, not that it was read.

## Never

- Choose, guess, look up, or prefill a recipient.
- Send an invitation the human did not create by pressing Share, or send one twice.
- Run `relay-next` as a resend, or rerun a send whose result is unknown.
- Put the clip, originals, or local paths in an email, or the sender URL anywhere but this chat.
- Share content the user did not name, or mark a clip reviewed without checking it against the originals.
