# Contributing

Thanks for helping improve InboxFS.

1. Open an issue before starting a large behavioral change.
2. Use a disposable directory for manual testing. Never point a development build at important files.
3. Run `npm run check` before opening a pull request.
4. Add a regression test for any change to move, collision, path, or undo behavior.

Keep new classification rules deterministic and easy to explain in the preview. Features that inspect file contents or call network services must be opt-in and clearly disclosed.
