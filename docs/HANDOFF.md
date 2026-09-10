# Handoff: what happened last, and what to do next

Written to be picked up cold, and **deliberately short**. Last updated 2026-09-10, by the handoff
method in **full** mode, at the end of the session that found and fixed the reveal regression and
cut 1.1.3.

## 0. Start here. **1.1.3 is tagged and released on GitHub. It is NOT on npm yet**

| | |
| :--- | :--- |
| **START HERE NEXT** | **OI-12, publish 1.1.3 to npm.** The fix is committed, pushed, tagged and on GitHub, and until the account holder runs `npm publish` the two versions the world can install still have a broken *Folder* button. It cannot be automated from here: the npm account uses a passkey, so it prints a URL and waits for a browser approval. **The commands are in OI-12.** Ask the user; do not attempt it |
| **THEN** | **OI-2, prove the installer.** That was the previous session's next thing and it still is. It needs a real `npm i -g`, so ask rather than start |
| **WHAT THE USER SAID ABOUT THE WORK** | Reporting it: *"if you click folder, nothing happens. Um, I I I think something used to happen there. I think it opened the folder. Right?"* They were right, and it was a regression this project shipped in 1.1.1. They then asked for the orphaned windows closed and the lesson written down |
| **WHAT THIS SESSION DID, IN ONE LINE EACH** | Section 2 |
| **STILL OWED** | Ten items, all in [OPEN-ITEMS.md](OPEN-ITEMS.md). OI-12 is the live one and is the user's |

## 1. The tree

| | |
| :--- | :--- |
| Branch | `main`. `git log --oneline -5` is the truth about commits, never an id written here |
| Working tree | **Clean and pushed**, including this handoff. `git status` is the truth |
| Version | **1.1.3**, and `package.json` is the truth. **npm still says 1.1.2**, and will until OI-12 is done: `npm view claude-skills-manager version` |
| Tags and releases | `v1.1.1`, `v1.1.2`, `v1.1.3`, each with a GitHub release whose notes the app's *What's new* reads |
| Build | **There is no build step.** `node --check` passes on the one file this round touched, `lib/platform.js` |
| Checks run | The app started headless and read real state: **version 1.1.3, 47 skills, browser detected as Google Chrome, all three launch modes available**. `POST /api/reveal` opened a **visible** Explorer window, which is the whole point of the round. A skill was set to Off and back: two backups appeared in `~/.claude/backups/`, 14 to 16, and `settings.json` was byte identical afterwards, 3,576 bytes and the same sha256 prefix `df3e8d2a700b78dd` before and after |
| Checks not run | **Anything on macOS or Linux**, OI-3. The installer, OI-2. **The fix was never driven from the real page by hand**, only through the API the button calls; the user is the one who can do that |
| Line counts | `CLAUDE.md` **196**, unchanged. `HANDOFF-HISTORY.md` 616 across **three** blocks, which is the window, so no prune was owed |
| `CLAUDE.md` | **Untouched, 196 before and 196 after.** Nothing this round changed how the project is built, run or laid out, and nothing in it was disproved. No trade was needed |

## 2. What this session did

- **Found the cause of a reported regression: `windowsHide` is a show state, not a console switch.**
  The previous round added it to `detached()` in `lib/platform.js` beside a comment saying it has no
  effect on a GUI program. `explorer.exe` obeys it, so every reveal in the app opened a real Explorer
  window and never showed it. [LAUNCH-AND-WINDOW.md](LAUNCH-AND-WINDOW.md) section 6.
- **Fixed it** by taking the flag back off `detached()`, which restores exactly what every caller
  there did before 1.1.1. `hidden()` keeps it, so the maximize helper is untouched.
- **Closed 17 orphaned invisible Explorer windows** the bug had accumulated on this machine, at the
  user's instruction, leaving their own three alone.
- **Wrote the lesson**, in [LESSONS.md](LESSONS.md), at the top: the flag's two faces, and the rule
  that it goes on the one spawn that needs it and never on a shared helper.
- **Filed OI-12** and cut **1.1.3**: committed, pushed, tagged and released on GitHub. **Not on npm.**

## 3. The queue

1. **OI-12, publish 1.1.3 to npm.** The next thing, and the only reason the fix is not yet in
   anybody's hands. The user's, and it needs their browser.
2. **OI-2, prove the installer.** Needs a real global install, so it needs the user.
3. **OI-7, the screenshots.** Both are from 1 August and predate the Settings dialog entirely.
   Regenerating them means rebuilding the throwaway demo home first, because the real one shows a
   username and a personal skill list.
4. **OI-3, macOS and Linux.** Every platform path the launch round added other than the Windows one
   is written and unrun, and this round did not change that.
5. **OI-11, the shape a second page overwrites.** A session can do it. The honest signal is probably
   a marker in the URL.
