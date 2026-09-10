# Handoff: what happened last, and what to do next

Written to be picked up cold, and **deliberately short**. Last updated 2026-09-10, by the handoff
method in **full** mode, at the end of the session that shipped 1.1.2.

## 0. Start here. **1.1.2 is published. The round is closed, and the next thing needs the user's hands**

| | |
| :--- | :--- |
| **START HERE NEXT** | **OI-2, prove the installer.** It is the biggest untested thing in the repository, and it is now cheap to test: four versions are published, so a global install can be sent back a version and forward again through the app's own version history. It needs a real `npm i -g`, so **ask, do not start** |
| **WHAT THE USER SAID ABOUT THE WORK** | On the maximize, before it landed: *"It really should be the real maximized window. Like, not like a fake version."* Watching the first fix: *"you could see the actual, like, power shell window in front of it."* After the second: *"it does work, um, you know, with slight caveats, but I think it's acceptable."* On the package: *"we wanna keep it super lean."* Everything in section 2 has been seen and accepted except this handoff itself |
| **WHAT THIS SESSION DID, IN ONE LINE EACH** | Section 2 |
| **STILL OWED** | Nine items, all in [OPEN-ITEMS.md](OPEN-ITEMS.md). OI-2 and OI-3 need the user, OI-7 needs a rebuilt demo home, the rest a session |

## 1. The tree

| | |
| :--- | :--- |
| Branch | `main`. `git log --oneline -5` is the truth about commits, never an id written here |
| Working tree | **Clean and pushed**, including this handoff. `git status` is the truth |
| Version | **1.1.2**, and `package.json` is the truth. npm agrees: `npm view claude-skills-manager version` |
| Tags and releases | `v1.1.1` and `v1.1.2`, each with a GitHub release whose notes the app reads |
| Build | **There is no build step.** `node --check` passes on all eight files this round touched: `server.js`, `lib/platform.js`, `lib/prefs.js`, `lib/updates.js`, `lib/fork.js`, `public/app.js`, `tools/make-icon.js`, `bin/claude-skills-manager.js` |
| Checks run | The app started headless and read real state: **version 1.1.2, 47 skills, launch mode `app`, browser detected as Google Chrome**, and `/icon.ico` served at 47,960 bytes. A skill was set to Off and back, two backups appeared in `~/.claude/backups/`, and `settings.json` was byte identical afterwards. The maximize, the launch modes, the shape restore and the Settings order were each driven and measured |
| Checks not run | **Anything on macOS or Linux.** The installer, OI-2. The `.ico` change was proved against the Win32 loader on Windows only |
| Line counts | `CLAUDE.md` **196**, `HANDOFF-HISTORY.md` 487 across two blocks |
| `CLAUDE.md` | **201 lines before this handoff, 196 after.** In: `lib/prefs.js` in the file list, because the round added it. Out: five lines of pointer prose cut to three, the theme reasoning moved to [DECISIONS.md](DECISIONS.md), and one invariant tightened. **The profile's baseline moves 195 to 196**, and the extra line is the new module |

## 2. What this session did

- **Found and fixed the true maximize**, which was the previous session's unfinished business. A
  process spawned `detached` on Windows gets no console, and PowerShell exits 0 without running a
  line when it has none. [LAUNCH-AND-WINDOW.md](LAUNCH-AND-WINDOW.md) section 4.
- **Then fixed the console window the first fix put on screen**, and moved the helper's start to
  launch time, which took the maximize from 1.9 seconds after the window appears to 0.4.
- **Shrank the icon from 372kB to 48kB** by storing the two large `.ico` entries as PNG, at the
  user's request for a leaner package. [LAUNCH-AND-WINDOW.md](LAUNCH-AND-WINDOW.md) section 2.
- **Put Updates at the top of Settings**, with Appearance below it, then How it opens.
- **Brought the README up to date**: How it opens, Light or dark, and the two ways of installing
  back next to each other after this session first split them.
- **Released 1.1.1 and then 1.1.2**, the second documentation only. Both on npm, both with a GitHub
  release.
- **Investigated a Restart button for the page Quit leaves behind and built none of it**, on the
  user's instruction. [QUIT-AND-RESTART.md](QUIT-AND-RESTART.md), and OI-10.
- **Filed OI-11**, found while looking for a safe way to check a UI change against the running app.

## 3. The queue

