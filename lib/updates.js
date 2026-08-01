'use strict';

// Finding out whether a newer version has been published, and saying what to do
// about it.
//
// This is the only place in the app that talks to the internet, and it does so
// only after the user has said yes. One GET to the npm registry, no auth, no
// body, and nothing about this machine or its skills goes with it. The reply is
// treated strictly as data: a version string, checked against a pattern before
// it is stored, and never allowed to name a command or a path. Every command
// this module hands out is written here in the source.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { APP_DIR, DATA_DIR, PREFS_FILE } = require('./paths');
const { PACKAGE_NAME, VERSION, REPO_URL, installKind } = require('./app-info');
const { hasCommand } = require('./platform');

const TIMEOUT_MS = 3000;

// Release notes come from GitHub because npm does not carry them: the registry
// knows version numbers and nothing about what changed between them.
const GITHUB_API = 'https://api.github.com';

// Long enough for a real set of notes, short enough that a huge release body
// cannot fill the dialog or the prefs file.
const NOTES_LIMIT = 4000;
const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;

// What a published version is allowed to look like. Anything else is discarded
// rather than shown, so a surprising reply cannot reach the page at all.
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

// npm package names, which is what goes into the URL below.
const NPM_NAME = /^(?:@[a-z0-9-][a-z0-9._-]*\/)?[a-z0-9-][a-z0-9._-]*$/;

/* ------------------------------------------------------------------- prefs */

/**
 * `autoCheck: null` means nobody has been asked yet, which is different from
 * having said no. Until it is answered, no request is made.
 */
const DEFAULTS = { autoCheck: null, checkedAt: null, latest: null, error: null, versions: [], notes: null };

// How many versions back the app offers to go. Long enough to cover "I updated
// twice before I noticed", short enough that the list stays a list.
const HISTORY_LIMIT = 6;

