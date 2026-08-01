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
  { key: 'auto', title: 'Auto — Claude can load these itself' },
  { key: 'name-only', title: 'Name only — Claude sees the name, not the details' },
  { key: 'slash-only', title: 'Slash only — you invoke these with /name' },
  { key: 'off', title: 'Off — installed but disabled' },
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
    note: `Changes save the moment you click, but Claude Code reads these settings when a session starts — so
           they apply to your <strong>next</strong> session, not one you already have open. Nothing here
           destroys anything: Undo reverses your last action, Off keeps the files in place, and Remove moves a
           skill to a trash folder. Only <strong>Delete forever</strong> erases anything from disk.`,
  },
  auto: {
    summary: 'What “Auto” means',
    body: `Claude sees what these skills do and can reach for one on its own. You just describe your task in
           plain words — no <code>/command</code> needed — and Claude decides whether the skill fits. Typing
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
    body: `These never fire on their own. No matter what you ask for, Claude will not load them — you invoke
           one by typing <code>/name</code> at the <strong>start</strong> of a message.`,
    note: `Two different things land a skill here. Either you chose this setting, or the skill's own
           <code>SKILL.md</code> sets <code>disable-model-invocation: true</code> — those carry a
           <strong>locked to /</strong> tag, and their Auto and Name only buttons are struck through because
           the skill's author ruled them out. Changing that means editing the SKILL.md.`,
  },
  off: {
    summary: 'What “Off” means',
    body: `Switched off completely. Claude cannot load these, and <code>/name</code> will not work either.`,
    note: `The files stay exactly where they are — this only writes a setting, so turning one back on is
           instant and loses nothing.`,
  },
  trash: {
    summary: 'What “Removed” means',
    body: `These folders were moved out of their skills folder and into a <code>skills-trash</code> folder
           beside it. Claude no longer sees them at all.`,
    note: `<strong>Restore</strong> puts one back where it came from, along with the setting it had.
           <strong>Delete forever</strong> erases it from disk — the one action in this app that undo
           cannot reverse.`,
  },
};

