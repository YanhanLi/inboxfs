# InboxFS

InboxFS is a local-first file inbox. It scans loose files in a folder, previews clear category destinations, moves only the files you select, and lets you safely undo unchanged moves.

It runs on `127.0.0.1`. File names and contents are not uploaded anywhere.

## Try it

InboxFS requires Node.js 22.5 or newer.

```bash
npx github:YanhanLi/inboxfs ~/Downloads
```

Your browser opens the local InboxFS workspace. Review the suggestions, deselect anything you want to leave alone, and choose **Organize**.

To scan a different inbox:

```bash
npx github:YanhanLi/inboxfs ~/Desktop
```

## What it does

- categorizes documents, images, audio, video, archives, installers, code/data, fonts, and other files;
- scans only loose regular files in the selected root, leaving subfolders and hidden files alone;
- previews every destination before making changes;
- avoids overwriting existing names by adding a numeric suffix;
- detects byte-identical files in the inbox and existing category folders, leaving later copies unselected;
- refreshes the inbox automatically when loose files are added, renamed, or removed;
- preflights complete batches and rolls earlier moves back if a later move fails;
- records a SHA-256 hash for each move and offers per-file undo;
- refuses undo if the organized file changed or the original location became occupied;
- rejects symbolic-link paths that would leave the selected inbox;
- works in desktop and mobile-width browsers without a cloud account.

## What it does not do yet

InboxFS 0.1 uses deterministic file-extension rules. It does not inspect document contents, run OCR, watch folders continuously, or use an AI model. Those features will only be added when they preserve the preview-first and local-first behavior.

Undo history is stored as a private JSON file under `~/.inboxfs/`. Version 0.2 automatically migrates matching v0.1 history to collision-resistant per-directory ledgers. InboxFS is an organizer, not a backup system.

## Development

```bash
git clone https://github.com/YanhanLi/inboxfs.git
cd inboxfs
npm install
npm run check
npm run dev -- /path/to/a/test-folder --no-open
```

`npm run check` builds the Node server and React interface, then runs the filesystem safety tests.

## Safety model

InboxFS binds to the loopback interface and exposes no cloud service. The server rejects non-loopback Host headers and cross-origin mutations. Mutations are serialized, accept IDs from a fresh scan, and re-scan before moving, which prevents concurrent writes and stale previews from silently applying. Destinations are canonicalized before use; symlink escapes, changed undo targets, and occupied restore paths are rejected.

Duplicate detection first groups candidates by file size and only hashes same-size files, avoiding unnecessary reads for unique sizes. A duplicate is held back rather than deleted; the user remains in control.

Please report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
