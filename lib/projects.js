'use strict';

const fs = require('fs');
const path = require('path');
const { CLAUDE_DIR, DATA_DIR } = require('./paths');
const { pathKey, samePath } = require('./platform');

const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
const FOLDERS_FILE = path.join(DATA_DIR, 'folders.json');

/**
 * Claude Code keeps a directory per project under ~/.claude/projects, but the
 * directory *name* is lossy — path separators, spaces and dots all collapse to
 * dashes, so it cannot be reversed. The session transcripts inside carry the
 * real working directory, which can.
 */
function pathFromTranscripts(dir) {
  let files;
  try {
    files = fs.readdirSync(dir).filter((n) => n.endsWith('.jsonl'));
  } catch {
    return null;
  }

  for (const name of files) {
    let text;
    try {
      text = fs.readFileSync(path.join(dir, name), 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split('\n')) {
      if (!line.includes('"cwd"')) continue;
      try {
        const entry = JSON.parse(line);
        if (entry && typeof entry.cwd === 'string' && entry.cwd) return entry.cwd;
      } catch {
        /* a truncated final line is normal */
      }
    }
  }
  return null;
}

function discovered() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  const found = [];
  for (const entry of fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const cwd = pathFromTranscripts(path.join(PROJECTS_DIR, entry.name));
    if (cwd) found.push(cwd);
  }
  return found;
}

/** Folders the user added by hand, for places Claude Code has never opened. */
function readAdded() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FOLDERS_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed.filter((p) => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

function writeAdded(list) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FOLDERS_FILE, JSON.stringify([...new Set(list)].sort(), null, 2), 'utf8');
}

function addFolder(folder) {
  if (typeof folder !== 'string' || !folder.trim()) throw new Error('No folder given');
  const resolved = path.resolve(folder);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`Not a folder: ${resolved}`);
  }
  const list = readAdded();
  if (!list.some((p) => samePath(p, resolved))) list.push(resolved);
  writeAdded(list);
  return resolved;
}

function removeFolder(folder) {
  writeAdded(readAdded().filter((p) => !samePath(p, folder)));
}

/**
 * Every folder worth scanning: those Claude Code has opened, plus any added by
 * hand. Paths that no longer exist are dropped rather than shown as broken.
 */
function list() {
  const added = readAdded();
  const addedKeys = new Set(added.map(pathKey));
  const seen = new Map();

  for (const dir of [...discovered(), ...added]) {
    const key = pathKey(dir);
    if (seen.has(key)) continue;
    if (!fs.existsSync(dir)) continue;
    seen.set(key, {
      dir,
      name: path.basename(dir),
      manual: addedKeys.has(key),
      skillsDir: path.join(dir, '.claude', 'skills'),
    });
  }

  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = { list, addFolder, removeFolder, readAdded, FOLDERS_FILE };
