'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const skills = require('./lib/skills');
const settings = require('./lib/settings');
const projects = require('./lib/projects');
const platform = require('./lib/platform');
const fork = require('./lib/fork');
const { NAME, VERSION, displayName, installKind } = require('./lib/app-info');
const {
  SKILLS_DIR, TRASH_DIR, SETTINGS_FILE, DATA_DIR, CLAUDE_DIR,
  SNAPSHOT_FILE, SESSION_FILE, SESSIONS_DIR, APP_DIR, migrateLegacyData,
} = require('./lib/paths');

const PUBLIC_DIR = path.join(__dirname, 'public');
const HOST = '127.0.0.1';
const BASE_PORT = 7842;

// Launched from a desktop shortcut there is no window to close, so the server
// stops itself once no page is watching. The open page heartbeats well inside
// this limit; miss enough of them and the process exits on its own.
const IDLE_LIMIT_MS = 150_000;
const IDLE_CHECK_MS = 15_000;
const GOODBYE_GRACE_MS = 8_000;

let lastSeen = Date.now();

// A per-run secret. Without it the API refuses to answer, so a stray page in
// another browser tab cannot drive this server.
const TOKEN = crypto.randomBytes(16).toString('hex');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

/* ------------------------------------------------------------------ helpers */

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(body);
}

function json(res, status, payload) {
  send(res, status, JSON.stringify(payload), { 'Content-Type': 'application/json; charset=utf-8' });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1e6) reject(new Error('Request body too large'));
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(new Error(`Invalid JSON body: ${err.message}`));
      }
    });
    req.on('error', reject);
  });
}

// Skill ids come from the browser; make sure one can never escape the skills
// directory or name something that is not a real skill folder.
function safeSkillName(name) {
  if (typeof name !== 'string' || !name) throw new Error('Missing skill name');
  if (name !== path.basename(name) || name === '.' || name === '..') {
    throw new Error(`Illegal skill name: ${name}`);
  }
  return name;
}

/**
 * Resolves a request's scope to the folders and settings file it may touch.
 * A projectDir from the browser is only honoured if it is one this app already
 * watches, so a request can never reach an arbitrary place on disk.
 */
function resolveScope(body) {
  const dir = body && body.projectDir;
  if (!dir) {
    return {
      kind: 'global',
      skillsRoot: SKILLS_DIR,
      trashDir: TRASH_DIR,
      settingsFile: SETTINGS_FILE,
      inherited: {},
    };
  }

  const known = projects.list().find((p) => platform.samePath(p.dir, dir));
  if (!known) throw new Error(`Not a watched folder: ${dir}`);

  const scope = skills.projectScope(known);
  return {
    kind: 'project',
    skillsRoot: known.skillsDir,
    trashDir: path.join(known.dir, '.claude', 'skills-trash'),
    settingsFile: scope.settingsFile,
    inherited: scope.inherited,
  };
}

