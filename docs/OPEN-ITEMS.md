# Open items: things owed, across sessions

**This is the durable list of things that are open and not finished.** It is not rewritten, it is not
pruned, and nothing is ever deleted from it: an item moves from Open to Closed with the date and the
answer. It exists so that an item survives any number of handoffs, because [HANDOFF.md](HANDOFF.md)
is rewritten every session by design and anything living only there survives on each session choosing
to copy it forward.

**Rules for this file.**

- **An item is added the moment it is owed**, not at handoff time.
- **Every item says who can close it.** Most of them are the user's.
- **Closing means moving it to the Closed section with the date and the answer**, never deleting it.
- **[HANDOFF.md](HANDOFF.md) links here rather than restating an item.**
- **Never pruned.**

---

## Open

### OI-12. 1.1.1 and 1.1.2 both ship a broken Folder button

**Opened 2026-09-10, closable by the user, by publishing 1.1.3 to npm.** Every reveal in the app is
dead in the two currently published versions: *Folder* on a skill card, the *Open* links in Settings,
and *Open folder* in the fork flow. It is worse than inert, because each click opens an Explorer
window that is never shown, so a user who clicks it a few times accumulates invisible windows they
cannot see or close. The cause and the fix are in [LAUNCH-AND-WINDOW.md](LAUNCH-AND-WINDOW.md)
section 6. **The fix is committed, pushed, tagged `v1.1.3` and released on GitHub; it is not on npm
until the account holder publishes**, which cannot be automated from here because the account uses a
passkey and waits for a browser approval. Until then, anyone on 1.1.1 or 1.1.2 has the bug. Nobody
but the user is known to be running either version.

**The commands, run from the repository root on a clean tree, in this order:**

```
git status
npm publish
npm view claude-skills-manager version
```

`git status` first because **`npm publish` packs the working tree, not the tag**: anything
uncommitted goes into the package and anything committed after `v1.1.3` makes the tag a lie. The
tree was clean and matched the tag when it was cut. `npm publish` prints a URL and waits for the
browser approval. The third command is the check that it landed, and it should say `1.1.3`.

**Then close this item** by moving it to Closed with the date and what the registry served.

### OI-2. Prove the installer, which is now possible

**Opened 1.1.0, closable by the user.** The detached child in `lib/apply-update.js` waits for the app
to exit, runs npm, and writes a result file. Every part is written and none has been observed end to
end. It is the biggest untested thing in the repository. **Updated 2026-09-10**: there are now four
published versions, so the test is cheaper than it was. Install the current one globally with
`npm i -g claude-skills-manager`, open Settings, and use the version history to go back to 1.1.1,
which exercises the detached installer with a number that exists and a change small enough to see.
Coming forward again is the same operation. **Measure the version in the window afterwards, not the
button**, and the app writes its own report of how npm went, which is the thing to read.

### OI-3. macOS and Linux have never run this

**Opened 1.0.0, closable by the user.** The single biggest platform gap. If something breaks on macOS
it will be in the `.app` bundle, the `osascript` folder picker or the `open -R` reveal. Linux needs a
WSL distro (about 500 MB) or a container; macOS needs real hardware. **The user deferred this once
already, so ask rather than assume.** Since 2026-09-10 this also covers the browser detection and the
window maximize helper, whose macOS and Linux paths are written and unrun.

### OI-4. Renaming a skill is designed and unbuilt

**Opened 2026-09-09, closable by the user.** The design, the measured evidence for why it needs a
reference scan rather than a find and replace, and its own two open questions are in
[RENAME-SKILL.md](RENAME-SKILL.md). Nothing is implemented.

### OI-5. The setup dialog says "around 2,000 lines"

**Opened 1.1.0, closable by a session.** It was already out of date before this round and is further
out now. Cosmetic, but it is the kind of claim that quietly stops being true.

### OI-6. No issue template

**Opened 1.1.0, closable by a session.** Bug reports need the operating system, the Node version and
the install method (`npx`, `npm i -g`, or a clone), because those three decide which code path ran.

### OI-7. The screenshots predate the Settings dialog

**Opened 1.1.0, closable by a session.** `docs/screenshot-*.png` show a sidebar that no longer
matches the app, and they now also predate the launch setting and the new icon. Regenerable, at the
cost described in [LESSONS.md](LESSONS.md) under the screenshots entry: a throwaway home with
fabricated demo skills has to be rebuilt first.

