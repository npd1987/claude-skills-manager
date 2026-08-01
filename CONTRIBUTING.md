# Contributing

Bug reports and pull requests are welcome.

## Running it

```bash
git clone https://github.com/npd1987/claude-skills-manager.git
cd claude-skills-manager
node server.js
```

Node 18 or newer. There is nothing to install. See below.

## The one rule

**No dependencies.** The app uses only Node's standard library, and that is a
feature rather than an oversight: it means the published package *is* the
source, so anyone can fork it with a plain file copy and no toolchain. A pull
request that adds a runtime dependency will be asked to solve the problem
another way, however small the package.

Development-only tooling is a different conversation, but the bar is still high.

## Before opening a pull request

[CLAUDE.md](CLAUDE.md) lists the invariants worth knowing: how settings are
written, why paths are compared the way they are, where OS-specific code
belongs. It is written for Claude Code but it is the best short description of
the codebase for anyone.

There is no test suite. The manual pass at the end of CLAUDE.md is what to run.
Please say in the pull request which platforms you actually tried it on;
Windows, macOS and Linux each have their own code paths for opening a browser,
revealing a folder, and installing a shortcut.

## Reporting a bug

Include your OS, your Node version (`node --version`), and how you installed it
(`npx`, `npm i -g`, or a clone). Those three decide which code path you were on.

## Changing it just for yourself

You do not need to contribute anything back. **Modify this app → Set it up**
inside the app gives you your own copy to change however you like, and you can
point your shortcut at it instead of this one.
