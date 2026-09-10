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

### OI-2. Prove the installer, which is now possible

**Opened 1.1.0, closable by the user.** The detached child in `lib/apply-update.js` waits for the app
to exit, runs npm, and writes a result file. Every part is written and none has been observed end to
end. It is the biggest untested thing in the repository. It became testable when 1.1.0 shipped:
install 1.1.0 globally with `npm i -g claude-skills-manager`, open Settings, and use the version
history to go back to 1.0.1, which exercises the same detached installer path with a number that
exists. Going back to 1.1.0 afterwards is the same operation again.

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

### OI-9. This round's work is on GitHub and not released

**Opened 2026-09-10, narrowed 2026-09-10, closable by the user.** The 2026-09-10 work is now two
commits on `main` and pushed to `npd1987/claude-skills-manager`: the launch mode setting, the icon
wiring, the Settings header, the window shape memory, the maximize, and this document set. **What is
left is the release.** npm still has 1.1.0, so anybody installing normally gets none of this, and the
version in `package.json` is still 1.1.0 with no unreleased number. Publishing has to be done by the
account holder in person, because the npm account uses a passkey and `npm publish` waits on a browser
approval. See [LESSONS.md](LESSONS.md).

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

---

## Closed

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

