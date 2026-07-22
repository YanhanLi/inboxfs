# Changelog

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
