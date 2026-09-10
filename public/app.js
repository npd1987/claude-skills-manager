'use strict';

const TOKEN = new URLSearchParams(location.search).get('token');

// `value` is the word settings.json uses; `label` is the word the sidebar and
// group headings use. They differ for `on`, which really means "auto".
const STATES = [
  { value: 'on', label: 'Auto', hint: 'Claude may load this skill on its own, and /name works.' },
  { value: 'name-only', label: 'Name only', hint: 'Claude sees the name but not the full description.' },
  { value: 'user-invocable-only', label: 'Slash only', hint: 'Only runs when you type /name. Claude never loads it by itself.' },
  { value: 'off', label: 'Off', hint: 'Disabled entirely, but the files stay on disk.' },
];

const GROUPS = [
  { key: 'auto', title: 'Auto: Claude can load these itself' },
  { key: 'name-only', title: 'Name only: Claude sees the name, not the details' },
  { key: 'slash-only', title: 'Slash only: you invoke these with /name' },
  { key: 'off', title: 'Off: installed but disabled' },
];

const GROUP_NAMES = { auto: 'Auto', 'name-only': 'Name only', 'slash-only': 'Slash only', off: 'Off' };

// Shown at the top of each filtered view. The All view relies on its group
// headings instead, so it deliberately has no entry here.
const EXPLAINERS = {
  all: {
    summary: 'What this app does',
    body: `Every skill you've installed in your own skills folder. The skills that ship with Claude Code aren't
           listed, since they aren't yours to manage here. Each card shows what a skill does and how it's set,
           and the four buttons change that setting. The sections below group skills by how they
           <em>actually behave</em>, which isn't always what the setting alone would suggest.`,
    note: `Changes save the moment you click, but Claude Code reads these settings when a session starts, so
           they apply to your <strong>next</strong> session, not one you already have open. Nothing here
           destroys anything: Undo reverses your last action, Off keeps the files in place, and Remove moves a
           skill to a trash folder. Only <strong>Delete forever</strong> erases anything from disk.`,
  },
  auto: {
    summary: 'What “Auto” means',
    body: `Claude sees what these skills do and can reach for one on its own. You just describe your task in
           plain words, with no <code>/command</code> needed, and Claude decides whether the skill fits. Typing
           <code>/name</code> still works too.`,
    note: `Every auto skill's description is loaded at the start of each session, so a long description costs
           a little context whether or not the skill gets used. Reserve this for skills you genuinely want
           working in the background.`,
  },
  'name-only': {
    summary: 'What “Name only” means',
    body: `A middle setting: Claude sees the skill's <em>name</em> but not its full description. It can still
           load the skill, but has much less to go on when deciding whether to.`,
    note: `Useful when a skill's name says everything and its description is long. If Claude keeps missing a
           skill you expect it to use, move it to Auto so it can see what the skill actually does.`,
  },
  'slash-only': {
    summary: 'What “Slash only” means',
    body: `These never fire on their own. No matter what you ask for, Claude will not load them. You invoke
           one by typing <code>/name</code> at the <strong>start</strong> of a message.`,
    note: `Two different things land a skill here. Either you chose this setting, or the skill's own
           <code>SKILL.md</code> sets <code>disable-model-invocation: true</code>. Those carry a
           <strong>locked to /</strong> tag, and their Auto and Name only buttons are struck through because
           the skill's author ruled them out. Changing that means editing the SKILL.md.`,
  },
  off: {
    summary: 'What “Off” means',
    body: `Switched off completely. Claude cannot load these, and <code>/name</code> will not work either.`,
    note: `The files stay exactly where they are. This only writes a setting, so turning one back on is
           instant and loses nothing.`,
  },
  trash: {
    summary: 'What “Removed” means',
    body: `These folders were moved out of their skills folder and into a <code>skills-trash</code> folder
           beside it. Claude no longer sees them at all.`,
    note: `<strong>Restore</strong> puts one back where it came from, along with the setting it had.
           <strong>Delete forever</strong> erases it from disk, and it is the one action in this app
           that undo cannot reverse.`,
  },
};

// Folded into the description panel so one paragraph always says which set of
// skills you are looking at, whichever page you are on.
const SCOPE_NOTES = {
  global: `You're looking at <strong>global</strong> skills, the ones in your personal skills folder, available
           in every project. Skills that ship with Claude Code aren't listed, since they aren't yours to
           manage here.`,
  projects: `You're looking at <strong>project</strong> skills, ones that live inside a single folder and only
           exist for Claude Code sessions run there. A project skill beats a global skill of the same name
           inside its own folder, and its setting is stored with the project rather than globally.`,
};

const SCOPES = [
  { key: 'global', label: 'Global' },
  { key: 'projects', label: 'Projects' },
];

const VIEWS = [
  { key: 'all', label: 'All skills', dot: 'all' },
  { key: 'auto', label: 'Auto', dot: 'auto' },
  { key: 'name-only', label: 'Name only', dot: 'name-only' },
  { key: 'slash-only', label: 'Slash only', dot: 'slash-only' },
  { key: 'off', label: 'Off', dot: 'off' },
  { key: 'trash', label: 'Removed', dot: '' },
];

let data = null;
let view = 'all';
let query = '';
let busy = false;

let scope = localStorage.getItem('claude-skills-scope') === 'projects' ? 'projects' : 'global';

/* ----------------------------------------------------------------- theme */

const LAUNCH_SAID = {
  tab: 'It will open in a tab from now on.',
  window: 'It will open in a window of its own from now on.',
  app: 'It will open in an app window from now on.',
};

const THEMES = [
  { value: 'system', label: 'Match my system' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

let theme = localStorage.getItem('claude-skills-theme') || 'system';
if (!THEMES.some((t) => t.value === theme)) theme = 'system';

/**
 * Sets the attribute the stylesheet keys off, or removes it so the system's own
 * preference decides. Applied before the first paint rather than after the
 * state arrives, so nobody sees one theme turn into the other.
 */
function applyTheme() {
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
}

applyTheme();

/** The skills the current scope is showing. */
const scopeSkills = () => (scope === 'projects' ? data.projectSkills : data.skills);
const scopeCounts = () => (scope === 'projects' ? data.projectCounts : data.counts);

/** Every mutation carries the folder it applies to; global sends none. */
const skillTarget = (skill) => (skill && skill.projectDir ? { projectDir: skill.projectDir } : {});

// Which section each visible card was filed under when the list was last built.
// Cards hold their position after a change; this is what lets us say where a
// card *will* move to once the list is rebuilt.
let placedGroups = new Map();

const SORTS = [
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'installed-desc', label: 'Newest installed' },
  { value: 'installed-asc', label: 'Oldest installed' },
  { value: 'updated-desc', label: 'Recently changed' },
];

let sortBy = localStorage.getItem('claude-skills-sort') || 'name';
if (!SORTS.some((s) => s.value === sortBy)) sortBy = 'name';

/** Sorts a copy. Skills missing a date fall to the end rather than the top. */
function sorted(list) {
  const byDate = (key, dir) => (a, b) => {
    if (!a[key] && !b[key]) return a.name.localeCompare(b.name);
    if (!a[key]) return 1;
    if (!b[key]) return -1;
    if (a[key] === b[key]) return a.name.localeCompare(b.name);
    return dir * a[key].localeCompare(b[key]);
  };

  const copy = [...list];
  if (sortBy === 'installed-desc') return copy.sort(byDate('installedAt', -1));
  if (sortBy === 'installed-asc') return copy.sort(byDate('installedAt', 1));
  if (sortBy === 'updated-desc') return copy.sort(byDate('updatedAt', -1));
  return copy.sort((a, b) => a.name.localeCompare(b.name));
}

function shortDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const stateLabel = (value) => (STATES.find((s) => s.value === value) || {}).label || value;

/* --------------------------------------------------------------- history */

const HISTORY_KEY = 'claude-skills-history';

const history = { stack: [], index: -1 };

function saveHistory() {
  try {
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    /* storage is a convenience, not a requirement */
  }
}

function loadHistory() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(HISTORY_KEY));
    if (saved && Array.isArray(saved.stack)) {
      history.stack = saved.stack;
      history.index = saved.index;
    }
  } catch {
    /* ignore */
  }
}

function pushHistory(entry) {
  // A new action discards anything that was redoable.
  history.stack = history.stack.slice(0, history.index + 1);
  history.stack.push(entry);
  if (history.stack.length > 100) history.stack.shift();
  history.index = history.stack.length - 1;
  saveHistory();
}

/* ------------------------------------------------------------------- api */

async function api(path, body) {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', 'x-skills-token': TOKEN },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error || `Request failed (${res.status})`);
  return payload;
}

const postOverrides = (changes, snapshot, projectDir) =>
  api('/api/override', { changes, snapshot, projectDir });

/**
 * Runs one history entry in either direction. Every entry is reversible by
 * construction: it carries the full before and after state it touched.
 */
async function applyEntry(entry, direction) {
  // Entries remember which folder they applied to, so undo lands in the same
  // settings file the original change did.
  const target = entry.projectDir ? { projectDir: entry.projectDir } : {};

  if (entry.kind === 'overrides') {
    const forward = direction === 'forward';
    // Default Claude mode carries snapshot instructions for each direction, so
    // undoing it also puts the sidebar switch back where it was.
    data = await postOverrides(forward ? entry.after : entry.before,
                               forward ? entry.snapshotForward : entry.snapshotBack,
                               entry.projectDir);
    return;
  }

  if (entry.kind === 'trash') {
    if (direction === 'forward') {
      data = await api('/api/trash', { name: entry.name, ...target });
      entry.id = newestTrashId(entry.projectDir);
      saveHistory();
    } else {
      data = await api('/api/restore', { id: entry.id, ...target });
      if (entry.prevState && entry.prevState !== 'on') {
        data = await postOverrides({ [entry.name]: entry.prevState }, undefined, entry.projectDir);
      }
    }
  }
}

/** Trash lists come back newest first, in the folder the skill belonged to. */
function newestTrashId(projectDir) {
  const list = projectDir
    ? (data.projects.find((p) => p.dir === projectDir) || { trash: [] }).trash
    : data.trash;
  return list.length ? list[0].id : null;
}

/**
 * Performs an action and records it. `rebuild: false` leaves the list order
 * alone so the card you just clicked stays where you clicked it.
 */