// Folded into the description panel so one paragraph always says which set of
// skills you are looking at, whichever page you are on.
const SCOPE_NOTES = {
  global: `You're looking at <strong>global</strong> skills — the ones in your personal skills folder, available
           in every project. Skills that ship with Claude Code aren't listed, since they aren't yours to
           manage here.`,
  projects: `You're looking at <strong>project</strong> skills — ones that live inside a single folder and only
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
    render({ rebuild: true });
    return true;
  } catch (err) {
    document.getElementById('content').innerHTML =
      `<div class="empty">Could not read your skills.<br />${esc(err.message)}</div>`;
    return false;
  }
}

const FRESH = 'Reloaded from disk — everything here is up to date.';

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
 * rather than with <details> because a details element cannot animate open —
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
  renderMaster();
  renderIssues();
  renderCopyCard();
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

function renderMaster() {
  const el = document.getElementById('master');
  const snap = data.snapshot;

  if (snap) {
    const when = new Date(snap.savedAt).toLocaleString();
    el.className = 'master armed';
    el.innerHTML = `
      <h4>Default Claude mode is on</h4>
      <p>Every skill is off. Your previous settings were saved ${esc(when)}.</p>
      <button class="btn primary" id="master-btn">Bring my skills back</button>`;

    document.getElementById('master-btn').onclick = () => {
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
    };
    return;
  }

  el.className = 'master';
  el.innerHTML = `
    <h4>Default Claude mode</h4>
    <p>Turn every global skill off at once to get plain, out-of-the-box Claude. Your current settings are saved
       so you can undo it.${scope === 'projects' ? ' Project skills are left alone.' : ''}</p>
    <button class="btn" id="master-btn">Turn all skills off</button>`;

  document.getElementById('master-btn').onclick = async () => {
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
        // Saving the pre-change states is what makes both routes back —
        // the sidebar button and Undo — able to restore them.
        snapshotForward: { action: 'save', payload: { savedAt: new Date().toISOString(), overrides: before } },
        snapshotBack: { action: 'clear' },
      },
      { rebuild: true, message: 'All skills are off. Claude is running default.' }
    );
  };
}

function renderIssues() {
  const el = document.getElementById('issues');
  const parts = [];

  if (data.orphans.length) {
    parts.push(`
      <div class="issue">
        <strong>${data.orphans.length} setting${data.orphans.length > 1 ? 's' : ''} with no skill</strong>
        <p>${data.orphans.map((o) => `<code>${esc(o.name)}</code>`).join(', ')} — these entries in settings.json
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
  if (heading) heading.textContent = name;
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

function renderCopyCard() {
  const el = document.getElementById('copy-card');
  const copy = data.app && data.app.copy;

  if (!copy) {
    el.className = 'master';
    el.innerHTML = `
      <h4>Modify this app</h4>
      <p>Get your own copy to change in Claude Code.</p>
      <button class="btn" id="copy-btn">Set it up</button>`;
    document.getElementById('copy-btn').onclick = openSetup;
    return;
  }

  const detail = copy.mode === 'replace'
    ? `, and it took over the <span class="mine-name">${esc(copy.name)}</span> shortcut`
    : copy.mode === 'none'
      ? ', which has no shortcut of its own'
      : `, called <span class="mine-name">${esc(copy.name)}</span>`;

  el.className = 'master mine';
  el.innerHTML = `
    <h4>Your own copy</h4>
    <p>You're running your version${detail}.</p>
    <button class="btn" id="copy-btn">Manage</button>`;
  document.getElementById('copy-btn').onclick = openManage;
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
        toast('Could not reach the clipboard — select and copy it by hand.', true);
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
    <p>You'll get your own copy — around 2,000 lines of plain JavaScript with no dependencies —
    and a <code>CLAUDE.md</code> that explains how it works, so Claude Code can start changing it
    straight away.</p>

    <div class="relation">
      <h5>Your skills are never touched</h5>
      <p>They live in <code>~/.claude</code>, not inside the app, so every copy manages the same
      ones. Both copies can run at the same time — they take separate ports.</p>
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
          : shortcutRow(copy.name, 'no shortcut — the folder stays where it is', true));
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
    // not below the group — otherwise it reads as though it governs all of them.
    const nameField = `
      <div class="name-field attached">
        <label for="manage-name">Name for your copy</label>
        <input id="manage-name" value="${esc(name)}" spellcheck="false" />
        ${clash ? `<p class="name-clash">That's the original's name — pick a different one.</p>` : ''}
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
            warn.textContent = "That's the original's name — pick a different one.";
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
    tags.push(`<span class="tag locked" title="SKILL.md sets user-invocable: false — it does not appear in the / menu.">no /command</span>`);
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
        `The folder moves to <code>${esc(trashPath)}</code>. Nothing is erased — undo brings it straight back, or
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
    'The app stops running. Your settings are already saved — nothing is lost. Launch it again any time.',
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

/* -------------------------------------------------------------- heartbeat */

// The server exits when nothing is watching, so a closed tab never leaves a
// hidden process behind. These two keep it informed.
let quitting = false;

setInterval(() => {
  if (!quitting) fetch(`/api/ping?token=${TOKEN}`).catch(() => {});
}, 25_000);

// Browsers throttle timers in background tabs, so check in on the way back.
addEventListener('visibilitychange', () => {
  if (!document.hidden && !quitting) fetch(`/api/ping?token=${TOKEN}`).catch(() => {});
});

addEventListener('pagehide', () => {
  if (quitting) return;
  // sendBeacon survives the page going away; a normal fetch would be cancelled.
  // A reload checks straight back in, so the server only acts on a real close.
  navigator.sendBeacon(`/api/bye?token=${TOKEN}`);
});

loadHistory();

// A browser reload and the Refresh button do the same work, so say the same
// thing. Navigation Timing tells the two kinds of page load apart.
load().then((ok) => {
  if (!ok) return;
  const nav = performance.getEntriesByType('navigation')[0];
  toast(nav && nav.type === 'reload' ? FRESH : 'Your latest settings are loaded from disk.');
});
