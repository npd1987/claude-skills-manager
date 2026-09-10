<!-- handoff-method profile -->
# How this project is handed off

**This project runs the `handoff-method` skill.** When the user says "do the handoff", that skill is
the whole instruction and this file is the profile it reads: the values below fill in the steps that
vary by project. Set up 2026-09-10.

| | |
| :--- | :--- |
| **Git** | Yes, `main`. Remote is [npd1987/claude-skills-manager](https://github.com/npd1987/claude-skills-manager) |
| **Build** | **There is no build step and no bundler.** The closest thing is `node --check <file>` on every JavaScript file the round touched, which is a real check and must pass |
| **Verify** | `node --check` on each changed file, then `SKILLS_NO_OPEN=1 node server.js` and the by-hand list in [CLAUDE.md](../CLAUDE.md) *Testing changes*. **There is no test suite**, so verification is a human running it and the handoff says which parts were actually exercised |
| **Data the checks can reach** | **`~/.claude/settings.json`, the user's real Claude Code configuration.** Also `~/.claude/skills/` and `~/.claude/skills-manager/prefs.json`. Every write to settings.json copies the old file into `~/.claude/backups/` first, so after any test that changed a skill's state, confirm a new backup appeared and that settings.json is still valid JSON |
| **Release** | Publish to npm, tag, then write the GitHub release whose notes the app's *What's new* panel reads. The version lives in `package.json` only. **`npm publish` cannot be automated from here**: the account uses a passkey, so it prints a URL and waits for a browser approval by the account holder |
| **Mockups** | No `mockups/` folder. The user reviews a mockup rendered in the chat before UI changes, built with the app's real palette so it is a true likeness. See [WORKING-WITH-THE-USER.md](WORKING-WITH-THE-USER.md) |
| **CLAUDE.md baseline** | **195 lines on 2026-09-10.** It must not trend upwards; a line in costs a line out |
| **Adopted files** | [RENAME-SKILL.md](RENAME-SKILL.md) and [LAUNCH-AND-WINDOW.md](LAUNCH-AND-WINDOW.md) are feature documents. [WORKING-WITH-THE-USER.md](WORKING-WITH-THE-USER.md) holds what used to be the old handoff's *How the user works* |
| **Project specific steps** | **At 3f, restart the server before testing anything outside `public/`.** `require` caches, so a running server keeps serving the old `lib/`, and the page silently exercises code that is no longer on disk. **At 3f, if the round changed a skill's state, check `~/.claude/backups/` gained a file and that `settings.json` still parses.** **At 3a, re-read the version in `package.json`**, because several documents quote it |
| **Folded from** | The project's own `docs/HANDOFF.md` (2026-08-01 edition) and the *The handoff document* section of `CLAUDE.md`, both on 2026-09-10. The old handoff is preserved verbatim in [HANDOFF-HISTORY.md](HANDOFF-HISTORY.md) under its own heading, with a map of where each part went |
| **Before you run anything** | **This app edits the user's real `~/.claude/settings.json`.** Never write it except through `lib/settings.js`, which backs up and writes atomically. **A running server does not pick up `lib/` changes.** **Never capture a screenshot against the real `~/.claude`**: the header shows a path containing the Windows username and the skill list is personal. The rest is in [LESSONS.md](LESSONS.md), by grep |

## What the old method had that is kept

Every numbered rule from the folded `CLAUDE.md` section survives, and these three are the ones the
generic method does not already say:

- **Version stamp every verification claim.** Say "unverified as of 1.0.1", never "works on macOS".
  Overstating what has been proved is the one failure that matters in this repository, which ships
  to strangers on three operating systems and has only ever been run on one.
- **No line numbers, no code excerpts and no file trees in the handoff documents.** They rot fastest,
  and `CLAUDE.md` already carries the file map.
- **The one minute rule.** If a claim cannot be re-checked against the repository in under a minute,
  leave it out.
