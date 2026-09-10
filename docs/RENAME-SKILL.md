# Renaming a skill

**Proposed 2026-09-09 · against v1.1.0 · not started**

An open item, written up so it can be picked up cold. Nothing in the app
implements any of this yet. If a Rename button exists by the time you read
this, trust the code and delete or rewrite this file.

## What it is

A **Rename** action in the button row on each skill card, alongside View,
Folder and Remove. It renames the skill's folder, moves its `skillOverrides`
entry to the new name, and fixes the `name:` line in its own frontmatter.

Renaming is mechanically the same shape as Remove, which already renames a
folder and then cleans up the settings entry behind it. The identity of a skill
is its directory name: `lib/skills.js` keys every override lookup on it. So the
rename itself is two moves and a state rebuild, and is not the hard part.

## Why it needs more than a folder rename

Skills refer to each other by name, and a rename breaks those references
silently. In this user's own global skills folder, `ask-matt` names `/handoff`
six times, including a paragraph contrasting it with `/compact`. `wayfinder`
names five other skills. Around twenty files mention a skill other than
themselves.

The alternative to building this is not that nobody renames. It is renaming in
the file manager, which warns about nothing and additionally strands the
`skillOverrides` entry under the old name. The app already detects those as
orphans and offers to clean them up, which is evidence it happens.

So the feature worth building is not "rename a folder". It is **rename, and
account for what points at this skill.**

## Why it cannot be a find and replace

Measured across the global skills folder on 2026-09-09, counting mentions of
each name outside its own folder:

| name | bare word | `/name` |
|---|---|---|
| triage | 49 | 7 |
| research | 20 | 3 |
| prototype | 16 | 4 |
| implement | 13 | 8 |
| cost | 11 | 0 |
| handoff | 9 | 6 |

Most of the 49 `triage` hits are the English verb. All 11 `cost` hits are the
noun. Replacing every occurrence of the word would corrupt a dozen skills to
fix one reference. Many skill names here are ordinary English words, so this is
the normal case rather than an edge one.

## The design

Discovery classifies each hit by the **shape** of the reference, not by the
word, and the shape decides whether it is offered pre-checked.

**Certain, checked by default:**

- `/oldname` with a word boundary, the actual invocation form
- `skills/oldname/` path references
- the `name:` line in the renamed skill's own frontmatter

**Uncertain, listed with its line of context, never checked by default:** bare
word mentions. "The handoff skill" is a real reference and "a clean handoff
between sessions" is not, and only the user can tell them apart at a glance.

That makes the safe case one click and turns the risky case into a review list
rather than a silent rewrite. The confirmation dialog is worth showing even
when the user then cancels, because it answers "what would this break" before
anything moves.

## Constraints it has to respect

- **Backups.** Rewriting another skill's `SKILL.md` is a new capability for
  this app, and it inherits the discipline `settings.json` already has: copy to
  `~/.claude/backups/` first, then write atomically through a temp file and a
  rename. The `backup` helper in `lib/settings.js` takes any path and slugs it,
  so it reuses directly.
- **Frontmatter edits are surgical.** Replace the single `name:` line. Do not
  re-serialize the file, which would rewrite the user's formatting. A skill
  with no `name:` in its frontmatter is left alone rather than having one
  inserted.
- **Refuse collisions** with an existing skill in the same scope, and validate
  through the existing `safeSkillName` guard. A collision with a `/command`
  name is a warning rather than a refusal, since the app already computes those.
- **Scope of the scan:** both skill scopes plus `~/.claude/commands`, because a
  command file can invoke a skill. Report `CLAUDE.md` matches so the user knows
  they exist, but never offer to edit them: those are shared repository files,
  and the app has an invariant about not dirtying them.
- **Undo** stays coherent. The inverse of "rename plus rewrite these files" is
  the same operation with the arguments swapped, so it fits the existing
  client-side history rather than needing a new mechanism.

## Decided against

**Auto-rewriting every mention.** Editing someone's skill prose to patch a
string is the kind of helpful that goes wrong quietly, and the table above says
how often it would.

## Open

- Whether the reference scan is worth shipping on its own first, as a "What
  references this?" button with no rename at all. It carries most of the value
  and adds no write path.
- Whether project-scope skills get the same button in the first version, or
  whether it starts global-only.