1. **OI-2, prove the installer.** The next thing. Needs a real global install, so it needs the user.
2. **OI-7, the screenshots.** Both are from 1 August and predate the Settings dialog entirely.
   Regenerating them means rebuilding the throwaway demo home first, because the real one shows a
   username and a personal skill list.
3. **OI-3, macOS and Linux.** Every platform path this round added other than the Windows one is
   written and unrun.
4. **OI-11, the shape a second page overwrites.** A session can do it. The fix needs a way to tell
   the window the app opened from any other, and the honest signal is probably a marker in the URL.
5. **OI-10, the restart button**, once the user decides which of the two routes they want.
6. **OI-4, build the rename**, still fully designed and unstarted.

## 4. Waiting on the user

- **OI-2 and OI-3 both need their hands.** They deferred Linux once already, so ask rather than assume.
- **OI-10 is a product decision**: whether Quit should mean stopped or gone. Both routes are costed
  in [QUIT-AND-RESTART.md](QUIT-AND-RESTART.md).
- **The two open questions inside [RENAME-SKILL.md](RENAME-SKILL.md)** are still unanswered.

## 5. Before you run anything

- **This app edits the user's real `~/.claude/settings.json`.** Only `lib/settings.js` may write it.
- **A running server does not pick up changes to `lib/`.** Restart it, or test old code by accident.
- **A spawn that returned true has only been accepted, not run.** Measure the effect, not the call.
- **Cut a release tag last.** `npm publish` packs the working tree and never the tag, so a tag cut
  early marks code that was never published. It happened this session and had to be force moved.
- The rest is in [LESSONS.md](LESSONS.md), by grep.

## 6. The state of this machine

- **No server is running.** The last one was stopped deliberately at the end of the verification.
- **`launchMode` is `app` and `windowShape` is a maximized one** in `~/.claude/skills-manager/prefs.json`,
  which is what the user wants. The next launch opens genuinely maximized about 0.4 seconds after the
  window appears.
- **`~/.claude/skills-manager/maximize.dll` is a stray** from the session before this one, 4kB, dated
  01:10 on 2026-09-10. Nothing in the code references it. Left alone, and safe to delete.
- **`~/.claude/backups/` holds nine files.** Two of them are this session's Off and back test.

## 7. What is committed, pushed and released

- **Committed:** YES, everything, including this handoff.
- **Pushed:** YES, to `npd1987/claude-skills-manager` on `main`.
- **Released:** YES. **1.1.2 on npm**, after 1.1.1 earlier the same day, both with GitHub releases.
  npm serves the README from inside the tarball, so the page there is current as of 1.1.2.

## 8. What no check can say

- **Whether any of this works on macOS or Linux.** OI-3.
- **Whether the installer works.** OI-2, and it has never once been observed end to end.
- **Whether the `.ico` renders everywhere Windows draws an icon.** The Win32 loader returns all seven
  sizes here, which covers the shell, but a Start menu tile and a taskbar pin were not inspected by
  eye. The legacy `System.Drawing.Icon.ToBitmap()` cannot read PNG entries at all, and nothing in
  this project uses it.
- **How the launch setting feels to somebody whose default browser is Firefox or Safari.**
- **The full verification table from before the method** is in [HANDOFF-HISTORY.md](HANDOFF-HISTORY.md)
  and every row in it is still accurate.

## 9. Where the detail lives

| What you want | Where it is |
| :--- | :--- |
| **The next thing** | [OPEN-ITEMS.md](OPEN-ITEMS.md), OI-2 |
| How the app opens itself, the icon, the window, the maximize | [LAUNCH-AND-WINDOW.md](LAUNCH-AND-WINDOW.md) |
| Why Quit cannot be undone from its own tab | [QUIT-AND-RESTART.md](QUIT-AND-RESTART.md) |
| The skill rename design | [RENAME-SKILL.md](RENAME-SKILL.md) |
| What is owed | [OPEN-ITEMS.md](OPEN-ITEMS.md) |
| Locked decisions | [DECISIONS.md](DECISIONS.md) |
| Traps | [LESSONS.md](LESSONS.md), by grep |
| How the user works | [WORKING-WITH-THE-USER.md](WORKING-WITH-THE-USER.md) |
| The last states of play | [HANDOFF-HISTORY.md](HANDOFF-HISTORY.md) |
| The handoff procedure and this project's profile | [HANDOFF-METHOD.md](HANDOFF-METHOD.md) |
| Structure, invariants, how to run it | [CLAUDE.md](../CLAUDE.md) |