async function run(entry, { record = true, rebuild = false, message } = {}) {
  if (busy) return;
  busy = true;
  try {
    await applyEntry(entry, 'forward');
    if (record) pushHistory(entry);
    render({ rebuild });
    flash(entry);
    if (message !== null) toast(message || entry.label);
  } catch (err) {
    toast(err.message, true);
    await load();
  } finally {
    busy = false;
  }
}

async function step(direction) {
  if (busy) return;
  const entry = direction === 'back' ? history.stack[history.index] : history.stack[history.index + 1];
  if (!entry) return;

  busy = true;
  try {
    await applyEntry(entry, direction === 'back' ? 'back' : 'forward');
    history.index += direction === 'back' ? -1 : 1;
    saveHistory();
    // An undone card may not be on screen at all; rebuilding would also move
    // things around unexpectedly, so patch in place and let Refresh regroup.
    render({ rebuild: false });
    flash(entry);
    toast(`${direction === 'back' ? 'Undone' : 'Redone'}: ${entry.label}`);
  } catch (err) {
    toast(err.message, true);
    await load();
  } finally {
    busy = false;
  }
}

async function load() {
  try {
    data = await api('/api/state');
    // Once per page. A later refresh must not move a window the user has since
    // put where they want it.
    // The cached shape has usually done this already; this is the fallback for
    // a browser that lost its storage, and the authority if the two disagree.
    const shape = data.launch && data.launch.shape;

    // The cached shape has usually sized the window already; this is the
    // fallback for a browser that lost its storage.
    if (!shapeRestored) {
      shapeRestored = true;
      if (ownsWindow()) applyShape(shape);
    }

    // Asked for separately, and never folded into the branch above. The sizing
    // there is often already done by the time we reach it, and a maximize that
    // only happened when it was not would be one that mostly never happened.
    if (!maximizeAsked && ownsWindow() && shape && shape.maximized) {
      maximizeAsked = true;
      fetch(`/api/maximize?token=${TOKEN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-skills-token': TOKEN },
        body: '{}',
      }).catch(() => {});
    }
    render({ rebuild: true });
    return true;
  } catch (err) {
    document.getElementById('content').innerHTML =
      `<div class="empty">Could not read your skills.<br />${esc(err.message)}</div>`;
    return false;
  }
}

const FRESH = 'Reloaded from disk. Everything here is up to date.';

/* ----------------------------------------------------------------- utils */

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

function toast(message, isError = false) {
  const el = document.createElement('div');
  el.className = `toast${isError ? ' error' : ''}`;
  el.textContent = message;
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), isError ? 6000 : 2600);
}

/** Briefly highlights the cards an action touched, so the change is visible. */
function flash(entry) {
  const names = entry.kind === 'trash' ? [entry.name] : Object.keys(entry.after || {});
  const prefix = entry.projectDir || 'global';
  for (const name of names) {
    const el = document.querySelector(`[data-card="${CSS.escape(`${prefix}:${name}`)}"]`);
    if (!el) continue;
    el.classList.remove('flash');
    void el.offsetWidth; // restart the animation
    el.classList.add('flash');
  }
}

function confirmDialog(title, html, confirmLabel) {
  return new Promise((resolve) => {
    const modal = document.getElementById('modal');
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-text').innerHTML = html;
    const confirmBtn = document.getElementById('modal-confirm');
    confirmBtn.textContent = confirmLabel;
    modal.hidden = false;

    const close = (result) => {
      modal.hidden = true;
      confirmBtn.onclick = null;
      document.getElementById('modal-cancel').onclick = null;
      resolve(result);
    };
    confirmBtn.onclick = () => close(true);
    document.getElementById('modal-cancel').onclick = () => close(false);
    modal.onclick = (e) => { if (e.target === modal) close(false); };
  });
}

/** The folders behind whichever view and scope is on screen. */
function viewPaths() {
  if (scope === 'projects') {
    // Many folders are in play, so name the shape rather than one path.
    const rows = [{ label: 'Skills live in', value: '<project>\\.claude\\skills', reveal: null }];
    if (view === 'trash') {
      rows.push({ label: 'Removed to', value: '<project>\\.claude\\skills-trash', reveal: null });
    } else {
      rows.push({ label: 'Settings written to', value: '<project>\\.claude\\settings.local.json', reveal: null });
    }
    return rows;
  }

  if (view === 'trash') {
    return [{ label: 'Removed skills folder', value: data.paths.trash, reveal: 'trash' }];
  }
  return [
    { label: 'Skills folder', value: data.paths.skills, reveal: 'skills' },
    { label: 'Settings file', value: data.paths.settings, reveal: 'settings' },
  ];
}

/**
 * The count line, with the description folded away behind it. Built by hand
 * rather than with <details> because a details element cannot animate open,
 * browsers hide its contents outright while closed.
 */
function sortControl() {
  if (view === 'trash') return '';
  const options = SORTS.map(
    (s) => `<option value="${s.value}"${s.value === sortBy ? ' selected' : ''}>${esc(s.label)}</option>`
  ).join('');
  return `<label class="sort"><span>Sort</span><select id="sort-by">${options}</select></label>`;
}

function explainer(key, countText) {
  const copy = EXPLAINERS[key];
  const head = `<span class="explainer-count">${esc(countText)}</span>`;
  if (!copy) {
    return `<div class="explainer"><div class="explainer-head">${head}${sortControl()}</div></div>`;
  }

  const paths = viewPaths()
    .map(
      (p) => `
      <div class="path-row">
        <dt>${esc(p.label)}</dt>
        <dd><code>${esc(p.value)}</code>${
          p.reveal ? `<button class="link-btn" data-reveal-path="${esc(p.reveal)}">Open</button>` : ''
        }</dd>
      </div>`
    )
    .join('');

  return `
    <div class="explainer ${key}">
      <div class="explainer-head">
        ${head}
        <span class="explainer-sep">·</span>
        <button class="explainer-toggle" aria-expanded="false">${esc(copy.summary)}</button>
        ${scope === 'projects' ? '<button class="add-folder" id="add-folder">Add folder</button>' : ''}
        ${sortControl()}
      </div>
      <div class="explainer-panel">
        <div class="explainer-inner">
          <div class="explainer-card">
            <p>${copy.body}</p>
            <p class="explainer-note">${copy.note}</p>
            <p class="explainer-scope">${SCOPE_NOTES[scope]}</p>
            <dl class="explainer-paths">${paths}</dl>
          </div>
        </div>
      </div>
    </div>`;
}

function wireExplainer() {
  const toggle = document.querySelector('.explainer-toggle');
  if (toggle) {
    toggle.onclick = () => {
      const box = toggle.closest('.explainer');
      const open = box.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    };
  }
  for (const btn of document.querySelectorAll('[data-reveal-path]')) {
    btn.onclick = () => api('/api/reveal', { what: btn.dataset.revealPath }).catch((e) => toast(e.message, true));
  }

  const add = document.getElementById('add-folder');
  if (add) {
    add.onclick = async () => {
      if (busy) return;
      busy = true;
      add.disabled = true;
      const previous = add.textContent;
      add.textContent = 'Choose a folder…';
      try {
        // The request stays open while the native dialog is up.
        let result = await api('/api/pick-folder', {});

        // A Linux desktop with neither zenity nor kdialog has no folder chooser
        // to offer, so ask for the path instead of failing.
        if (result.unsupported) {
          const typed = prompt('Type the full path of a folder that contains .claude/skills:');
          if (!typed || !typed.trim()) {
            toast('No folder chosen.');
            return;
          }
          result = await api('/api/add-folder', { folder: typed.trim() });
        }

        if (result.cancelled) {
          toast('No folder chosen.');
        } else {
          data = result;
          render({ rebuild: true });
          toast(`Now watching ${result.added}`);
        }
      } catch (err) {
        toast(err.message, true);
      } finally {
        busy = false;
        const btn = document.getElementById('add-folder');
        if (btn) { btn.disabled = false; btn.textContent = previous; }
      }
    };
  }

  const select = document.getElementById('sort-by');
  if (select) {
    select.onchange = () => {
      sortBy = select.value;
      localStorage.setItem('claude-skills-sort', sortBy);
      renderMain();
      toast(`Sorted by ${SORTS.find((s) => s.value === sortBy).label.toLowerCase()}.`);
    };
  }
}

function matches(skill) {
  if (!query) return true;
  const q = query.toLowerCase();
  return skill.name.toLowerCase().includes(q) || (skill.description || '').toLowerCase().includes(q);
}

/* ---------------------------------------------------------------- render */

function render({ rebuild = true } = {}) {
  if (!data) return;
  renderIdentity();
  document.getElementById('skills-path').textContent =
    scope === 'projects' ? `${data.projects.length} project folders with skills` : data.paths.skills;
  renderScopes();
  renderHistoryButtons();
  renderFilters();
  renderBanners();
  renderSettingsCard();
  renderIssues();
  renderUpdateChip();
  if (rebuild) renderMain();
  else patchCards();
}

function renderHistoryButtons() {
  const undoEntry = history.stack[history.index];
  const redoEntry = history.stack[history.index + 1];

  const undoBtn = document.getElementById('undo');
  const redoBtn = document.getElementById('redo');

  undoBtn.disabled = !undoEntry;
  redoBtn.disabled = !redoEntry;
  undoBtn.title = undoEntry ? `Undo: ${undoEntry.label}  (Ctrl+Z)` : 'Nothing to undo';
  redoBtn.title = redoEntry ? `Redo: ${redoEntry.label}  (Ctrl+Y)` : 'Nothing to redo';
}

function renderScopes() {
  const totals = { global: data.counts.total, projects: data.projectCounts.total };
  document.getElementById('scopes').innerHTML = SCOPES.map(
    (s) => `<button class="scope" role="tab" data-scope="${s.key}" aria-selected="${scope === s.key}">
              ${esc(s.label)}<span class="scope-count">${totals[s.key]}</span>
            </button>`
  ).join('');

  for (const btn of document.querySelectorAll('.scope')) {
    btn.onclick = () => {
      if (scope === btn.dataset.scope) return;
      scope = btn.dataset.scope;
      localStorage.setItem('claude-skills-scope', scope);
      render({ rebuild: true });
    };
  }
}

function renderFilters() {
  const c = scopeCounts();
  const trashCount =
    scope === 'projects'
      ? data.projects.reduce((n, p) => n + p.trash.length, 0)
      : data.trash.length;
  const counts = {
    all: c.total,
    auto: c.auto,
    'name-only': c.nameOnly,
    'slash-only': c.slashOnly,
    off: c.off,
    trash: trashCount,
  };

  document.getElementById('filters').innerHTML = VIEWS.map(
    (v) => `
      <button class="filter" data-view="${v.key}" aria-current="${view === v.key}">
        ${v.dot ? `<span class="dot ${v.dot}"></span>` : '<span class="dot" style="background:transparent"></span>'}
        <span class="label">${esc(v.label)}</span>
        <span class="count">${counts[v.key]}</span>
      </button>`
  ).join('');

  for (const btn of document.querySelectorAll('.filter')) {
    btn.onclick = () => {
      view = btn.dataset.view;
      render({ rebuild: true });
    };
  }
}

/* ------------------------------------------------ default Claude mode */

// The two halves of Default Claude mode, as functions rather than click
// handlers, because each is now reachable from two places: the banner in the
// sidebar and the row in Settings.

async function turnAllOff() {
  const ok = await confirmDialog(
    'Turn all skills off?',
    `All <strong>${data.counts.total}</strong> skills will be set to <code>off</code>. Nothing is deleted, and your current
     per-skill settings are saved so one click brings them back.`,
    'Turn all off'
  );
  if (!ok) return;
  const before = Object.fromEntries(data.skills.map((s) => [s.name, s.state]));
  const after = Object.fromEntries(data.skills.map((s) => [s.name, 'off']));
  run(
    {
      kind: 'overrides',
      label: 'Turn all skills off',
      before,
      after,
      // Saving the pre-change states is what makes both routes back, the
      // sidebar button and Undo alike, able to restore them.
      snapshotForward: { action: 'save', payload: { savedAt: new Date().toISOString(), overrides: before } },
      snapshotBack: { action: 'clear' },
    },
    { rebuild: true, message: 'All skills are off. Claude is running default.' }
  );
}

function bringSkillsBack() {
  const snap = data.snapshot;
  if (!snap) return;
  const before = Object.fromEntries(data.skills.map((s) => [s.name, s.state]));
  const after = Object.fromEntries(data.skills.map((s) => [s.name, snap.overrides[s.name] || 'on']));
  run(
    {
      kind: 'overrides',
      label: 'Bring my skills back',
      before,
      after,
      snapshotForward: { action: 'clear' },
      // Undoing this returns to all-off, so the snapshot has to come back
      // exactly as it was, timestamp included.
      snapshotBack: { action: 'save', payload: snap },
    },
    { rebuild: true, message: 'Your skill settings are back.' }
  );
}

/* ------------------------------------------------------- sidebar banners */

/**
 * One row per thing that is true right now and would be surprising to discover
 * later. Every banner carries its own way out, so seeing the state and changing
 * it are the same stop.
 */
function renderBanners() {
  const el = document.getElementById('banners');
  const update = data.update || {};
  const parts = [];

  // How the last install went, reported once by the launch that follows it.
  if (update.last) {
    parts.push(update.last.ok
      ? `<div class="banner good">
           <div class="banner-text"><strong>Updated to ${esc(update.last.to)}</strong>
           <span>You were on ${esc(update.last.from)} before.</span></div>
           <button class="btn small" data-banner="seen">Got it</button>
         </div>`
      : `<div class="banner bad">
           <div class="banner-text"><strong>That install did not work</strong>
           <span>Still on ${esc(update.current)}. Settings has what npm said.</span></div>
           <button class="btn small" data-banner="settings">Open</button>
         </div>`);
  }

  // Asked once, and only once. Until it is answered nothing has left this
  // machine, which is the whole reason to ask before rather than after.
  if (!update.asked) {
    parts.push(`
      <div class="banner ask">
        <div class="banner-text"><strong>Check npm for new versions?</strong>
        <span>This is the only thing this app would send anywhere: a request asking npm what the
        latest version is, and one asking GitHub what changed in it. Neither carries anything about
        you, your skills or your settings. You can change this later in Settings.</span></div>
        <div class="banner-buttons">
          <button class="btn small primary" data-banner="consent-yes">Yes</button>
          <button class="btn small" data-banner="consent-no">No thanks</button>
        </div>
      </div>`);
  }

  if (data.snapshot) {
    parts.push(`
      <div class="banner armed">
        <div class="banner-text"><strong>Default Claude mode is on</strong>
        <span>Every skill is off. Your settings were saved ${esc(shortDate(data.snapshot.savedAt))}.</span></div>
        <button class="btn small primary" data-banner="restore">Bring back</button>
      </div>`);
  }

  const copy = data.app && data.app.copy;
  if (copy) {
    parts.push(`
      <div class="banner mine">
        <div class="banner-text"><strong>Your own copy</strong>
        <span class="mine-name">${esc(copy.name)}</span></div>
        <button class="btn small" data-banner="manage">Manage</button>
      </div>`);
  }

  el.innerHTML = parts.join('');

  const actions = {
    restore: bringSkillsBack,
    manage: openManage,
    settings: openSettings,
    seen: () => api('/api/updates/seen', {}).then((next) => { data = next; render({ rebuild: false }); }),
    'consent-yes': () => setAutoCheck(true),
    'consent-no': () => setAutoCheck(false),
  };
  for (const btn of el.querySelectorAll('[data-banner]')) {
    btn.onclick = () => actions[btn.dataset.banner]();
  }
}

/**
 * Answers the first-run question. Saying yes checks straight away, because
 * having just agreed to it, waiting a day to find out would be an odd reward.
 */
async function setAutoCheck(on) {
  try {
    data = await api('/api/updates/prefs', { autoCheck: on });
    if (on) data = await api('/api/updates/check', { force: true });
    render({ rebuild: false });
    toast(on ? 'Checking npm for new versions from now on.' : 'Leaving npm alone. Check by hand in Settings any time.');
  } catch (err) {
    toast(err.message, true);
  }
}

function renderIssues() {
  const el = document.getElementById('issues');
  const parts = [];

  if (data.orphans.length) {
    parts.push(`
      <div class="issue">
        <strong>${data.orphans.length} setting${data.orphans.length > 1 ? 's' : ''} with no skill</strong>
        <p>${data.orphans.map((o) => `<code>${esc(o.name)}</code>`).join(', ')}. These entries in settings.json
        point at skills you no longer have, and could silently apply to a built-in skill with the same name.</p>
        <button class="btn" id="clean-orphans">Remove them</button>
      </div>`);
  }

  for (const clash of data.collisions) {
    parts.push(`
      <div class="issue">
        <strong>/${esc(clash.name)} is claimed twice</strong>
        <p>Both a skill and a legacy command in <code>~/.claude/commands</code> define this name.</p>
      </div>`);
  }

  el.innerHTML = parts.length ? `<h5 class="side-title">Needs attention</h5>${parts.join('')}` : '';

  const clean = document.getElementById('clean-orphans');
  if (clean) {
    clean.onclick = () => {
      const before = Object.fromEntries(data.orphans.map((o) => [o.name, o.state]));
      const after = Object.fromEntries(data.orphans.map((o) => [o.name, null]));
      run({ kind: 'overrides', label: 'Clean up orphaned settings', before, after },
          { rebuild: true, message: 'Cleaned up settings.json.' });
    };
  }
}

/* ------------------------------------------------- modify this app / copy */

/**
 * A renamed copy has to look different from the original, or running the two
 * side by side tells you nothing about which is which.
 */
function renderIdentity() {
  const name = (data.app && data.app.name) || 'Claude Skills';
  document.title = name;
  const heading = document.querySelector('.brand h1');
  // Rewriting the text alone would take the version span with it.
  if (heading) heading.firstChild.nodeValue = name;
  const version = document.getElementById('app-version');
  if (version) version.textContent = `v${(data.app && data.app.version) || ''}`;
}

/** The one-line preview of what you'll be left with, shown before you commit. */
function shortcutRow(name, what, gone = false) {
  return `<div class="shortcut${gone ? ' gone' : ''}">
    <span class="icon"></span><span class="name">${esc(name)}</span>
    <span class="what">· ${esc(what)}</span>
  </div>`;
}

function commandRow(text) {
  return `<div class="cmd"><code>${esc(text)}</code>
    <button class="link-btn" data-copy="${esc(text)}">Copy</button></div>`;
}

const GEAR_ICON = `<svg class="gear" viewBox="0 0 20 20" aria-hidden="true">
  <circle cx="10" cy="10" r="2.6" />
  <path d="M10 2.6v2M10 15.4v2M17.4 10h-2M4.6 10h-2M15.2 4.8l-1.4 1.4M6.2 13.8l-1.4 1.4M15.2 15.2l-1.4-1.4M6.2 6.2 4.8 4.8" />
</svg>`;

function renderSettingsCard() {
  const el = document.getElementById('settings-card');
  const update = data.update || {};

  el.innerHTML = `
    <button class="settings-entry" id="open-settings">
      ${GEAR_ICON}
      <span class="settings-label">Settings</span>
      ${update.newer ? '<span class="settings-badge">1</span>' : ''}
    </button>`;
  document.getElementById('open-settings').onclick = openSettings;
}

/**
 * The one piece of this that follows you around. A new version is worth
 * knowing about wherever you are in the app, but it is never urgent, so it is a
 * chip you can ignore rather than something that interrupts.
 */
function renderUpdateChip() {
  const chip = document.getElementById('update-chip');
  const update = data.update || {};
  chip.hidden = !update.newer;
  if (!update.newer) return;
  // No number here. The version you are on is already beside the app name, and
  // the number you would be going to belongs where you can act on it.
  chip.textContent = 'Update available';
  chip.title = `${update.latest} has been published. You're running ${update.current}.`;
  chip.onclick = openSettings;
}

/* ---------------------------------------------------------------- settings */

/**
 * The command is always on screen, whether or not there is a button beside it.
 * A button that quietly replaces the thing it automates leaves you stuck when
 * it fails; one that sits next to it is a shortcut you can ignore.
 */
function commandBlock(command, note) {
  if (!command) return '';
  return `${commandRow(command)}${note ? `<p class="cmd-note">${esc(note)}</p>` : ''}`;
}

/**
 * What changed in the version being offered.
 *
 * Collapsed to start with, because release notes are as long as their author
 * felt like making them and an unpredictable block of text would push the
 * controls below it off the bottom of the dialog. Same open-and-close as the
 * description panel on the count line, so it behaves the way the one other
 * expanding thing in this app behaves.
 *
 * The body is somebody else's writing arriving over the network. It is escaped
 * and laid out as plain text; the only thing done to it is dropping the leading
 * hashes off Markdown headings, which is a text change and not an
 * interpretation of one.
 */
function notesBlock() {
  const update = data.update || {};
  if (!update.newer) return '';

  const notes = update.notes;
  if (!notes) {
    return update.releasesUrl
      ? `<p class="muted small">No release notes were published for ${esc(update.latest)}.
         <a href="${esc(update.releasesUrl)}" target="_blank" rel="noopener noreferrer">Releases on GitHub</a></p>`
      : '';
  }

  const text = String(notes.body || '')
    .split('\n')
    .map((line) => line.replace(/^#{1,6}\s+/, ''))
    .join('\n')
    .trim();

  if (!text) return '';

  return `
    <div class="explainer notes" id="notes">
      <button class="explainer-toggle" id="notes-toggle" aria-expanded="false">What's new</button>
      <div class="explainer-panel">
        <div class="explainer-inner">
          <div class="notes-card">
            ${notes.title ? `<strong>${esc(notes.title)}</strong>` : ''}
            <div class="notes-body">${esc(text)}</div>
            <a href="${esc(notes.url)}" target="_blank" rel="noopener noreferrer">Read it on GitHub</a>
          </div>
        </div>
      </div>
    </div>`;
}

function updatesSection() {
  const update = data.update || {};
  const apply = update.apply || {};
  const last = update.last;

  const status = update.newer
    ? `<span class="pill new">${esc(update.latest)} available</span>`
    : update.latest
      ? '<span class="pill">Up to date</span>'
      : '';

  const checked = update.checkedAt
    ? `Last checked ${esc(new Date(update.checkedAt).toLocaleString())}.`
    : 'Never checked.';

  const isCopy = Boolean(data.app && data.app.copy);

  // Everything that explains rather than instructs. Kept together and, when
  // there is enough of it to become a wall, folded away behind a toggle. The
  // one-line answer and the command stay on screen; the reasoning is there for
  // anyone who wants it and out of the way of anyone who does not.
  //
  // The "why there is no button" line only earns a place when a button would
  // have fitted here and something got in the way. Where one never made sense,
  // the note has already said how updating works, and apologising for the
  // absence would only say it a second time.
  const explanations = [
    // In a copy the headline above already says this, and the fold below is two
    // labelled choices rather than prose, so repeating the note here would say
    // the same thing twice in three paragraphs.
    isCopy ? null : update.note,
    update.blocked,
    update.newer && apply.applicable && !apply.ok ? apply.reason : null,
  ].filter(Boolean);

  // Something a copy can do but is not being told to do. It lives inside the
  // fold, under its own heading, described as the merge it is rather than as an
  // update, because recommending it would be recommending that somebody merge
  // other people's code into work they have been changing.
  // The two headings are deliberately the same shape, each naming the version
  // it acts on. With two installs on the machine, "which one does this change?"
  // is the only question that matters here, and it should be answerable from
  // the heading alone.
  const optional = update.optional
    ? `<div class="optional">
         <strong>Merge the update into your modified copy</strong>
         <p>${esc(update.optional.note)}</p>
         ${commandBlock(update.optional.command, update.optional.commandNote)}
       </div>`
    : '';

  // Once somebody has made a copy there are two installs, and the question
  // "which one am I updating?" has two answers. Both are laid out, side by
  // side, so neither has to be guessed at.
  const origin = update.origin
    ? `<div class="optional">
         <strong>Update the original version of the app</strong>
         <p>${esc(update.origin.note)}</p>
         <p class="muted small">${esc(update.origin.name)}, in <code>${esc(update.origin.dir)}</code>.</p>
         ${update.origin.command && update.origin.exists
           ? commandBlock(update.origin.command, update.origin.commandNote)
           : ''}
       </div>`
    : '';

  // What is behind the fold decides what the fold is called. Once a copy exists
  // these really are two apps, in two folders, launched separately, so "which
  // app" is the plain word for the choice. Calling it "how updating works"
  // would read as an explanation nobody needs to open, and with only prose
  // inside, promising a choice would be a lie.
  const actionable = Boolean(optional) || Boolean(origin);
  const foldLabel = actionable ? 'Choose which app to update' : 'How updating works here';
  const wall = actionable || explanations.join(' ').length > 160;

  const detail = explanations.length || actionable
    ? wall
      ? `<div class="explainer notes" id="how">
           <button class="explainer-toggle" id="how-toggle" aria-expanded="false">${foldLabel}</button>
           <div class="explainer-panel"><div class="explainer-inner">
             <div class="notes-card">
               ${explanations.map((line) => `<p>${esc(line)}</p>`).join('')}
               ${optional}
               ${origin}
             </div>
           </div></div>
         </div>`
      : explanations.map((line) => `<p class="muted">${esc(line)}</p>`).join('')
    : '';

  const failure = last && !last.ok
    ? `<div class="apply-failed">
         <strong>The last install did not work.</strong>
         <p>You are still on ${esc(update.current)}. This is what npm said:</p>
         <pre>${esc(last.output || 'npm said nothing.')}</pre>
       </div>`
    : '';

  return `
    <section class="settings-section">
      <h5>Updates ${status}</h5>
      <p>You're running <strong>${esc(update.current)}</strong>. ${esc(checked)}</p>
      ${isCopy
        ? `<p class="why">This is your own copy, and it does not update. Nothing published to the original
           project changes it, and updating the app you made it from cannot change it either.</p>`
        : ''}
      ${notesBlock()}
      ${detail}
      ${failure}
      ${update.newer && apply.ok
        ? `<button class="btn primary" data-apply="${esc(update.latest)}">Update to ${esc(update.latest)}</button>`
        : ''}
      ${commandBlock(update.command, update.commandNote)}
      <div class="settings-row">
        <label class="toggle">
          <input type="checkbox" id="auto-check" ${update.autoCheck ? 'checked' : ''} />
          <span>Check for updates automatically</span>
        </label>
        <button class="btn small" id="check-now">Check now</button>
      </div>
      <p class="muted small">Once a day at most: npm for the latest version number, and GitHub for that
      release's notes when there is a newer one to describe. Neither carries anything about you, your skills or
      your settings, and Check now works whether this is on or off.</p>
      ${update.lastError ? `<p class="why">Last check did not get through: ${esc(update.lastError)}</p>` : ''}
    </section>`;
}

/**
 * Going back to a version you were on before. On npm this is an ordinary
 * install of an older number, because published versions stay published, so the
 * way back is the way forward with a different argument.
 */
function rollbackSection() {
  const update = data.update || {};
  const apply = update.apply || {};
  const earlier = update.earlier || [];
  if (!earlier.length) return '';

  const rows = earlier.map((entry) => `
    <div class="version-row">
      <div>
        <code>${esc(entry.version)}</code>
        <span class="muted small">${entry.at ? `used until ${esc(shortDate(entry.at))}` : ''}</span>
      </div>
      ${entry.command && apply.ok && entry.older
        ? `<button class="btn small" data-apply="${esc(entry.version)}">Go back to it</button>`
        : entry.command
          ? `<button class="link-btn" data-copy="${esc(entry.command)}">Copy command</button>`
          : ''}
    </div>`).join('');

  return `
    <section class="settings-section">
      <h5>Versions you have run</h5>
      <p>If a new version turns out worse than the one before it, put the old one back. Nothing you have set
      is touched by this: your skill settings live in your own Claude folder, not in the app.</p>
      ${rows}
    </section>`;
}

const LAUNCH_CHOICES = [
  { value: 'tab', label: 'A tab', hint: 'Opens in the browser window you already have open.' },
  {
    value: 'window',
    label: 'Its own window',
    hint: 'A browser window of its own, with the address bar and tabs.',
  },
  {
    value: 'app',
    label: 'An app window',
    hint: 'No address bar and no tabs, so it looks like a desktop app. It reopens at the size you left it.',
  },
];

/**
 * Why a way of opening is not on offer. The browser is named rather than
 * blamed in the abstract, so a struck-out option reads as a fact about this
 * machine rather than something the app decided on its own.
 */
function launchWhy(browser) {
  if (!browser) return 'Needs a browser this app can find and start itself.';
  if (browser.family === 'firefox') {
    return `${browser.name} has no chrome-less mode. Chrome, Edge or Brave can do this.`;
  }
  return `This app cannot start ${browser.name} itself. Chrome, Edge, Brave or Firefox can do this.`;
}

/**
 * Options the browser cannot deliver are struck through rather than dropped,
 * following the same rule the skill cards use for states a skill's frontmatter
 * rules out: a list that quietly changes length hides the reason it changed.
 */
function launchSection() {
  const launch = data.launch || { mode: 'tab', browser: null, modes: { tab: true } };
  const { browser, modes } = launch;

  return `
    <section class="settings-section">
      <h5>How it opens</h5>
      <p>${
        browser
          ? `Your default browser is ${esc(browser.name)}.`
          : `This app could not work out which browser is your default, so it can only hand the
             address to the system and let it decide.`
      }</p>
      <div class="choices" role="radiogroup">
        ${LAUNCH_CHOICES.map((option) => {
          const can = modes[option.value] === true;
          return `
          <button class="choice" role="radio" data-set-launch="${option.value}"
                  aria-checked="${launch.mode === option.value}"${can ? '' : ' disabled'}>
            <span class="radio"></span>
            <span>
              <h6>${esc(option.label)}</h6>
              <p>${esc(can ? option.hint : launchWhy(browser))}</p>
            </span>
          </button>`;
        }).join('')}
      </div>
    </section>`;
}

function paintSettings() {
  const copy = data.app && data.app.copy;

  paintSetup('Settings', `
    <section class="settings-section">
      <h5>Appearance</h5>
      <p>Light and dark are both written out properly, so nothing goes faint in either one.</p>
      <div class="choices theme-choices" role="radiogroup">
        ${THEMES.map((option) => `
          <button class="choice compact" role="radio" data-set-theme="${option.value}"
                  aria-checked="${theme === option.value}">
            <span class="radio"></span><span><h6>${esc(option.label)}</h6></span>
          </button>`).join('')}
      </div>
    </section>

    ${updatesSection()}
    ${rollbackSection()}
    ${launchSection()}

    <section class="settings-section">
      <h5>Default Claude mode</h5>
      ${data.snapshot
        ? `<p>Every skill is off, and your previous settings were saved
             ${esc(new Date(data.snapshot.savedAt).toLocaleString())}.</p>
           <button class="btn primary" id="settings-restore">Bring my skills back</button>`
        : `<p>Turn every global skill off at once to get plain, out-of-the-box Claude. Your current settings
             are saved so you can undo it.${scope === 'projects' ? ' Project skills are left alone.' : ''}</p>
           <button class="btn" id="settings-alloff">Turn all skills off</button>`}
    </section>

    <section class="settings-section">
      <h5>${copy ? 'Your own copy' : 'Modify this app'}</h5>
      ${copy
        ? `<p>You're running your own version, called <span class="mine-name">${esc(copy.name)}</span>.</p>
           <button class="btn" id="settings-copy">Manage</button>`
        : `<p>Get your own copy to change in Claude Code. Once you have one it is yours: it lives in its own
             folder, keeps its own version, and updating this app never touches it.</p>
           <button class="btn" id="settings-copy">Set it up</button>`}
    </section>

    <div class="modal-actions">
      <button class="btn ghost" data-close-setup>Close</button>
    </div>`, wireSettings);
}

function openSettings() {
  paintSettings();
}

function wireSettings(modal) {
  for (const btn of modal.querySelectorAll('[data-set-theme]')) {
    btn.onclick = () => {
      theme = btn.dataset.setTheme;
      localStorage.setItem('claude-skills-theme', theme);
      applyTheme();
      // Repainted rather than patched, so the chosen option is marked without
      // a second source of truth for which one that is.
      paintSettings();
    };
  }

  // Applies to the next launch, never to the window doing the asking: opening
  // a second one from here would leave the user looking at two.
  for (const btn of modal.querySelectorAll('[data-set-launch]')) {
    btn.onclick = async () => {
      const mode = btn.dataset.setLaunch;
      try {
        data = await api('/api/launch-mode', { mode });
        paintSettings();
        toast(LAUNCH_SAID[mode]);
      } catch (err) {
        toast(err.message, true);
      }
    };
  }

  // Both collapsibles behave the same way, so they are wired the same way.
  for (const [toggleId, panelId] of [['notes-toggle', 'notes'], ['how-toggle', 'how']]) {
    const toggle = modal.querySelector(`#${toggleId}`);
    if (!toggle) continue;
    toggle.onclick = () => {
      const open = modal.querySelector(`#${panelId}`).classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    };
  }

  const restore = modal.querySelector('#settings-restore');
  if (restore) restore.onclick = () => { closeSetup(); bringSkillsBack(); };

  const allOff = modal.querySelector('#settings-alloff');
  if (allOff) allOff.onclick = () => { closeSetup(); turnAllOff(); };

  const copyBtn = modal.querySelector('#settings-copy');
  if (copyBtn) copyBtn.onclick = () => (data.app && data.app.copy ? openManage() : openSetup());

  const auto = modal.querySelector('#auto-check');
  if (auto) {
    auto.onchange = async () => {
      await setAutoCheck(auto.checked);
      paintSettings();
    };
  }

  const check = modal.querySelector('#check-now');
  if (check) {
    check.onclick = async () => {
      check.disabled = true;
      check.textContent = 'Checking…';
      try {
        data = await api('/api/updates/check', { force: true });
        render({ rebuild: false });
        paintSettings();
        const update = data.update;
        toast(update.newer
          ? `${update.latest} is out. You're on ${update.current}.`
          : update.lastError
            ? `Could not reach npm: ${update.lastError}`
            : `You're on the latest version (${update.current}).`);
      } catch (err) {
        toast(err.message, true);
        check.disabled = false;
        check.textContent = 'Check now';
      }
    };
  }

  for (const btn of modal.querySelectorAll('[data-apply]')) {
    btn.onclick = () => installVersion(btn.dataset.apply);
  }
}

/**
 * Installs a version and closes down, because npm is about to replace the
 * folder this app is running out of. Waiting for it here is not an option:
 * on Windows the install would fail outright with the files still in use.
 */
async function installVersion(version) {
  const current = data.update.current;
  const back = data.update.earlier.some((entry) => entry.version === version && entry.older);

  const ok = await confirmDialog(
    back ? `Go back to ${version}?` : `Update to ${version}?`,
    `Claude Skills will close, and npm will install <strong>${esc(version)}</strong> in its place. Open the app
     again in a moment and it will tell you how it went.<br /><br />
     Your skills and settings are not touched by this. They live in your own Claude folder, not in the app.`,
    back ? `Close and install ${version}` : `Close and update`
  );
  if (!ok) return;

  closeSetup();
  quitting = true;
  try {
    await api('/api/updates/apply', { version });
  } catch (err) {
    quitting = false;
    toast(err.message, true);
    return;
  }

  document.body.innerHTML =
    '<div style="display:flex;flex-direction:column;gap:8px;align-items:center;justify-content:center;' +
    'height:100%;color:var(--text-dim);font-size:14px;text-align:center;padding:0 24px">' +
    `<strong style="color:var(--text);font-size:15px">Installing ${esc(version)}</strong>` +
    '<span>This window is finished with. Open Claude Skills again in a moment, and it will say how it went.</span>' +
    '</div>';
}

/* ------------------------------------------------------------ the dialogs */

const setupModal = () => document.getElementById('setup');

function closeSetup() {
  setupModal().hidden = true;
  setupModal().onclick = null;
}

/** Paints whatever `body` describes, then wires the controls it contains. */
function paintSetup(title, body, wire) {
  document.getElementById('setup-title').textContent = title;
  document.getElementById('setup-body').innerHTML = body;
  const modal = setupModal();
  modal.hidden = false;
  modal.onclick = (e) => { if (e.target === modal) closeSetup(); };

  for (const btn of modal.querySelectorAll('[data-copy]')) {
    btn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        toast('Copied.');
      } catch {
        toast('Could not reach the clipboard. Select and copy it by hand.', true);
      }
    };
  }
  for (const btn of modal.querySelectorAll('[data-close-setup]')) btn.onclick = closeSetup;
  if (wire) wire(modal);
}

/* -------------------------------------------------------- setup: choosing */

let setup = null;

function openSetup() {
  setup = { mode: 'both', name: `${(data.app && data.app.name) || 'Claude Skills'} (mine)`, folder: null };
  paintSetupStep1();
}

function setupOutcome() {
  const original = (data.app && data.app.name) || 'Claude Skills';
  if (setup.mode === 'replace') {
    return shortcutRow(original, 'opens your copy from now on') +
      shortcutRow('the downloaded copy', 'left on disk, nothing points at it', true);
  }
  return shortcutRow(original, 'unchanged') +
    shortcutRow(setup.name || `${original} (mine)`, 'new, yours to change');
}

function paintSetupStep1() {
  const original = (data.app && data.app.name) || 'Claude Skills';
  const choice = (mode, heading, text) => `
    <button class="choice" role="radio" data-mode="${mode}" aria-checked="${setup.mode === mode}">
      <span class="radio"></span>
      <span><h6>${heading}</h6><p>${text}</p></span>
    </button>`;

  paintSetup('Modify this app', `
    <p>You'll get your own copy, around 2,000 lines of plain JavaScript with no dependencies,
    and a <code>CLAUDE.md</code> that explains how it works, so Claude Code can start changing it
    straight away.</p>

    <div class="relation">
      <h5>Your skills are never touched</h5>
      <p>They live in <code>~/.claude</code>, not inside the app, so every copy manages the same
      ones. Both copies can run at the same time, because they take separate ports.</p>
    </div>

    <div class="setup-step">
      <div class="step-num">1</div>
      <div class="body">
        <h5>What should happen to this app?</h5>
        <div class="choices" role="radiogroup">
          ${choice('both', 'Keep both',
            'Your copy gets its own name and shortcut. Nothing about this app changes.')}
          ${setup.mode === 'both' ? `
            <div class="name-field attached">
              <label for="copy-name">Name for your copy</label>
              <input id="copy-name" value="${esc(setup.name)}" spellcheck="false" />
            </div>` : ''}
          ${choice('replace', 'Replace this one',
            `Your copy takes over the <strong>${esc(original)}</strong> shortcut and name.`)}
        </div>
        <div class="outcome">
          <div class="head">You'll end up with</div>
          ${setupOutcome()}
        </div>
      </div>
    </div>

    <div class="setup-step later"><div class="step-num">2</div>
      <div class="body"><h5>Choose where it goes</h5></div></div>
    <div class="setup-step later"><div class="step-num">3</div>
      <div class="body"><h5>Open it in Claude Code</h5></div></div>

    <div class="modal-actions">
      <button class="btn ghost" data-close-setup>Close</button>
      <button class="btn primary" id="setup-next">Continue</button>
    </div>`, (modal) => {
    for (const btn of modal.querySelectorAll('[data-mode]')) {
      btn.onclick = () => {
        setup.mode = btn.dataset.mode;
        const typed = document.getElementById('copy-name');
        if (typed) setup.name = typed.value;
        paintSetupStep1();
      };
    }
    const nameInput = document.getElementById('copy-name');
    if (nameInput) {
      nameInput.oninput = () => {
        setup.name = nameInput.value;
        const box = modal.querySelector('.outcome');
        if (box) box.innerHTML = `<div class="head">You'll end up with</div>${setupOutcome()}`;
      };
    }
    document.getElementById('setup-next').onclick = () => {
      if (setup.mode === 'both' && !String(setup.name || '').trim()) {
        return toast('Give your copy a name first.', true);
      }
      paintSetupStep2();
    };
  });
}

function paintSetupStep2() {
  const chosen = setup.folder;

  paintSetup('Modify this app', `
    <div class="setup-step done"><div class="step-num">&#10003;</div>
      <div class="body"><h5>${setup.mode === 'replace'
        ? 'Your copy will replace this one'
        : `Your copy will be called ${esc(setup.name)}`}</h5></div></div>

    <div class="setup-step">
      <div class="step-num">2</div>
      <div class="body">
        <h5>Choose where it goes</h5>
        <p>Pick a folder to put it in. Nothing is written until you do.</p>
        ${chosen ? `<p class="chosen-path">${esc(chosen)}</p>` : ''}
        <button class="btn" id="pick-dest">${chosen ? 'Choose a different folder…' : 'Choose a folder…'}</button>
      </div>
    </div>

    <div class="setup-step later"><div class="step-num">3</div>
      <div class="body"><h5>Open it in Claude Code</h5></div></div>

    <div class="modal-actions">
      <button class="btn ghost" id="setup-back">Back</button>
      <button class="btn primary" id="setup-go" ${chosen ? '' : 'disabled'}>Make my copy</button>
    </div>`, () => {
    document.getElementById('setup-back').onclick = paintSetupStep1;

    document.getElementById('pick-dest').onclick = async () => {
      const btn = document.getElementById('pick-dest');
      btn.disabled = true;
      btn.textContent = 'Choosing…';
      try {
        const picked = await api('/api/choose-folder', {});
        if (picked.unsupported) {
          const typed = prompt('Type the full path of the folder to put your copy in:');
          if (typed && typed.trim()) setup.folder = typed.trim();
        } else if (!picked.cancelled) {
          setup.folder = picked.path;
        }
      } catch (err) {
        toast(err.message, true);
      }
      paintSetupStep2();
    };

    document.getElementById('setup-go').onclick = async () => {
      const go = document.getElementById('setup-go');
      go.disabled = true;
      go.textContent = 'Copying…';
      try {
        const result = await api('/api/fork', {
          into: setup.folder,
          name: setup.mode === 'replace' ? undefined : setup.name,
          mode: setup.mode,
        });
        data = result;
        render({ rebuild: true });
        paintSetupDone(result);
      } catch (err) {
        toast(err.message, true);
        paintSetupStep2();
      }
    };
  });
}

function paintSetupDone(result) {
  const leftover = result.mode === 'replace' && result.original ? `
    <div class="setup-step done"><div class="step-num">&#10003;</div>
      <div class="body">
        <h5>&ldquo;${esc(result.name)}&rdquo; now opens your copy</h5>
        <div class="leftover">
          <h6>The original is still on your disk</h6>
          <code class="path">${esc(result.original.dir)}</code>
          <p>Nothing points at it any more. ${esc(result.original.advice)}</p>
          ${result.original.command ? commandRow(result.original.command) : ''}
          <button class="btn" data-reveal-dir="${esc(result.original.dir)}">Open folder</button>
        </div>
      </div>
    </div>` : '';

  const shortcutNote = result.shortcuts && result.shortcuts.error
    ? `<div class="warn-box"><p><strong>No shortcut was created.</strong>
        ${esc(result.shortcuts.error)}</p></div>`
    : '';

  const step3 = result.claudeOnPath
    ? `<p>Run these in a terminal, then tell Claude what you want to change.</p>
       ${commandRow(`cd "${result.dest}"`)}${commandRow('claude')}`
    : `<div class="warn-box"><p><strong>The <code>claude</code> command isn't on your PATH.</strong>
        If you use the Claude Code app, open the folder above from there. For the terminal,
        install the CLI from <code>claude.com/code</code>, then run <code>claude</code> in that
        folder.</p></div>`;

  paintSetup('Modify this app', `
    <p>Your copy is ready.</p>

    <div class="setup-step done">
      <div class="step-num">&#10003;</div>
      <div class="body">
        <h5>Copied ${result.files} files</h5>
        <p class="chosen-path">${esc(result.dest)}</p>
        <button class="btn" data-reveal-dir="${esc(result.dest)}">Open folder</button>
      </div>
    </div>

    ${leftover}
    ${shortcutNote}

    <div class="setup-step">
      <div class="step-num">${result.mode === 'replace' ? '3' : '2'}</div>
      <div class="body"><h5>Open it in Claude Code</h5>${step3}</div>
    </div>

    <p class="setup-note">
      <strong>Running your copy.</strong> <code>node server.js</code> in that folder, or its
      shortcut. It takes its own port, so it can run alongside this one.${
        result.mode === 'replace'
          ? ' <br /><br /><strong>Changed your mind?</strong> Your copy\'s sidebar has a <em>Your own copy</em> card that puts the original shortcut back.'
          : ''
      }
    </p>

    <div class="modal-actions">
      <button class="btn primary" data-close-setup>Done</button>
    </div>`, (modal) => {
    for (const btn of modal.querySelectorAll('[data-reveal-dir]')) {
      btn.onclick = () =>
        api('/api/reveal-path', { path: btn.dataset.revealDir }).catch((e) => toast(e.message, true));
    }
  });
}

/* ------------------------------------------------------- manage: undoing */

function openManage() {
  const copy = data.app.copy;
  const original = (copy.original && copy.original.name) || 'Claude Skills';

  // What this copy currently is decides what can sensibly be done to it, so the
  // two states offer different things rather than one list where half of it
  // doesn't apply.
  const tookOver = copy.mode === 'replace';
  let action = tookOver ? 'giveBack' : 'rename';
  let keepShortcut = true;

  // A copy holding the original's name needs a different one the moment it
  // stops holding it, or the two shortcuts would be indistinguishable.
  let name = copy.name === original ? `${original} (mine)` : copy.name;

  // Recomputed on demand rather than captured, so typing a new name updates the
  // preview instead of showing what it said when the dialog opened.
  const outcomeHtml = () => {
    if (action === 'giveBack') {
      return shortcutRow(original, 'the original again') +
        (keepShortcut
          ? shortcutRow(name, 'your copy')
          : shortcutRow(copy.name, 'no shortcut, and the folder stays where it is', true));
    }
    if (action === 'takeover') {
      return shortcutRow(original, 'opens your copy from now on') +
        shortcutRow(copy.name, 'folded into the name above', true);
    }
    return shortcutRow(name, 'your copy, renamed') + shortcutRow(original, 'unchanged');
  };

  const paint = () => {
    const naming = action === 'rename' || (action === 'giveBack' && keepShortcut);
    const clash = naming && name.trim() === original;

    const choice = (key, heading, text) => `
      <button class="choice" role="radio" data-action="${key}" aria-checked="${action === key}">
        <span class="radio"></span>
        <span><h6>${heading}</h6><p>${text}</p></span>
      </button>`;

    // The name field belongs immediately under whichever option it applies to,
    // not below the group, because otherwise it reads as though it governs all of them.
    const nameField = `
      <div class="name-field attached">
        <label for="manage-name">Name for your copy</label>
        <input id="manage-name" value="${esc(name)}" spellcheck="false" />
        ${clash ? `<p class="name-clash">That's the original's name. Pick a different one.</p>` : ''}
      </div>`;

    // One action with a modifier when this copy took the original's name: the
    // only real question is whether the copy keeps a shortcut of its own, and
    // that is a checkbox, not a second radio button.
    const body = tookOver
      ? `<h5 style="margin:0 0 4px;font-size:13px">Give the name back to the original</h5>
         <p style="margin:0 0 12px;font-size:12.5px;color:var(--text-dim)">
           <strong>${esc(original)}</strong> will open the original app again.</p>
         <div class="choices">
           <label class="choice" aria-checked="${keepShortcut}" style="cursor:pointer">
             <input type="checkbox" id="keep-shortcut" ${keepShortcut ? 'checked' : ''}
                    style="margin:3px 0 0" />
             <span><h6>Give my copy its own shortcut</h6>
             <p>Otherwise it keeps none, and you launch it with <code>node server.js</code>.
             Either way the folder stays exactly where it is.</p></span>
           </label>
           ${keepShortcut ? nameField : ''}
         </div>`
      : `<div class="choices" role="radiogroup">
           ${choice('rename', 'Rename my copy', 'Call it something else. The original is untouched.')}
           ${action === 'rename' ? nameField : ''}
           ${choice('takeover', 'Make mine the main one',
             `Your copy takes over the <strong>${esc(original)}</strong> shortcut and name, and the original keeps none.`)}
         </div>`;

    paintSetup('Your own copy', `
      <p>You're running the copy at <code>${esc((data.app && data.app.dir) || '')}</code>
      under the name <strong>${esc(copy.name)}</strong>.</p>

      ${body}

      <div class="outcome">
        <div class="head">You'll end up with</div>
        ${outcomeHtml()}
      </div>

      <div class="modal-actions">
        <button class="btn ghost" data-close-setup>Cancel</button>
        <button class="btn primary" id="manage-apply" ${clash ? 'disabled' : ''}>Apply</button>
      </div>`, (modal) => {
      for (const btn of modal.querySelectorAll('[data-action]')) {
        btn.onclick = () => {
          const typed = document.getElementById('manage-name');
          if (typed) name = typed.value;
          action = btn.dataset.action;
          paint();
        };
      }

      const keep = document.getElementById('keep-shortcut');
      if (keep) {
        keep.onchange = () => {
          keepShortcut = keep.checked;
          paint();
        };
      }
      const input = document.getElementById('manage-name');
      if (input) {
        // Updated in place rather than by repainting, which would move the
        // caret out from under whoever is typing.
        input.oninput = () => {
          name = input.value;
          const box = modal.querySelector('.outcome');
          if (box) box.innerHTML = `<div class="head">You'll end up with</div>${outcomeHtml()}`;

          const bad = name.trim() === original;
          const apply = document.getElementById('manage-apply');
          if (apply) apply.disabled = bad;

          let warn = modal.querySelector('.name-clash');
          if (bad && !warn) {
            warn = document.createElement('p');
            warn.className = 'name-clash';
            warn.textContent = "That's the original's name. Pick a different one.";
            input.after(warn);
          } else if (!bad && warn) {
            warn.remove();
          }
        };
      }
      document.getElementById('manage-apply').onclick = async () => {
        const btn = document.getElementById('manage-apply');
        btn.disabled = true;
        btn.textContent = 'Applying…';
        try {
          data = await api('/api/fork/manage', { action, name, keepShortcut });
          render({ rebuild: true });
          closeSetup();
          toast('Shortcuts updated.');
        } catch (err) {
          toast(err.message, true);
          paint();
        }
      };
    });
  };

  paint();
}

function renderMain() {
  const title = document.getElementById('view-title');
  const content = document.getElementById('content');
  placedGroups = new Map();

  if (view === 'trash') {
    title.textContent = 'Removed skills';

    // Each removed skill remembers the folder it came from, so restore and
    // delete land in the right place in either scope.
    const entries =
      scope === 'projects'
        ? data.projects.flatMap((p) => p.trash.map((t) => ({ ...t, projectDir: p.dir, projectName: p.name })))
        : data.trash.map((t) => ({ ...t, projectDir: null, projectName: null }));

    const count = `${entries.length} removed skill${entries.length === 1 ? '' : 's'}`;
    content.innerHTML = explainer('trash', count) + (entries.length
      ? entries
          .map(
            (t) => `
        <div class="trash-row">
          <div>
            <div class="card-name">${esc(t.name)}</div>
            <div class="card-meta">
              <span>removed ${esc(new Date(t.removedAt).toLocaleString())}</span>
              ${t.projectName ? `<span>in ${esc(t.projectName)}</span>` : ''}
            </div>
          </div>
          <div class="card-links">
            <button class="link-btn" data-restore="${esc(t.id)}" data-dir="${esc(t.projectDir || '')}" ${t.canRestore ? '' : 'disabled title="A skill with this name exists again"'}>Restore</button>
            <button class="link-btn danger" data-purge="${esc(t.id)}" data-dir="${esc(t.projectDir || '')}">Delete forever</button>
          </div>
        </div>`
          )
          .join('')
      : '<div class="empty">Nothing removed. Skills you remove land here first.</div>');

    for (const b of content.querySelectorAll('[data-restore]')) {
      b.onclick = async () => {
        if (busy) return;
        busy = true;
        try {
          const target = b.dataset.dir ? { projectDir: b.dataset.dir } : {};
          data = await api('/api/restore', { id: b.dataset.restore, ...target });
          render({ rebuild: true });
          toast('Skill restored.');
        } catch (err) {
          toast(err.message, true);
        } finally {
          busy = false;
        }
      };
    }

    for (const b of content.querySelectorAll('[data-purge]')) {
      b.onclick = async () => {
        const id = b.dataset.purge;
        const ok = await confirmDialog(
          'Delete forever?',
          `<code>${esc(id)}</code> will be erased from disk. This is the one action here that
           <strong>cannot</strong> be undone.`,
          'Delete forever'
        );
        if (!ok || busy) return;
        busy = true;
        try {
          const target = b.dataset.dir ? { projectDir: b.dataset.dir } : {};
          data = await api('/api/purge', { id, ...target });
          // Any history entry referencing this folder can no longer be replayed.
          if (history.stack.some((e) => e.kind === 'trash' && e.id === id)) {
            history.stack = [];
            history.index = -1;
            saveHistory();
            toast('Deleted. Undo history cleared.');
          } else {
            toast('Deleted.');
          }
          render({ rebuild: true });
        } catch (err) {
          toast(err.message, true);
        } finally {
          busy = false;
        }
      };
    }
    wireExplainer();
    return;
  }

  const all = scopeSkills();
  const visible = all.filter(matches);
  const inView = view === 'all' ? visible : visible.filter((s) => s.behavior.group === view);

  const activeView = VIEWS.find((v) => v.key === view);
  title.textContent = query ? `“${query}”` : activeView.label;

  // The description belongs to the view, so it stays put even while searching.
  const countText =
    scope === 'projects'
      ? `${inView.length} of ${all.length} skills in ${data.projects.length} folder${data.projects.length === 1 ? '' : 's'}`
      : `${inView.length} of ${all.length} skills`;
  const intro = explainer(view, countText);

  if (!inView.length) {
    content.innerHTML = intro + emptyMessage();
    wireExplainer();
    return;
  }

  if (scope === 'projects') {
    // Grouped by folder: when you're looking at project skills, the folder is
    // the thing you care about. The sidebar filter still narrows across all.
    content.innerHTML = intro + data.projects.map((project) => {
      const rows = sorted(inView.filter((s) => s.projectDir === project.dir));
      if (!rows.length) return '';
      for (const s of rows) placedGroups.set(s.id, view === 'all' ? s.behavior.group : view);
      return `
        <div class="folder-head">
          <span class="folder-name">${esc(project.name)}</span>
          <span class="folder-path" title="${esc(project.dir)}">${esc(project.dir)}</span>
          <span class="count">${rows.length}</span>
          <button class="link-btn" data-open-folder="${esc(project.dir)}">Open</button>
        </div>
        <div class="cards">${rows.map(card).join('')}</div>`;
    }).join('');
  } else if (view === 'all') {
    // Sorting happens inside each section, so the grouping still reads first.
    content.innerHTML = intro + GROUPS.map((g) => {
      const rows = sorted(inView.filter((s) => s.behavior.group === g.key));
      if (!rows.length) return '';
      for (const s of rows) placedGroups.set(s.id, g.key);
      return `
        <div class="group-head"><span>${esc(g.title)}</span><span class="count">${rows.length}</span><span class="rule"></span></div>
        <div class="cards">${rows.map(card).join('')}</div>`;
    }).join('');
  } else {
    const rows = sorted(inView);
    for (const s of rows) placedGroups.set(s.id, view);
    content.innerHTML = `${intro}<div class="cards">${rows.map(card).join('')}</div>`;
  }

  wireCards();
  wireExplainer();
}

function emptyMessage() {
  if (query) return '<div class="empty">No skills match.</div>';
  if (scope === 'projects' && !data.projects.length) {
    return `<div class="empty">None of the ${data.watchedFolders.length} folders being watched has a
      <code>.claude\\skills</code> folder yet.<br />Use <strong>Add folder</strong> if your skills live
      somewhere Claude Code hasn't opened.</div>`;
  }
  return '<div class="empty">No skills match.</div>';
}

/**
 * Refreshes the cards that are already on screen without touching the order.
 * The list regroups only when you refresh or switch views.
 */
function patchCards() {
  const byId = new Map(scopeSkills().map((s) => [s.id, s]));
  for (const el of document.querySelectorAll('[data-card]')) {
    const skill = byId.get(el.dataset.card);
    if (!skill) {
      el.remove();
      continue;
    }
    el.className = `card${skill.behavior.group === 'off' ? ' is-off' : ''}`;
    el.innerHTML = cardInner(skill);
  }
  wireCards();
}

function cardInner(skill) {
  const tags = [];

  // Where this card sits versus where it now belongs.
  const placed = placedGroups.get(skill.id);
  if (placed && placed !== skill.behavior.group) {
    tags.push(
      `<span class="tag moving" title="Its section updates when you refresh. The setting itself is already saved.">moves to ${esc(GROUP_NAMES[skill.behavior.group])}</span>`
    );
  }

  if (skill.scope === 'project') {
    tags.push(
      skill.shadowsGlobal
        ? `<span class="tag shadows" title="A global skill has this name too. Inside this folder, the project one wins.">overrides global</span>`
        : `<span class="tag project" title="This skill exists only in this folder.">project only</span>`
    );
  }

  if (skill.declaredSlashOnly) {
    tags.push(`<span class="tag locked" title="This skill's own SKILL.md sets disable-model-invocation: true, so Claude never auto-loads it regardless of the setting here.">locked to /</span>`);
  }
  if (skill.declaredNoSlash) {
    tags.push(`<span class="tag locked" title="SKILL.md sets user-invocable: false, so it does not appear in the / menu.">no /command</span>`);
  }
  if (skill.nameMismatch) {
    tags.push(`<span class="tag warn" title="Frontmatter says name: ${esc(skill.declaredName)} but the folder is ${esc(skill.name)}. Settings match the folder name.">name mismatch</span>`);
  }
  if (skill.missingDescription) {
    tags.push(`<span class="tag warn" title="Without a description Claude has little to go on when deciding to use this skill.">no description</span>`);
  }

  const segments = STATES.map((s) => {
    const blocked = skill.unavailableStates.includes(s.value);
    const reason = skill.declaredSlashOnly
      ? `Not available: this skill's SKILL.md sets disable-model-invocation: true, so Claude can never auto-load it. Edit the SKILL.md to change that.`
      : `Not available: this skill's SKILL.md sets user-invocable: false, so it has no /command.`;
    return `<button data-state="${s.value}" data-skill="${esc(skill.id)}"
              aria-pressed="${skill.displayState === s.value}"
              ${blocked ? 'disabled' : ''}
              title="${esc(blocked ? reason : s.hint)}">${esc(s.label)}</button>`;
  }).join('');

  return `
      <div class="card-main">
        <div class="card-title">
          <span class="card-name">/${esc(skill.name)}</span>
          ${tags.join('')}
        </div>
        <p class="card-desc">${esc(skill.description) || '<em>No description.</em>'}</p>
        <div class="card-meta">
          <span>${skill.files} file${skill.files === 1 ? '' : 's'}</span>
          <span>${(skill.bytes / 1024).toFixed(1)} KB</span>
          ${skill.installedAt
            ? `<span title="When this skill's folder appeared in your skills directory">added ${esc(shortDate(skill.installedAt))}</span>`
            : ''}
          ${sortBy === 'updated-desc' && skill.updatedAt
            ? `<span title="Most recently modified file in this skill">changed ${esc(shortDate(skill.updatedAt))}</span>`
            : ''}
          ${skill.allowedTools ? `<span>tools: ${esc(skill.allowedTools)}</span>` : ''}
        </div>
      </div>
      <div class="card-side">
        <div class="segments">${segments}</div>
        <div class="card-links">
          <button class="link-btn" data-doc="${esc(skill.id)}">View</button>
          <button class="link-btn" data-reveal="${esc(skill.id)}">Folder</button>
          <button class="link-btn danger" data-remove="${esc(skill.id)}">Remove</button>
        </div>
      </div>`;
}

function card(skill) {
  return `<article class="card${skill.behavior.group === 'off' ? ' is-off' : ''}" data-card="${esc(skill.id)}">${cardInner(skill)}</article>`;
}

const findSkill = (id) => scopeSkills().find((s) => s.id === id);

function wireCards() {
  for (const btn of document.querySelectorAll('.segments button')) {
    btn.onclick = () => {
      if (btn.disabled || btn.getAttribute('aria-pressed') === 'true') return;
      const skill = findSkill(btn.dataset.skill);
      if (!skill) return;
      const state = btn.dataset.state;
      const where = skill.projectName ? ` (${skill.projectName})` : '';
      run({
        kind: 'overrides',
        // Labelled with what the user sees, not the raw settings.json value.
        label: `${skill.name}${where}: ${stateLabel(skill.displayState)} → ${stateLabel(state)}`,
        before: { [skill.name]: skill.state },
        after: { [skill.name]: state },
        projectDir: skill.projectDir || undefined,
      });
    };
  }

  for (const btn of document.querySelectorAll('[data-doc]')) {
    btn.onclick = async () => {
      const skill = findSkill(btn.dataset.doc);
      if (!skill) return;
      try {
        const doc = await api('/api/doc', { name: skill.name, ...skillTarget(skill) });
        document.getElementById('drawer-title').textContent = `/${doc.name}`;
        document.getElementById('drawer-sub').textContent = skill.file;
        document.getElementById('drawer-body').textContent = doc.text;
        document.getElementById('drawer').hidden = false;
      } catch (err) {
        toast(err.message, true);
      }
    };
  }

  for (const btn of document.querySelectorAll('[data-reveal]')) {
    btn.onclick = () => {
      const skill = findSkill(btn.dataset.reveal);
      if (!skill) return;
      api('/api/reveal', { what: skill.name, ...skillTarget(skill) }).catch((e) => toast(e.message, true));
    };
  }

  for (const btn of document.querySelectorAll('[data-open-folder]')) {
    btn.onclick = () =>
      api('/api/reveal', { what: 'skills', projectDir: btn.dataset.openFolder }).catch((e) => toast(e.message, true));
  }

  for (const btn of document.querySelectorAll('[data-remove]')) {
    btn.onclick = async () => {
      const skill = findSkill(btn.dataset.remove);
      if (!skill) return;
      const trashPath = skill.projectDir
        ? `${skill.projectName}\\.claude\\skills-trash`
        : '~/.claude/skills-trash';
      const ok = await confirmDialog(
        `Remove /${skill.name}?`,
        `The folder moves to <code>${esc(trashPath)}</code>. Nothing is erased. Undo brings it straight back, or
         restore it from <strong>Removed</strong> in the sidebar. If you only want Claude to stop using it,
         choose <code>Off</code> instead.`,
        'Move to Removed'
      );
      if (!ok) return;
      run(
        {
          kind: 'trash',
          label: `Remove ${skill.name}`,
          name: skill.name,
          prevState: skill.state,
          projectDir: skill.projectDir || undefined,
        },
        { rebuild: true, message: `${skill.name} moved to Removed.` }
      );
    };
  }
}

/* ----------------------------------------------------------------- chrome */

document.getElementById('undo').onclick = () => step('back');
document.getElementById('redo').onclick = () => step('forward');

document.getElementById('search').addEventListener('input', (e) => {
  query = e.target.value.trim();
  renderMain();
});

document.getElementById('refresh').onclick = () => load().then((ok) => ok && toast(FRESH));

document.getElementById('quit').onclick = async () => {
  const ok = await confirmDialog(
    'Quit Claude Skills?',
    'The app stops running. Your settings are already saved, so nothing is lost. Launch it again any time.',
    'Quit'
  );
  if (!ok) return;
  quitting = true;
  try {
    await api('/api/quit', {});
  } catch {
    /* the server goes away mid-reply; that is the expected outcome */
  }
  document.body.innerHTML =
    '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-dim);font-size:14px">' +
    'Claude Skills has stopped. You can close this tab.</div>';
};

const drawer = document.getElementById('drawer');
document.getElementById('drawer-close').onclick = () => (drawer.hidden = true);
drawer.onclick = (e) => { if (e.target === drawer) drawer.hidden = true; };

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    drawer.hidden = true;
    document.getElementById('modal').hidden = true;
    return;
  }
  if (e.ctrlKey && !e.altKey) {
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) { e.preventDefault(); step('back'); return; }
    if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); step('forward'); return; }
  }
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
    e.preventDefault();
    document.getElementById('search').focus();
  }
});