6. **OI-10, the restart button**, once the user decides which of the two routes they want.
7. **OI-4, build the rename**, still fully designed and unstarted.

## 4. Waiting on the user

- **OI-12 is the live one.** Only they can publish, and until they do the fix helps nobody.
- **OI-2 and OI-3 both need their hands.** They deferred Linux once already, so ask rather than assume.
- **OI-10 is a product decision**: whether Quit should mean stopped or gone. Both routes are costed
  in [QUIT-AND-RESTART.md](QUIT-AND-RESTART.md).
- **The two open questions inside [RENAME-SKILL.md](RENAME-SKILL.md)** are still unanswered.

## 5. Before you run anything

- **This app edits the user's real `~/.claude/settings.json`.** Only `lib/settings.js` may write it.
- **A running server does not pick up changes to `lib/`.** Restart it, or test old code by accident.
- **A spawn that returned true has only been accepted, not run.** Measure the effect, not the call.
  This round is the second time that has cost something, and the effect was a window nobody could see.
- **Do not set `windowsHide` on a shared spawn helper.** It is the child's initial show state, and
  `explorer.exe` obeys it. That is what this round fixed.
- **Cut a release tag last.** `npm publish` packs the working tree and never the tag.
- The rest is in [LESSONS.md](LESSONS.md), by grep.

## 6. The state of this machine

- **No server is running.** The last one was stopped deliberately at the end of the verification.
- **`launchMode` is now `tab`**, not `app` as the previous handoff recorded, and `windowShape` is a
  maximized one. Measured this session in `~/.claude/skills-manager/prefs.json`. Nothing this round
  touched it, so the user changed it at some point after the last handoff.
- **`prefs.json` has a stale `latest: "1.1.0"`** from an old update check, and its `versions` list now
  records 1.1.3 because this session's headless runs launched that version. Harmless.
- **`~/.claude/skills-manager/maximize.dll` is still a stray**, 4kB, dated 01:10 on 2026-09-10.
  Nothing in the code references it. Left alone, and safe to delete.
- **`~/.claude/backups/` holds sixteen files.** Two of them are this session's Off and back test.
- **No orphaned Explorer windows remain.** All 17 were closed, plus the one window this session's own
  testing opened. `Shell.Application.Windows()` lists only the user's own three.

## 7. What is committed, pushed and released

- **Committed:** YES, everything, including this handoff.
- **Pushed:** YES, to `npd1987/claude-skills-manager` on `main`.
- **Released:** **PARTLY, and this is the thing to read.** `v1.1.3` is tagged and has a GitHub
  release, so the app's *What's new* will show it. **It is not on npm**, so no user can install the
  fix yet. OI-12.

## 8. What no check can say

- **Whether the fixed Folder button works from the real page**, clicked by a hand. It was proved
  through `platform.reveal()` and through `POST /api/reveal` on a running server, which is the exact
  call the button makes, but nobody has clicked the button itself since the fix.
- **Whether any of this works on macOS or Linux.** OI-3. `windowsHide` does nothing off Windows, so
  those two reveal branches were never broken by this bug and are still unrun for every other reason.
- **Whether the installer works.** OI-2, and it has never once been observed end to end.
- **How many people are on 1.1.1 or 1.1.2** and have been accumulating invisible windows. Nobody but
  the user is known to be running either.
- **The full verification table from before the method** is in [HANDOFF-HISTORY.md](HANDOFF-HISTORY.md)
  and every row in it is still accurate.

## 9. Where the detail lives

| What you want | Where it is |
| :--- | :--- |
| **The next thing** | [OPEN-ITEMS.md](OPEN-ITEMS.md), OI-12 |
| How the app opens itself, the icon, the window, the maximize, **and the reveal regression** | [LAUNCH-AND-WINDOW.md](LAUNCH-AND-WINDOW.md), section 6 for this round |
| Why Quit cannot be undone from its own tab | [QUIT-AND-RESTART.md](QUIT-AND-RESTART.md) |
| The skill rename design | [RENAME-SKILL.md](RENAME-SKILL.md) |
| What is owed | [OPEN-ITEMS.md](OPEN-ITEMS.md) |
| Locked decisions | [DECISIONS.md](DECISIONS.md) |
| Traps | [LESSONS.md](LESSONS.md), by grep |
| How the user works | [WORKING-WITH-THE-USER.md](WORKING-WITH-THE-USER.md) |
| The last three states of play | [HANDOFF-HISTORY.md](HANDOFF-HISTORY.md) |
| The handoff procedure and this project's profile | [HANDOFF-METHOD.md](HANDOFF-METHOD.md) |
| Structure, invariants, how to run it | [CLAUDE.md](../CLAUDE.md) |
