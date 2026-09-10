# Lessons: the traps that generalise past the round that found them

**This is where a finding goes once it stops being about the feature it was found in.** It exists so
that [HANDOFF.md](HANDOFF.md) can stay short: a handoff says what happened last session and what is
next, and anything worth carrying forever is moved here instead of being restated every time.

**Add to the top, and say which round found it.** A lesson that turns out to be wrong is corrected in
place with the correction visible, never quietly deleted. **When a new lesson restates one already
here, fold the two.** This file is never pruned and never capped; grep it for one entry rather than
reading it.

---

## `windowsHide` IS A SHOW STATE, NOT A CONSOLE SWITCH, AND `explorer.exe` OBEYS IT. 2026-09-10

`windowsHide: true` reads like "suppress the console window if there is one", so it looks free to
set on every spawn. It is not. Node passes it as the child's **initial show state**, and a GUI
program is free to hand that state to the window it opens. `explorer.exe` does exactly that, so
`reveal()` spawned a real Explorer window that was never shown, returned true, and the user's click
did nothing. Seventeen invisible windows had accumulated before it was reported.

This is the same flag as the console lesson below, seen from its other side: there, `windowsHide`
failed to hide a console it was expected to hide; here, it hid a window nobody meant to hide. **Set
it only on the specific spawn that needs it, never on a shared helper.** `detached()` is shared by
the browser launch, the reveal and the Linux desktop database refresh, and one flag on it broke a
feature two of them do not use.

**Grep for the effect, not the process.** A hidden window is invisible to every ordinary check and
the process list looks correct, because the process really did start. `Shell.Application.Windows()`
lists open Explorer windows with a `Visible` property on each, and that is what proved both the bug
and the fix.

## CUT THE TAG LAST, AND KNOW WHAT EACH PUBLISH ACTUALLY PACKS. 1.1.1

`npm publish` packs the working tree and never a tag, so a tag cut at the version bump marks code
that was never published as soon as anything lands after it. That happened on `v1.1.1` and the tag
had to be force moved, which is a rewrite of something already on GitHub and needs the user's word.
**Bump, finish, then tag, then publish.**

**npm serves the README from inside the tarball**, so a README fix is invisible on npmjs.com until
the next publish, while GitHub shows it the moment it is pushed. A documentation only patch release
is the only way to close that gap, and it offers every user an update with nothing in it, so it is a
choice rather than an obligation. 1.1.2 was exactly that.

## A DETACHED PROCESS ON WINDOWS GETS NO CONSOLE, AND POWERSHELL WILL NOT RUN WITHOUT ONE. 2026-09-10

`spawn(cmd, args, { detached: true })` becomes the `DETACHED_PROCESS` creation flag on Windows, and a
process created that way inherits no console. `powershell.exe` started with none **exits 0 without
running a single line**: no error, no output, a success code. This cost an entire round, because the
helper worked every time it was run by hand and never once when the server spawned it, and the
apparent variable was parentage. It was the spawn options. Proved with the same script spawned five
ways: every `detached: true` variant ran nothing, and both non detached variants ran.

**Spawn a console helper with `{ stdio: 'ignore', windowsHide: true }` and `unref`, not detached.**
`cmd /c powershell ...` detached also works, because cmd tolerates having no console and gives its
child one, but that console is a **visible window** and `windowsHide` will not suppress it: the flag
applies to the process being spawned, not to a console its child allocates later. The user saw it
appear in front of the app. The only invisible route is not detaching in the first place.

## A SPAWN THAT RETURNS TRUE HAS ONLY BEEN ACCEPTED, NOT RUN. 2026-09-10

`lib/platform.js` `detached()` returns true when `spawn` did not throw. The child can then fail,
find nothing, or do nothing at all, and the caller still sees success. A whole afternoon of
"maximizeWindow returned true" was read as "the window was maximized" when nothing had happened.
**A fire and forget helper needs its effect measured, not its launch.**

## MEASURE THE EFFECT, NOT THE CALL, AND MEASURE IT AT THE RIGHT MOMENT. 2026-09-10

