'use strict';

// Installing a different version of the app from inside the app, forwards to a
// newer one or back to an older one. On npm those are the same operation with a
// different number, so one mechanism serves both.
//
// The install cannot run inside this process. npm replaces the very folder the
// server is running out of, and on Windows that fails outright while the files
// are in use. So this module has two halves: the app asks it to start, and it
// spawns a detached copy of itself which waits for the app to exit, runs npm,
// and leaves the outcome in a file. The next launch reads that file and says
// how it went. Nobody has to keep a window open watching a progress bar.

const fs = require('fs');
const { spawn, spawnSync } = require('child_process');

const { APP_DIR, DATA_DIR, APPLY_RESULT_FILE } = require('./paths');
const { PACKAGE_NAME, VERSION, installKind } = require('./app-info');
const { hasCommand, IS_WINDOWS } = require('./platform');

// Both halves validate this. The version reaches the child as a command line
// argument, and it ends up in a string npm is asked to run, so nothing that is
// not a plain version number is allowed anywhere near it.
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

const WAIT_STEP_MS = 250;
const WAIT_LIMIT_MS = 60_000;
const OUTPUT_LIMIT = 8000;

/* -------------------------------------------------------------- preflight */

// Both of these cost a process to work out and neither changes while the app is
// up, so they are worked out once. state() is rebuilt after every change, and
// none of those should pay for an npm invocation.
let prefixCache;
let preflightCache;

function globalPrefix() {
  if (prefixCache !== undefined) return prefixCache;
  try {
    const probe = spawnSync('npm', ['prefix', '-g'], { encoding: 'utf8', shell: IS_WINDOWS });
    prefixCache = probe.status === 0 ? probe.stdout.trim() || null : null;
  } catch {
    prefixCache = null;
  }
  return prefixCache;
}

/**
 * Whether the app can offer a button at all.
 *
 * The point of checking in advance is that a button which sometimes fails is
 * worse than no button. Each of these is a real way the install would break,
 * caught before anyone clicks rather than reported afterwards, and each has a
 * reason the page can show in plain words instead.
 */
function preflight() {
  if (preflightCache) return preflightCache;

  const { kind } = installKind(APP_DIR);

  // `applicable` separates "a button never made sense for this install" from
  // "a button would fit here but something is in the way". Only the second is
  // worth explaining on screen: for an npx run or a folder, the section already
  // says how updating works, and repeating it as an apology for a missing
  // button just says the same thing twice.
  if (kind !== 'global') {
    preflightCache = { ok: false, applicable: false, reason: null };
  } else if (!hasCommand('npm')) {
    preflightCache = {
      ok: false,
      applicable: true,
      reason: 'There is no button for this because the app cannot find npm. That is common when it was opened from a desktop shortcut, which does not always get the same PATH a terminal does. The command below does exactly the same thing.',
    };
  } else {
    const prefix = globalPrefix();
    if (!prefix) {
      preflightCache = {
        ok: false,
        applicable: true,
        reason: 'There is no button for this because npm would not say where it installs things, so the app cannot tell in advance whether it would work. The command below does the same thing.',
      };
    } else {
      try {
        fs.accessSync(prefix, fs.constants.W_OK);
        preflightCache = { ok: true, applicable: true, reason: null, prefix };
      } catch {
        preflightCache = {
          ok: false,
          applicable: true,
          reason: `There is no button for this because npm installs into ${prefix}, and this account cannot write there. An install started from the app would fail. Run the command below with whatever permissions that folder needs.`,
        };
      }
    }
  }

  return preflightCache;
}

/* ----------------------------------------------------------------- result */

function readResult() {
  try {
    const parsed = JSON.parse(fs.readFileSync(APPLY_RESULT_FILE, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function clearResult() {
  try {
    fs.rmSync(APPLY_RESULT_FILE, { force: true });
  } catch {
    /* nothing to clear */
  }
}

function writeResult(value) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(APPLY_RESULT_FILE, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  } catch {
    // Losing the report is a shame but not a failure. The version number in the
    // window is the real answer either way.
  }
}

/* ------------------------------------------------------------------ start */

/**
 * Hands the job to a detached child and returns. The caller is expected to shut
 * the server down straight afterwards, because the child is waiting for exactly
 * that before it touches anything.
 */
function start(version) {
  const wanted = String(version || '').trim();
  if (!SEMVER.test(wanted)) throw new Error(`Not a version number: ${version}`);

  const check = preflight();
  if (!check.ok) throw new Error(check.reason);

  // The old report would otherwise still be sitting there if the child never
  // gets as far as writing a new one.
  clearResult();

  const child = spawn(process.execPath, [__filename, wanted, String(process.pid), VERSION], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.on('error', () => {});
  child.unref();

  return { started: true, from: VERSION, to: wanted };
}

/* ------------------------------------------------------------------ child */

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** True once the given process is gone. */
function hasExited(pid) {
  try {
    process.kill(pid, 0);
    return false;
  } catch {
    return true;
  }
}

async function waitForParent(pid) {
  for (let waited = 0; waited < WAIT_LIMIT_MS; waited += WAIT_STEP_MS) {
    if (hasExited(pid)) return true;
    await wait(WAIT_STEP_MS);
  }
  return false;
}

function npmInstall(spec) {
  return new Promise((resolve) => {
    let child;
    try {
      // shell is needed on Windows, where npm is a .cmd and Node will not spawn
      // one directly. Safe here only because the package name and the version
      // are both matched against a pattern before they reach this line.
      child = spawn('npm', ['i', '-g', spec], { shell: IS_WINDOWS, windowsHide: true });
    } catch (err) {
      return resolve({ ok: false, code: null, output: err.message });
    }

    let output = '';
    const take = (chunk) => {
      output += chunk;
      // npm can be extremely talkative, and only the end of it says what went
      // wrong.
      if (output.length > OUTPUT_LIMIT) output = output.slice(-OUTPUT_LIMIT);
    };

    child.stdout.on('data', take);
    child.stderr.on('data', take);
    child.on('error', (err) => resolve({ ok: false, code: null, output: `${output}\n${err.message}`.trim() }));
    child.on('close', (code) => resolve({ ok: code === 0, code, output: output.trim() }));
  });
}

async function runAsChild(wanted, parentPid, from) {
  if (!SEMVER.test(wanted)) return;

  const exited = await waitForParent(parentPid);
  if (!exited) {
    return writeResult({
      at: new Date().toISOString(),
      from,
      to: wanted,
      ok: false,
      code: null,
      output: 'The app was still running after a minute, so nothing was installed rather than risk installing over a running copy.',
    });
  }

  const result = await npmInstall(`${PACKAGE_NAME}@${wanted}`);
  writeResult({ at: new Date().toISOString(), from, to: wanted, ...result });
}

if (require.main === module) {
  const [wanted, parentPid, from] = process.argv.slice(2);
  runAsChild(String(wanted), Number(parentPid), String(from || '')).catch(() => {});
}

module.exports = { preflight, start, readResult, clearResult };