/* ----------------------------------------------------------- window shape */

// Chrome will not restore the size and position of a window opened with --app:
// it writes the placement down and then never reads it back, because an ad-hoc
// app window has no installed app to attach the record to. What it does allow,
// uniquely for these windows, is the page resizing itself. So the app measures
// its own window, hands the numbers to the server, and puts itself back the
// same shape next time.
//
// Only an app window can do this. A tab has no window of its own to speak of,
// and Chrome refuses resizeTo on an ordinary browser window, which is why the
// setting says this of the app window option alone.

// A maximized window's frame hangs off every edge of the work area by a border
// width, so both the saved size and the clamp have to allow for going slightly
// past the screen. Clamping to the work area is what left a restored window
// looking almost, but not quite, maximized.
const OVERHANG = 16;

// Versioned, because a shape cached before this key existed has no record of
// whether the window was maximized, and restoring it as a plain size would
// undo the maximize the desktop was just asked for.
const SHAPE_KEY = 'claude-skills-window-shape-2';

// Whether this page has a window to call its own. Taken from the setting the
// app was launched under rather than sniffed from the window, because the
// browser reports an app window as an ordinary one and there is no property
// that reliably tells them apart.
const ownsWindow = () => Boolean(data && data.launch && data.launch.mode === 'app');