Several conclusions this round were wrong because the measurement was taken too early, or because
something else had already overwritten the thing being measured. A live page's heartbeat rewrote the
saved window shape between setting it and launching, which made a working feature look broken.
**Before concluding a feature failed, check that nothing else wrote the state in between.**

## A SYNTHETIC WINDOW CHANGE DOES NOT REACH THE PAGE INSIDE IT. 2026-09-10

Resizing a Chrome window with `SetWindowPos` from outside is seen by the page, but maximizing it with
`WM_SYSCOMMAND` is not: `window.outerWidth` kept reporting the pre-maximize size. **A test that pokes
a window from the operating system is not a test of what the page will observe when a human does it.**
Confirm anything that depends on what the page sees by asking a human to do it by hand.

## CHROME IGNORES WINDOW GEOMETRY FLAGS WHEN IT IS ALREADY RUNNING. 2026-09-10

`--window-size`, `--window-position` and `--start-maximized` are all discarded when a second `chrome`
invocation forwards its command line to an instance that is already running, which is nearly always.
Measured three times with every app window closed first. **The app cannot dictate the shape of the
window it opens.** Chrome also records the placement of an ad-hoc `--app` window and never restores
it, because there is no installed app to attach the record to.

## THE APP EDITS THE USER'S REAL CLAUDE CONFIGURATION. 1.0.0

`~/.claude/settings.json` is not test data. Every write goes through `lib/settings.js`, which copies
the old file into `~/.claude/backups/` and then writes atomically through a temp file and a rename,
and refuses to write at all over a file it could not parse. **Never write that file any other way**,
and after any test that changed a skill's state confirm a backup appeared and the file still parses.

## A RUNNING SERVER DOES NOT PICK UP CHANGES TO `lib/`. 1.1.0

`require` caches, so editing a module and then testing through the open page silently exercises the
old code. This produced a confident "the feature does not work" for several minutes. **Restart the
server after touching anything outside `public/`.** Files under `public/` are read from disk per
request and do not need it.

## PUBLISHING NEEDS A BROWSER, NOT A CODE. 1.0.1

The npm account uses a passkey, so `npm publish` cannot prompt for a six digit OTP. It prints a URL
and waits for a browser approval, which means it must be run by the account holder and cannot be
automated from here.

## UNPUBLISH ORDER MATTERS. 1.0.1

Removing the only published version deletes the package and locks the name for 24 hours. **Always
publish the new version first, then unpublish the old one.**

## `npm view` HIDES EMAILS; THE RAW REGISTRY DOCUMENT DOES NOT. 1.0.1

To see what is genuinely public, fetch `https://registry.npmjs.org/<pkg>` and read it. Checking with
`npm view` alone once produced a false all clear.

## `npm pack` SHIPS THE WORKING TREE, NOT GIT'S NORMALISED COPY. 1.0.1

`.gitattributes` will not save a CRLF shebang. **Check line endings in the packed tarball**, not in
the repository.

## SCREENSHOTS MUST NEVER COME FROM THE REAL `~/.claude`. 1.0.0

The header shows the skills path, which contains a Windows username, and the real skill list is
personal. The published images were captured against a throwaway home with fabricated demo skills.
Regenerating them means rebuilding that demo home first.

## THE BROWSER PANE SCREENSHOT TOOL IS UNRELIABLE WHEN THE PANE IS HIDDEN. 1.1.0

Reading the DOM is more dependable than screenshotting, and a geometry assertion
(`getBoundingClientRect`) beats eyeballing a picture. A pane that is not displayed can also resolve
`88vh` to zero, which makes a correct layout look broken.

## ANIMATED PANELS ARE KEYED TO THE `explainer` CLASS. 1.1.0

The open and close transition lives on `.explainer.open .explainer-panel`, so a new collapsible that
copies only the inner markup will toggle its class and animate nothing. **Reuse the class rather than
the structure.**

## ESCAPING WINDOWS PATHS THROUGH THE SHELL INTO `node -e` IS NOT WORTH IT. 1.0.1

An inline install kind test came back all wrong purely from backslash mangling and briefly looked
like a real bug. The same thing happened again on 2026-09-10 with backticks inside a `node -e`
replacement script. **Write the script to a file and run the file.**