function readSnapshot() {
  try {
    return JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeSnapshot(value) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify(value, null, 2), 'utf8');
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function state() {
  const scanned = skills.scan();
  return {
    ...scanned,
    snapshot: readSnapshot(),
    // The page titles itself from this, so a renamed copy is distinguishable
    // from the original when both are open. `copy` is null in an original and
    // describes the fork in one, which is what switches the sidebar card
    // between "Modify this app" and "Your own copy".
    app: {
      // Read fresh, so a rename applied from Manage shows up immediately
      // rather than after a restart.
      name: displayName(),
      version: VERSION,
      dir: APP_DIR,
      copy: fork.readMarker(),
      install: installKind(APP_DIR),
    },
    paths: { skills: SKILLS_DIR, settings: SETTINGS_FILE, trash: TRASH_DIR, claude: CLAUDE_DIR },
  };
}

// Folders the page may ask to open in the file manager: this install, and
// anything the setup flow has just created or come from. Populated as the app
// hands paths out, never from whatever a request happens to name.
const revealable = new Set([path.resolve(APP_DIR)]);
{
  const marker = fork.readMarker();
  if (marker && marker.original && marker.original.dir) {
    revealable.add(path.resolve(marker.original.dir));
  }
}

/* --------------------------------------------------------------- api routes */

const routes = {
  'GET /api/ping': async () => ({ ok: true, pid: process.pid }),

  // Sent by the page as it unloads. Closing the tab should not leave a server
  // running invisibly, so shut down shortly unless a page checks back in
  // first — which is what a reload or a second tab does.
  'POST /api/bye': async () => {
    lastSeen = Date.now() - IDLE_LIMIT_MS + GOODBYE_GRACE_MS;
    return { ok: true };
  },

  'GET /api/state': async () => state(),

  // Launched from a shortcut there is no console to close, so the UI offers a
  // way out. Reply first, then shut down.
  'POST /api/quit': async () => {
    setTimeout(() => {
      clearSession();
      server.close();
      process.exit(0);
    }, 150);
    return { quitting: true };
  },


  /**
   * The single write path for settings. Default Claude mode rides along here
   * via `snapshot` rather than through a separate endpoint, so the saved
   * snapshot and the settings it describes can never disagree — including
   * when the change arrives from undo or redo.
   */
  'POST /api/override': async (body) => {
    const changes = body && body.changes;
    if (!changes || typeof changes !== 'object') throw new Error('Missing changes');
    for (const name of Object.keys(changes)) safeSkillName(name);

    const scope = resolveScope(body);
    settings.applyOverrides(scope.settingsFile, changes, scope.inherited);

    const snapshot = body && body.snapshot;
    if (snapshot) {
      if (snapshot.action === 'save') {
        const payload = snapshot.payload;
        if (!payload || typeof payload.overrides !== 'object') {
          throw new Error('Snapshot payload must carry an overrides object');
        }
        writeSnapshot({ savedAt: payload.savedAt || new Date().toISOString(), overrides: payload.overrides });
      } else if (snapshot.action === 'clear') {
        try {
          fs.rmSync(SNAPSHOT_FILE, { force: true });
        } catch {
          /* ignore */
        }
      } else {
        throw new Error(`Unknown snapshot action: ${snapshot.action}`);
      }
    }
    return state();
  },

  // Removal is a move into a skills-trash folder, never an unlink. Project
  // skills go to a trash inside their own project so they stay with the repo.
  'POST /api/trash': async (body) => {
    const name = safeSkillName(body && body.name);
    const scope = resolveScope(body);
    const source = path.join(scope.skillsRoot, name);
    if (!fs.existsSync(source)) throw new Error(`No such skill: ${name}`);
    fs.mkdirSync(scope.trashDir, { recursive: true });
    fs.renameSync(source, path.join(scope.trashDir, `${name}__${stamp()}`));
    // Drop the now-orphaned override so the settings file stays clean.
    settings.applyOverrides(scope.settingsFile, { [name]: null }, {});
    return state();
  },

  'POST /api/restore': async (body) => {
    const id = safeSkillName(body && body.id);
    const scope = resolveScope(body);
    const source = path.join(scope.trashDir, id);
    if (!fs.existsSync(source)) throw new Error(`Not in trash: ${id}`);
    const name = id.replace(/__\d{4}-\d{2}-\d{2}T[\d-]+Z$/, '');
    const dest = path.join(scope.skillsRoot, name);
    if (fs.existsSync(dest)) throw new Error(`A skill named "${name}" already exists.`);
    fs.renameSync(source, dest);
    return state();
  },

  'POST /api/purge': async (body) => {
    const id = safeSkillName(body && body.id);
    const scope = resolveScope(body);
    const target = path.join(scope.trashDir, id);
    if (!fs.existsSync(target)) throw new Error(`Not in trash: ${id}`);
    fs.rmSync(target, { recursive: true, force: true });
    return state();
  },

  'POST /api/orphans/clean': async () => {
    const { orphans } = skills.scan();
    if (!orphans.length) return state();
    settings.applyOverrides(SETTINGS_FILE, Object.fromEntries(orphans.map((o) => [o.name, null])), {});
    return state();
  },

  'POST /api/doc': async (body) => {
    const name = safeSkillName(body && body.name);
    const scope = resolveScope(body);
    const file = path.join(scope.skillsRoot, name, 'SKILL.md');
    if (!fs.existsSync(file)) throw new Error(`No SKILL.md for ${name}`);
    return { name, text: fs.readFileSync(file, 'utf8') };
  },

  // Opens the desktop's native folder picker. The request stays open until the
  // dialog is answered; a cancel comes back as no path rather than an error.
  // A Linux box with no dialog program says so, and the page asks for a typed
  // path instead.
  'POST /api/pick-folder': async () => {
    const chosen = await platform.pickFolder();
    if (chosen.unsupported) return { unsupported: true, ...state() };
    if (chosen.cancelled) return { cancelled: true, ...state() };
    projects.addFolder(chosen.path);
    return { added: chosen.path, ...state() };
  },

  // Same dialog as pick-folder, but purely a question — it adds nothing and
  // changes nothing. Used when choosing where a copy of the app should go.
  'POST /api/choose-folder': async () => {
    const chosen = await platform.pickFolder();
    if (chosen.unsupported) return { unsupported: true };
    if (chosen.cancelled) return { cancelled: true };
    return { path: chosen.path };
  },

  // Makes the user their own copy of the app. Everything the dialog needs to
  // report comes back in one reply: where it went, how many files, what
  // happened to the shortcuts, and whether `claude` is even runnable.
  // Folders this run is allowed to open in the file manager. An allowlist
  // rather than "any path the page asks for", so a stray request can only ever
  // reach somewhere the app itself created or came from.
  'POST /api/reveal-path': async (body) => {
    const target = body && body.path;
    if (!revealable.has(path.resolve(String(target || '')))) {
      throw new Error('That folder is not one this app offered to open.');
    }
    platform.reveal(target);
    return { revealed: target };
  },

  'POST /api/fork': async (body) => {
    const result = fork.run({
      into: body && body.into,
      dir: body && body.dir,
      name: body && body.name,
      mode: body && body.mode === 'replace' ? 'replace' : 'both',
      desktop: Boolean(body && body.desktop),
    });
    revealable.add(path.resolve(result.dest));
    if (result.original && result.original.dir) revealable.add(path.resolve(result.original.dir));
    return { ...result, ...state() };
  },

  // The way back out of a replace: restore the original's shortcut, hand it
  // back entirely, or just rename this copy.
  'POST /api/fork/manage': async (body) => {
    const result = fork.manage({
      action: body && body.action,
      name: body && body.name,
      keepShortcut: !body || body.keepShortcut !== false,
    });
    return { ...result, ...state() };
  },

  'POST /api/add-folder': async (body) => {
    const added = projects.addFolder(body && body.folder);
    return { added, ...state() };
  },

  'POST /api/remove-folder': async (body) => {
    projects.removeFolder(body && body.folder);
    return state();
  },

  'POST /api/reveal': async (body) => {
    const what = body && body.what;
    let target;
    if (what === 'settings') target = SETTINGS_FILE;
    else if (what === 'trash') target = resolveScope(body).trashDir;
    else if (what === 'skills') target = resolveScope(body).skillsRoot;
    else if (what === 'project-settings') target = resolveScope(body).settingsFile;
    else target = path.join(resolveScope(body).skillsRoot, safeSkillName(what));

    platform.reveal(target);
    return { revealed: target };
  },
};

/* ------------------------------------------------------------------- server */

function serveStatic(req, res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const file = path.join(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
  }
  send(res, 200, fs.readFileSync(file), {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}`);
  const key = `${req.method} ${url.pathname}`;

  if (url.pathname.startsWith('/api/')) {
    const token = req.headers['x-skills-token'] || url.searchParams.get('token');
    if (token !== TOKEN) return json(res, 403, { error: 'Bad or missing token.' });
    if (url.pathname !== '/api/bye') lastSeen = Date.now();

    const handler = routes[key];
    if (!handler) return json(res, 404, { error: `No route for ${key}` });

    try {
      const body = req.method === 'POST' ? await readBody(req) : {};
      return json(res, 200, await handler(body));
    } catch (err) {
      return json(res, 400, { error: err.message });
    }
  }

  if (req.method !== 'GET') return send(res, 405, 'Method not allowed', { 'Content-Type': 'text/plain' });

  // The token rides in on the page URL; the page then keeps it in memory.
  if (url.pathname === '/') {
    if (url.searchParams.get('token') !== TOKEN) {
      return send(res, 403, 'Open this app from the link printed in the terminal.', {
        'Content-Type': 'text/plain; charset=utf-8',
      });
    }
  }
  serveStatic(req, res, url.pathname);
});

/* ------------------------------------------------------- instance handling */

const openBrowser = platform.openBrowser;

// Only the process that wrote the session file may delete it. A launch that
// bows out to an already-running instance must leave that instance's file
// alone, or the next launch would see nothing and start a rival server.
let ownsSession = false;

function clearSession() {
  if (!ownsSession) return;
  try {
    const session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
    if (session.pid !== process.pid) return;
  } catch {
    return;
  }
  try {
    fs.rmSync(SESSION_FILE, { force: true });
  } catch {
    /* ignore */
  }
}

/**
 * If a previous instance is still answering, returns its URL so this launch can
 * simply focus that window instead of starting a second server.
 *
 * The session file is per install (see lib/paths.js), so a modified copy of the
 * app never bows out to the original — otherwise launching your own version
 * would silently reopen the one you were trying to replace.
 */
async function findLiveInstance() {
  let session;
  try {
    session = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
  } catch {
    return null;
  }
  if (!session || !session.port || !session.token) return null;

  const url = `http://${HOST}:${session.port}`;
  try {
    const res = await fetch(`${url}/api/ping`, {
      headers: { 'x-skills-token': session.token },
      signal: AbortSignal.timeout(700),
    });
    if (!res.ok) return null;
    return `${url}/?token=${session.token}`;
  } catch {
    // Stale file from a crashed or killed run.
    return null;
  }
}

// Registered once. Attaching this inside listen() would leave a stale callback
// behind on every port retry, and they would all fire on the eventual success.
server.on('listening', () => {
  const { port } = server.address();
  const url = `http://${HOST}:${port}/?token=${TOKEN}`;

  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  fs.writeFileSync(SESSION_FILE, JSON.stringify({ port, token: TOKEN, pid: process.pid }), 'utf8');
  ownsSession = true;

  console.log('');
  console.log(`  ${NAME} is running.`);
  console.log(`  ${url}`);
  console.log('');
  console.log('  Close this window, or use Quit in the app, to stop it.');
  console.log('');
  openBrowser(url);

  lastSeen = Date.now();
  const idleTimer = setInterval(() => {
    if (Date.now() - lastSeen < IDLE_LIMIT_MS) return;
    console.log('  No page open — shutting down.');
    clearSession();
    process.exit(0);
  }, IDLE_CHECK_MS);
  // Never let the watchdog itself be the reason the process stays alive.
  idleTimer.unref();
});

function listen(port, attemptsLeft = 20) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) return listen(port + 1, attemptsLeft - 1);
    console.error(`Could not start server: ${err.message}`);
    process.exit(1);
  });
  server.listen(port, HOST);
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => {
    clearSession();
    process.exit(0);
  });
}
process.on('exit', clearSession);

async function start() {
  migrateLegacyData();

  const live = await findLiveInstance();
  if (live) {
    console.log(`\n  ${NAME} is already running — opening it.\n`);
    openBrowser(live);
    process.exit(0);
  }
  listen(BASE_PORT);
}

module.exports = { start };

// Still runnable as `node server.js`, which is how anyone working on their own
// copy will start it.
if (require.main === module) start();
