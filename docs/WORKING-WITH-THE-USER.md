# How the user works, and what they expect

Carried forward verbatim in substance from the *How the user works* section of the handoff that
predates the method, and extended by what the 2026-09-10 session confirmed. This is not dated
material and it does not change round to round, which is why it has its own file rather than a place
in `CLAUDE.md`, where it would be paid for on every session whether or not it mattered.

- **Mockups before UI changes.** Any visual change gets drawn first, built with the app's real
  stylesheet and palette so it is a true likeness, and approved before implementation. This has
  caught real problems more than once. On 2026-09-10 the mockup of the launch setting was approved
  as drawn and the built version matched it exactly, including the struck-out unavailable option.
  **Show the contextual variants, not just the happy path**: the same mockup showed what a Firefox
  user and an unidentified browser would each see, and that is what settled the design.

- **Thinks out loud, mid-task, and expects it to land.** Requirements arrive while work is in
  progress and often change what has just been built. Fold them in rather than deferring them, and
  say plainly when one contradicts an earlier decision.

- **Plain language over correct jargon.** "Uncommitted changes" and "a clone" both had to be
  rewritten. If a sentence in the interface assumes git, npm or packaging knowledge, it is wrong,
  however accurate it is.

- **Wants the reasoning, not just the answer.** Pushback with evidence is welcomed, and several good
  decisions came from it. **Evidence means a measurement**, not an argument: the reference-count
  table that killed find-and-replace renaming, and the three ignored Chrome flags, both changed the
  design because they were numbers rather than opinions.

- **Prefers fewer, clearer options** over completeness. Two overlapping choices became one choice
  plus a checkbox at their prompting, and it was right. A "show me" preview button for the launch
  modes was offered on 2026-09-10 and declined for the same reason.

- **Cost-sensitive.** The tool is free and should stay free to build and ship.

- **Asks "is this already handled?"** Answer honestly, including when it is not.

- **Will say when something is not good enough, and means it.** On 2026-09-10 a window that filled
  the work area was rejected as "a fake version" of maximizing. Do not offer a near miss as though it
  were the thing, and do not quietly redefine the requirement to match what was achievable.

- **Asks about the state of things they have not touched in a while.** They had forgotten how the
  app gets installed and where its Start Menu entry came from. Answer from the code rather than from
  memory, and say which file the answer is in.