function readPrefs() {
  try {
    const parsed = JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8'));
    return { ...DEFAULTS, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

function writePrefs(patch) {
  const next = { ...readPrefs(), ...patch };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(PREFS_FILE, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

/**
 * Records the version this run is. Called once at startup, which is what lets
 * the app say "you came from 1.0.1" without anyone having pressed a button:
 * updating by hand from a terminal is noticed just the same as updating from
 * the app, because either way the next launch is running different code.
 */
function noteVersion() {
  const prefs = readPrefs();
  const versions = Array.isArray(prefs.versions) ? prefs.versions.slice() : [];
  if (versions[0] && versions[0].version === VERSION) return prefs;

  versions.unshift({ version: VERSION, at: new Date().toISOString() });
  // One entry per version, so going back and forth between two of them cannot
  // fill the list with the same pair.
  const seen = new Set();
  const trimmed = versions.filter((entry) => {
    if (seen.has(entry.version)) return false;
    seen.add(entry.version);
    return true;
  });
  return writePrefs({ versions: trimmed.slice(0, HISTORY_LIMIT) });
}

/* ----------------------------------------------------------------- semver */

function parse(value) {
  const match = SEMVER.exec(String(value || '').trim());
  if (!match) return null;
  return {
    nums: [Number(match[1]), Number(match[2]), Number(match[3])],
    pre: match[4] || null,
  };
}

/** Whether `latest` is genuinely ahead of `current`, rather than merely different. */
function isNewer(latest, current) {
  const a = parse(latest);
  const b = parse(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) {
    if (a.nums[i] !== b.nums[i]) return a.nums[i] > b.nums[i];
  }
  // Same three numbers, so the only way ahead is a release replacing a
  // pre-release of itself.
  return !a.pre && Boolean(b.pre);
}

/* ------------------------------------------------------------------ check */

async function fetchLatest() {
  if (!NPM_NAME.test(PACKAGE_NAME)) throw new Error('This copy has no npm package name to check.');

  const url = `https://registry.npmjs.org/-/package/${PACKAGE_NAME.split('/').map(encodeURIComponent).join('/')}/dist-tags`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`npm answered ${res.status}.`);

  const tags = await res.json();
  const latest = tags && typeof tags === 'object' ? tags.latest : null;
  if (!parse(latest)) throw new Error('npm sent back something that is not a version.');
  return String(latest).trim();
}

/* ---------------------------------------------------------- release notes */

/**
 * The `owner/repo` this copy came from, or null. Only github.com is accepted,
 * because that is the one host the notes are fetched from and a repository
 * field naming somewhere else must not send a request there.
 */
function repoSlug() {
  const url = String(REPO_URL || '').replace(/^git\+/, '');
  const match = /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(url);
  return match ? `${match[1]}/${match[2]}` : null;
}

function releasesUrl() {
  const slug = repoSlug();
  return slug ? `https://github.com/${slug}/releases` : null;
}

/**
 * What changed in a version, taken from its GitHub release.
 *
 * Everything here is somebody else's text arriving over the network, so it is
 * treated as text and nothing else: truncated, handed to the page as a plain
 * string for escaping, and never interpreted. The link is built from the slug
 * and the tag rather than read out of the reply, so a crafted response cannot
 * choose where "Read it on GitHub" goes.
 *
 * A tag with no release, which is the normal state of a project that tags but
 * does not write release notes, comes back as null rather than as an error.
 */
async function fetchNotes(version) {
  const slug = repoSlug();
  if (!slug || !parse(version)) return null;

  for (const tag of [`v${version}`, version]) {
    let res;
    try {
      res = await fetch(`${GITHUB_API}/repos/${slug}/releases/tags/${encodeURIComponent(tag)}`, {
        headers: { Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return null;
    }
    if (res.status === 404) continue;
    if (!res.ok) return null;

    let release;
    try {
      release = await res.json();
    } catch {
      return null;
    }
    if (!release || typeof release !== 'object') return null;

    return {
      version,
      title: typeof release.name === 'string' ? release.name.slice(0, 200) : '',
      body: typeof release.body === 'string' ? release.body.slice(0, NOTES_LIMIT) : '',
      publishedAt: typeof release.published_at === 'string' ? release.published_at : null,
      url: `https://github.com/${slug}/releases/tag/${tag}`,
    };
  }

  return null;
}

/**
 * Asks npm what the latest version is, subject to consent.
 *
 * `force` is what the Check now button sends: clicking it is consent in itself,
 * so it goes ahead even when the automatic check is switched off, and it
 * ignores how recently the last check ran. Without it this is a no-op unless
 * the user has opted in and a day has passed.
 */
async function check({ force = false } = {}) {
  const prefs = readPrefs();
  if (!force) {
    if (prefs.autoCheck !== true) return prefs;
    const last = Date.parse(prefs.checkedAt || '');
    if (Number.isFinite(last) && Date.now() - last < CHECK_EVERY_MS) return prefs;
  }

  try {
    const latest = await fetchLatest();
    // Only worth asking GitHub what changed when there is something to change
    // to. Staying on the latest version means one request, not two.
    const notes = isNewer(latest, VERSION) ? await fetchNotes(latest) : null;
    return writePrefs({ latest, notes, checkedAt: new Date().toISOString(), error: null });
  } catch (err) {
    // A machine that is offline, behind a proxy or on a plane is not a fault
    // worth shouting about. The reason is kept so Settings can say what
    // happened if someone goes looking, and the page renders as though the
    // check had never run.
    return writePrefs({ checkedAt: new Date().toISOString(), error: err.message });
  }
}

/* -------------------------------------------------------------- git state */

// Running git costs a process, and none of this changes while the app is up, so
// it is worked out once and kept.
let gitCache;

function gitState(dir = APP_DIR) {
  if (gitCache) return gitCache;

  const blank = { repo: false, remote: null, dirty: false };
  if (!hasCommand('git') || !fs.existsSync(path.join(dir, '.git'))) {
    gitCache = blank;
    return gitCache;
  }

  const git = (...args) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  const remote = git('remote', 'get-url', 'origin');
  const status = git('status', '--porcelain');

  // Counted rather than just noted, because "you have changes here" invites the
  // question "which changes?" and a number is the shortest honest answer.
  const changed = status.status === 0
    ? status.stdout.split('\n').filter((line) => line.trim()).length
    : 0;

  gitCache = {
    repo: true,
    remote: remote.status === 0 ? remote.stdout.trim() || null : null,
    changed,
    dirty: changed > 0,
  };
  return gitCache;
}

/* --------------------------------------------------------------- guidance */

/**
 * The command that puts a named version on this machine. Used for going forward
 * to the latest and back to an older one alike, because on npm those are the
 * same operation with a different number: every published version stays
 * published, so going back is an ordinary install.
 */
function installCommand(version, how) {
  if (!parse(version)) return null;
  if (how === 'npx') return `npx ${PACKAGE_NAME}@${version}`;
  if (how === 'npm') return `npm i -g ${PACKAGE_NAME}@${version}`;
  if (how === 'git') return `git checkout v${version}`;
  return null;
}

/**
 * How this particular copy gets updated. The three install kinds have genuinely
 * different answers, and giving someone the wrong one is worse than giving them
 * none, so each is spelled out separately.
 */
/**
 * How to update the app a copy was made from, which is a different install in a
 * different folder and updates on its own terms.
 *
 * Shown rather than done. Every other part of this module only ever acts on the
 * install it is running inside, and a window reaching out to change a different
 * one would break the single property that makes any of this predictable. The
 * marker recorded where the original was and how it got there, which is enough
 * to say what to run without running it.
 */
function originGuidance(copy) {
  const original = copy && copy.original;
  if (!original || !original.dir) return null;

  const exists = fs.existsSync(path.join(original.dir, 'server.js'));
  const command = original.kind === 'global'
    ? `npm i -g ${PACKAGE_NAME}@latest`
    : original.kind === 'npx'
      ? `npx ${PACKAGE_NAME}@latest`
      : null;

  return {
    name: original.name || 'the original',
    dir: original.dir,
    kind: original.kind || 'folder',
    exists,
    command,
    note: !exists
      ? 'It is no longer in the folder it was in, so it looks like it has been removed. Nothing here depends on it.'
      : original.kind === 'npx'
        ? 'It runs through npx, so there is nothing installed to update. Starting it this way is what gets the newest version.'
        : original.kind === 'global'
          ? 'npm installed it, so this updates it. It has no effect on your copy.'
          : 'It is an ordinary folder, so how it updates is however you put it there.',
    // The npx command is how you launch the newest version rather than
    // something you run once, and saying "run it" of the two would paper over a
    // difference that matters.
    commandNote: original.kind === 'npx'
      ? 'Copy it and start the app with it next time. It works from any folder.'
      : 'Copy it, paste it into a terminal, run it. It works from any folder, so the location above is only there to tell you which install this is.',
  };
}

function guidance({ copy = null } = {}) {
  const isCopy = Boolean(copy);
  const { kind } = installKind(APP_DIR);

  if (kind === 'npx') {
    return {
      kind,
      how: 'npx',
      note: 'You start this with npx, which downloads the app each time you run it. Adding "@latest" is what makes sure you get the newest one, because a plain npx will happily reuse a copy it downloaded before.',
      command: `npx ${PACKAGE_NAME}@latest`,
      commandNote: 'Start the app this way next time to get the newest version.',
      blocked: null,
    };
  }

  if (kind === 'global') {
    return {
      kind,
      how: 'npm',
      note: 'npm installed this on your machine, so it stays on this version until you update it.',
      command: `npm i -g ${PACKAGE_NAME}@latest`,
      commandNote: 'Paste this into a terminal to update the app, then open it again.',
      blocked: null,
    };
  }

  // Anything else is a folder: a clone, or a copy someone made to edit.
  const git = gitState();

  // A copy is a clone of the project it came from, so a pull here would merge
  // somebody else's newer code into work the user has been changing. That is
  // not what "update" should mean for something they were handed to make their
  // own, so a copy is offered nothing by default: it stays exactly as they have
  // it until they decide otherwise. The pull is still available, but as an
  // explicit choice further down, described as the merge it actually is.
  if (isCopy && git.repo && git.remote) {
    return {
      kind,
      how: 'copy',
      note: 'This is your own copy, so it stays exactly as you have it. Nothing updates it, and nothing published to the project you copied from reaches it unless you go and fetch it yourself.',
      command: null,
      commandNote: null,
      blocked: null,
      optional: {
        command: `git -C "${APP_DIR}" pull`,
        note: 'Only if you want it. This merges what has changed in the project you copied from into your copy. Where their changes and yours touch the same lines it will stop and ask you to resolve it, which is work in a codebase you have been editing, so it is worth being sure you want it first.',
        commandNote: 'Copy it, paste it into a terminal, run it. The folder is part of the command, so you do not have to go there first.',
      },
      origin: originGuidance(copy),
    };
  }

  if (git.repo && git.remote) {
    // Deliberately understated about the risk. `git pull` does not throw work
    // away: faced with a file you have edited and the new version has changed,
    // it stops and says so. The reason this is not a button is that the stop is
    // a decision, not that the pull is dangerous, and claiming otherwise would
    // frighten people out of updating for no reason.
    return {
      kind,
      how: 'git',
      note: 'You got this app from GitHub rather than from npm, so you update it with this command rather than a button. It is left to you because a pull can stop partway if what has changed upstream runs into something you have changed here, and only you can decide what to keep.',
      // Carries the folder with it, so it can be pasted into any terminal
      // rather than being a command plus an instruction to go somewhere first.
      // Quoted because the path can contain spaces, and usually does.
      command: `git -C "${APP_DIR}" pull`,
      commandNote: `Paste this into a terminal to update ${isCopy ? 'your copy' : 'the app'}. It carries the folder with it, so it works from anywhere.`,
      blocked: git.dirty
        ? `${git.changed} file${git.changed === 1 ? '' : 's'} in this folder ${git.changed === 1 ? 'has' : 'have'} been edited without being committed. Nothing will overwrite them: if the new version touches any of the same files, the pull stops and asks you to commit or stash first.`
        : null,
    };
  }

  if (git.repo) {
    return {
      kind,
      how: 'no-remote',
      note: 'This copy was made by copying the files rather than by downloading them from GitHub, so there is nowhere for it to pull a new version from.',
      command: null,
      commandNote: null,
      blocked: `To move to a new version you would install a fresh one with npm i -g ${PACKAGE_NAME}, and carry your own changes across by hand.`,
    };
  }

  return {
    kind,
    how: 'folder',
    note: 'This is an ordinary folder rather than something npm or GitHub installed, so there is nowhere for it to pull a new version from.',
    command: null,
    commandNote: null,
    blocked: `To move to a new version, install a fresh one with npm i -g ${PACKAGE_NAME}.`,
  };
}

/* ----------------------------------------------------------------- status */

/**
 * Everything the page needs, read from disk only. Deliberately does no network
 * work: state() is rebuilt after every change, and a settings click should
 * never wait on npm.
 */
function status({ copy = null } = {}) {
  const prefs = readPrefs();
  const advice = guidance({ copy });
  const history = Array.isArray(prefs.versions) ? prefs.versions : [];

  // Everything this install has run that is not what it is running now. Offered
  // newest first, so the obvious "put it back how it was" is the top one.
  const earlier = history
    .filter((entry) => entry.version !== VERSION && parse(entry.version))
    .map((entry) => ({
      version: entry.version,
      at: entry.at || null,
      older: isNewer(VERSION, entry.version),
      command: installCommand(entry.version, advice.how),
    }));

  return {
    current: VERSION,
    latest: prefs.latest || null,
    newer: prefs.latest ? isNewer(prefs.latest, VERSION) : false,
    checkedAt: prefs.checkedAt || null,
    // False until the first-run question has been answered either way, which is
    // what puts the question on screen.
    asked: prefs.autoCheck !== null,
    autoCheck: prefs.autoCheck === true,
    lastError: prefs.error || null,
    // Only shown when they describe the version actually on offer, so notes
    // left over from an earlier check can never be read as this one's.
    notes: prefs.notes && prefs.notes.version === prefs.latest ? prefs.notes : null,
    releasesUrl: releasesUrl(),
    ...advice,
    // The version in use before this one, if the app has seen a change. This is
    // what "I updated and I want it back" reaches for.
    cameFrom: earlier.find((entry) => entry.older) || null,
    earlier,
  };
}

function setAutoCheck(value) {
  return writePrefs({ autoCheck: Boolean(value) });
}

module.exports = { status, check, setAutoCheck, noteVersion, installCommand, guidance, isNewer, readPrefs };