### OI-8. npm account email is a Gmail plus-alias

**Opened 1.1.0, closable by the user.** The address uses `+npm`. Stripping the suffix gives the real
address, so it filters mail but conceals nothing. The user was told and left it. Changing it properly
means another publish-then-unpublish cycle.

### OI-10. Quit cannot be undone from the tab it leaves behind

**Opened 2026-09-10, closable by the user.** Quit stops the server, and the page it leaves says the
app has stopped and the tab can be closed. The user's point is that the value of a Quit button is
stopping the app **without** losing the window, so that page should be able to start it again, and
the button should still work an hour later rather than for a few seconds while the process dies.
Investigated and written up in [QUIT-AND-RESTART.md](QUIT-AND-RESTART.md): a page cannot start a
program, so it comes down to either keeping a stopped process alive, which is cheap and makes Quit a
lie, or registering a `claude-skills://` scheme with the operating system, which is honest and is a
per platform job with a one-time ticket to get back into the same tab. **Nothing was built, by the
user's instruction**, and the cheap experiment that would settle the second route is named at the end
of that document.

Also measured while looking: **closing the window does not stop the server immediately**, it takes
between 8 and 23 seconds, so a relaunch inside about 20 seconds reaches the old one. Nobody has said
that is a problem, but it is not what the interface implies.

### OI-11. Any second page overwrites the app window's saved shape

**Opened 2026-09-10, closable by a session.** `reportShape()` in `public/app.js` is gated on
`ownsWindow()`, which is true whenever the launch setting is *An app window*, whatever kind of window
**this** page happens to be in. The browser reports an app window as an ordinary one and there is no
property that tells them apart, which is why it was written that way. The consequence: open the app a
second time in a tab, or load its address in any other window while the setting is *An app window*,
and that page's own size is saved as the window shape on its heartbeat and again on its way out. The
next launch then opens the real window at the size of a tab. The same page will also ask for a
maximize it has no business asking for.

Found on 2026-09-10 while looking for a way to check a Settings change against the running app, and
the reason that check was not done that way. Nobody has hit it in normal use, because normal use is
one window. A fix has to distinguish the window the app opened from any other, and the honest signal
is probably a marker the launcher puts in the URL rather than anything measured from the window.

---

## Closed

### OI-9. This round's work is uncommitted and unreleased

**Opened 2026-09-10. Closed 2026-09-10 by the user.** Committed to `main`, pushed to
`npd1987/claude-skills-manager`, tagged `v1.1.1`, and **published to npm by the user at 06:15**.
Verified by downloading what the registry serves: 1.1.1, 29 files, 381kB unpacked, carrying the 48kB
icon and no documents. `npx claude-skills-manager@latest` and `npm i -g claude-skills-manager@latest`
both give this round's work from now on, and anyone on 1.1.0 who allowed the update check is offered
it within a day.

**1.1.2 followed the same day**, documentation only: the README had the two ways of installing split
apart, and npm serves the README from inside the tarball, so the page there only catches up on a
publish. Tag and GitHub release cut after the fix this time, not before.

**The tag had to be moved after the fact.** It was cut at the version bump and two commits landed
after it, so it pointed at code that was never published. `npm publish` packs the working tree and
never the tag, so the package was right and only the marker was wrong. **Cut the tag last, or move
it before publishing.**

### OI-1. The app window does not open truly maximized

**Opened 2026-09-10. Closed 2026-09-10 by a session.** The cause was the spawn options, not the
launcher, not Chrome, and not the parentage of the helper: `detached: true` gives a Windows process
no console, and `powershell.exe` exits 0 without running a line when it has none. The helper is now
spawned by `hidden()` in `lib/platform.js`, which does not detach and hides the console, and it is
started by `openApp()` as the browser is opened rather than waited for from the page. Measured
through a real launch: the window is genuinely maximized, 1936x1096 at (-8,-8) with `IsZoomed` true,
0.4 seconds after it appears, with no console window at any point. A window whose saved shape is not
maximized is untouched. The full account is in [LAUNCH-AND-WINDOW.md](LAUNCH-AND-WINDOW.md) section 4,
and the part that generalises is in [LESSONS.md](LESSONS.md). **Windows only**: the macOS and Linux
branches of the same helper remain unrun, which is OI-3.

