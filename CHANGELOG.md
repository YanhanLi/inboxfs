# Changelog

## 0.8.1

- Move recent activity and file rows into dedicated lazy modules, giving the main JavaScript budget reliable headroom across zlib implementations used by macOS and Linux CI.

## 0.8.0

- Split rules, file details, activity history, and inbox summary into independently maintained, lazy-loaded interface modules.
- Add explicit loading, failure, retry, and workspace-reload states for configuration requests and asynchronous interface chunks.
- Prevent stale filesystem-event refreshes from overwriting newer organization and undo results.
- Canonicalize the inbox root once at the HTTP boundary so scans, mutations, and history use the same ledger through symbolic-link aliases.
- Add Chromium end-to-end coverage for desktop and mobile layouts, theme persistence, rule validation, file details, organization, history, undo, and chunk recovery.
- Establish automated WCAG 2 AA checks, a 67.12 kB gzip budget for the main JavaScript bundle, and a GitHub Actions quality workflow.
- Expand the safety suite with a symbolic-link inbox identity regression and keep dependency auditing free of known vulnerabilities.

## 0.7.0

- Add a responsive custom-rule editor for creating, updating, and deleting extension rules without hand-editing JSON.
- Expose loopback-only configuration read and write endpoints protected by the existing same-origin boundary and mutation lock.
- Reuse one validation path for direct files and editor submissions, including duplicate extensions and unsafe destinations.
- Normalize and atomically save versioned configuration files with private permissions and temporary-file cleanup.
- Reject symbolic-link configuration writes and preserve the last valid file when validation fails.
- Refresh classifications and destination previews immediately after a successful save.
- Add desktop and mobile dark-mode browser coverage for the editor, validation errors, and saved rule behavior.

## 0.6.0

- Load deterministic custom extension rules from a watched `.inboxfs.json` file in the inbox root.
- Route matching files to validated custom destination folders before applying built-in categories.
- Show custom rule counts, names, patterns, sources, explanations, and destinations in the workspace.
- Reject malformed, oversized, ambiguous, unsafe, or symbolic-link configuration files.
- Include the resolved destination in suggestion IDs so changed rules invalidate stale organization plans.
- Block organization and replace indefinite loading skeletons with a recoverable error state when configuration is invalid.
- Document the versioned rule format and refresh adaptive README screenshots with a custom-rule workflow.

## 0.5.0

- Add structured extension and fallback explanations to every scan suggestion.
- Sort the file review by name, modification time, size, or destination.
- Inspect full source and destination paths, timestamps, classification rules, and duplicate hashes in an accessible side panel.
- Include or exclude a file directly from its inspection panel.
- Summarize the active organization plan by file count, total size, destination count, and held-back duplicates.
- Close stale inspectors when watched files disappear and preserve keyboard focus and Escape behavior with a native dialog.

## 0.4.0

- Add complete light and dark themes with a compact header switch.
- Start from the saved theme or operating-system preference without a light-mode flash.
- Persist theme changes locally, including across an immediate refresh.
- Move component colors onto semantic tokens with independently tuned dark-mode contrast.
- Remove redundant destination text from ordinary file rows.
- Add adaptive light and dark workspace screenshots to the repository README.

## 0.3.1

- Reserve green for selection, success, and the primary organize action.
- Use neutral destination labels to reduce visual noise in the file table.
- Keep the duplicate metric neutral at zero and introduce amber only when duplicates are present.

## 0.3.0

- Redesign the React workspace around a denser file-operations layout.
- Turn the desktop sidebar into useful category filters with live counts.
- Add clear scan status, selection metrics, destination details, and initial-load skeletons.
- Improve mobile and landscape layouts without introducing horizontal scrolling.
- Add keyboard navigation, visible focus states, accessible labels, status announcements, and reduced-motion support.
- Standardize interactive controls on 44-pixel targets and document the interface with a real browser screenshot.

## 0.2.0

- Detect byte-identical files in the inbox and existing category folders.
- Leave detected duplicates unselected and expose a dedicated duplicate filter.
- Refresh the interface from local filesystem events without resetting manual selections.
- Serialize mutation requests and roll back partial batches after a move or ledger failure.
- Replace collision-prone v0.1 ledger names with hashed per-directory identifiers and filtered migration.
- Reject non-loopback Host headers and cross-origin mutations.
- Expand coverage to transaction, duplicate, migration, locking, and HTTP boundary behavior.

## 0.1.0

- Initial local file scan, category preview, selective organization, collision handling, and verified undo.
