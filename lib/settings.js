'use strict';

const fs = require('fs');
const path = require('path');
const { SETTINGS_FILE, BACKUPS_DIR } = require('./paths');

const STATES = ['on', 'name-only', 'user-invocable-only', 'off'];

function readJson(file) {
  if (!fs.existsSync(file)) return {};
  const raw = fs.readFileSync(file, 'utf8');
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not a JSON object');
    }
    return parsed;
  } catch (err) {
    // Never write over a file we could not understand.
    const error = new Error(
      `Could not parse ${file}: ${err.message}. Fix the file by hand before changing settings here.`
    );
    error.code = 'SETTINGS_UNPARSEABLE';
    throw error;
  }
}

function overridesIn(file) {
  const block = readJson(file).skillOverrides;
  if (!block || typeof block !== 'object' || Array.isArray(block)) return {};
  return block;
}

const readSettings = () => readJson(SETTINGS_FILE);
const readOverrides = () => overridesIn(SETTINGS_FILE);

/** Backups all live under ~/.claude/backups so project repos stay clean. */
function backup(file) {
  if (!fs.existsSync(file)) return null;
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  const slug = file.replace(/[:\\/]+/g, '-').replace(/^-+/, '').slice(-80);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.copyFileSync(file, path.join(BACKUPS_DIR, `${slug}.${stamp}.bak`));
  pruneBackups();
  return true;
}

// Keep the 60 most recent backups; older ones are noise.
function pruneBackups() {
  try {
    const entries = fs
      .readdirSync(BACKUPS_DIR)
      .filter((n) => n.endsWith('.bak') || /^settings\..*\.json$/.test(n))
      .sort();
    for (const name of entries.slice(0, Math.max(0, entries.length - 60))) {
      fs.rmSync(path.join(BACKUPS_DIR, name), { force: true });
    }
  } catch {
    /* pruning is best-effort */
  }
}

function writeJson(file, value) {
  backup(file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

/**
 * Applies { skillName: state } to a settings file's skillOverrides.
 *
 * `on` is Claude's default, so it normally means "remove the entry". But when a
 * lower-precedence file already sets something for that skill, removing the
 * entry would let the lower value take over instead — so in that case `on` is
 * written out explicitly.
 */
function applyOverrides(file, changes, inherited = {}) {
  const settings = readJson(file);
  const overrides = { ...(settings.skillOverrides || {}) };

  for (const [name, state] of Object.entries(changes)) {
    if (state === null || state === 'on') {
      const below = inherited[name];
      if (below && below !== 'on') overrides[name] = 'on';
      else delete overrides[name];
    } else {
      if (!STATES.includes(state)) throw new Error(`Unknown skill state: ${state}`);
      overrides[name] = state;
    }
  }

  const sorted = {};
  for (const key of Object.keys(overrides).sort()) sorted[key] = overrides[key];

  if (Object.keys(sorted).length === 0) delete settings.skillOverrides;
  else settings.skillOverrides = sorted;

  writeJson(file, settings);
  return sorted;
}

module.exports = {
  STATES,
  SETTINGS_FILE,
  readJson,
  overridesIn,
  readSettings,
  readOverrides,
  applyOverrides,
  writeJson,
};