/** The window as it is now, or null when there is nothing meaningful to record. */
function currentShape() {
  const width = Math.round(window.outerWidth);
  const height = Math.round(window.outerHeight);
  if (!width || !height) return null;
  return {
    width,
    height,
    left: Math.round(window.screenX),
    top: Math.round(window.screenY),
    // Filling the work area is what a maximized window looks like from in here.
    // The page cannot see the frame's overhang past it and so cannot reproduce
    // it, which is why this is a flag for the launcher rather than a size.
    maximized: width >= screen.availWidth - 12 && height >= screen.availHeight - 12,
  };
}

let lastReported = '';

function reportShape(viaBeacon) {
  if (!ownsWindow()) return;
  const shape = currentShape();
  if (!shape) return;

  const body = JSON.stringify(shape);
  if (!viaBeacon && body === lastReported) return;
  lastReported = body;

  // Kept here as well as on the server, so the next launch can put the window
  // right without waiting for a reply first. The server's copy is the durable
  // one; this is only ever a head start.
  try {
    localStorage.setItem(SHAPE_KEY, body);
  } catch {
    /* a browser refusing storage still has a server to fall back on */
  }

  if (viaBeacon) {
    // The last word on the way out, and the only one that catches a resize
    // made in the seconds before closing.
    navigator.sendBeacon(`/api/shape?token=${TOKEN}`, new Blob([body], { type: 'application/json' }));
    return;
  }
  fetch(`/api/shape?token=${TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-skills-token': TOKEN },
    body,
  }).catch(() => {});
}

/**
 * The two calls cannot go together. A window that has only just opened is
 * still settling into the size the browser gave it, and a move issued in the
 * same task lands somewhere else entirely: asking for y=180 while the window
 * is still 1060 tall puts it at y=20, where a 1060-tall window has to sit to
 * fit the screen. So the move waits for the resize to take, and then checks
 * its own work once.
 */
function place(left, top, width, height) {
  window.resizeTo(width, height);
  setTimeout(() => {
    window.moveTo(left, top);
    setTimeout(() => {
      const off = Math.abs(window.screenX - left) > 2 || Math.abs(window.screenY - top) > 2;
      // One correction, never a loop: a window manager that refuses the second
      // attempt would refuse the hundredth.
      if (off) {
        window.resizeTo(width, height);
        window.moveTo(left, top);
      }
    }, 220);
  }, 140);
}

/**
 * Puts the window back the shape it was left. The saved numbers are used as
 * they stand, rather than being recognised as "maximized" and swapped for the
 * work area, because those are not the same rectangle and the difference shows.
 */
function applyShape(shape) {
  if (!shape || !shape.width || !shape.height) return;
  // A maximized window is filled in twice. This is the near miss, and it is
  // instant: the work area is every pixel a page can reach, which leaves the
  // window a frame's width short of a real maximize on each edge. The desktop
  // is asked for the real thing at the same time and takes a few seconds to
  // answer, because it costs a process and a compile to ask. Doing both means
  // the window is the right size straight away and exactly right shortly
  // after, rather than sitting at the browser's default in the meantime.
  if (shape.maximized) {
    // Done in one go, with none of place()'s deferred correction. That
    // correction exists to fight a window that has not settled yet, but here
    // it would be fighting the desktop instead: the real maximize lands a
    // moment later, and a late resizeTo would take the window straight back
    // out of it. Filling the work area now is only a stand-in until it does.
    window.resizeTo(screen.availWidth, screen.availHeight);
    window.moveTo(screen.availLeft || 0, screen.availTop || 0);
    return;
  }
  try {
    const width = Math.min(shape.width, screen.width + OVERHANG * 2);
    const height = Math.min(shape.height, screen.height + OVERHANG * 2);
    // Enough of the window has to land on the screen in front of the user for
    // it to be reachable, which a shape saved on a monitor since unplugged
    // would not manage on its own.
    place(
      Math.max(-OVERHANG, Math.min(shape.left, screen.availWidth - 120)),
      Math.max(-OVERHANG, Math.min(shape.top, screen.availHeight - 120)),
      width,
      height
    );
  } catch {
    /* A browser that refuses is a browser that keeps its own shape. */
  }
}

let shapeRestored = false;
let maximizeAsked = false;

/**
 * Done once per page, as early as there is anything to go on. The window opens
 * at a size the browser chose and only a script in the page can change it, so
 * some of that first shape is always visible: this is about making it brief
 * rather than making it disappear.
 */
function restoreShapeEarly() {
  let cached = null;
  try {
    cached = JSON.parse(localStorage.getItem(SHAPE_KEY));
  } catch {
    /* ignore */
  }
  // Only ever written by a session that had a window of its own, so its
  // presence is the signal. In a tab the browser refuses the resize anyway.
  if (!cached) return;
  shapeRestored = true;
  applyShape(cached);
}

/* -------------------------------------------------------------- heartbeat */

// The server exits when nothing is watching, so a closed tab never leaves a
// hidden process behind. These two keep it informed.
let quitting = false;

setInterval(() => {
  if (quitting) return;
  fetch(`/api/ping?token=${TOKEN}`).catch(() => {});
  // Rides along with the heartbeat rather than on a timer of its own, and only
  // says anything when the shape actually changed. Without this, a window
  // closed in a way that loses the beacon would forget the last resize.
  reportShape(false);
}, 25_000);

// Browsers throttle timers in background tabs, so check in on the way back.
addEventListener('visibilitychange', () => {
  if (!document.hidden && !quitting) fetch(`/api/ping?token=${TOKEN}`).catch(() => {});
});

addEventListener('pagehide', () => {
  if (quitting) return;
  // sendBeacon survives the page going away; a normal fetch would be cancelled.
  // A reload checks straight back in, so the server only acts on a real close.
  reportShape(true);
  navigator.sendBeacon(`/api/bye?token=${TOKEN}`);
});

restoreShapeEarly();
loadHistory();

// A browser reload and the Refresh button do the same work, so say the same
// thing. Navigation Timing tells the two kinds of page load apart.
load().then((ok) => {
  if (!ok) return;
  const nav = performance.getEntriesByType('navigation')[0];
  toast(nav && nav.type === 'reload' ? FRESH : 'Your latest settings are loaded from disk.');

  // The page asks, rather than the server checking on its own, so the app never
  // reaches the network with nobody looking at it. The route does nothing
  // unless the user opted in and a day has gone by, which is what makes it safe
  // to call on every load.
  if (data.update && data.update.autoCheck) {
    api('/api/updates/check', { force: false })
      .then((next) => { data = next; render({ rebuild: false }); })
      .catch(() => {});
  }
});
