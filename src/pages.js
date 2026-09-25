import './pages.css';

const CREW = [
  { name: 'Ari', role: 'Launch lead', initials: 'AR', color: '#5e9cff', description: 'Shapes the brief, priorities, and launch timeline.' },
  { name: 'Nox', role: 'Web builder', initials: 'NX', color: '#79a9ef', description: 'Builds the web experience and polishes every interaction.' },
  { name: 'Mika', role: 'Visual designer', initials: 'MK', color: '#a98ce4', description: 'Creates a distinctive visual identity.' },
  { name: 'Rae', role: 'Story & social', initials: 'RA', color: '#e5af70', description: 'Finds the story and voice for each project.' },
  { name: 'Finn', role: 'Operations', initials: 'FN', color: '#82c79b', description: 'Organizes checklists, coordination, and follow-up.' },
  { name: 'Sol', role: 'Insights', initials: 'SL', color: '#e2cc88', description: 'Reads the signals and identifies what to improve.' },
];

const DRAFT_KEY = 'tekkteam:launch-draft:v1';
const el = (tag, className = '', html = '') => {
  const node = document.createElement(tag);
  node.className = className;
  node.innerHTML = html;
  return node;
};

function shell(title, kicker, description) {
  const root = el('section', 'tt-page', `<header class="tt-page-head"><span class="tt-kicker">${kicker}</span><h1>${title}</h1><p>${description}</p></header>`);
  return root;
}

function agentsPage(context) {
  const root = shell('Meet the AI agents.', '01 / AGENT ROLES', 'Each TEKKTEAM AI agent is envisioned for a specialized workflow. The 3D avatars let you explore their roles; live AI execution is not connected in this preview.');
  root.innerHTML += '<div class="tt-tools"><label class="tt-search">Search agents <input type="search" placeholder="Name or role…" aria-label="Search agents"></label><span class="tt-muted">6 AI agent roles · 3D preview</span></div><div class="tt-agent-grid"></div><div class="tt-empty" hidden>No matching agents.</div>';
  const grid = root.querySelector('.tt-agent-grid');
  const items = Array.isArray(context.agents) && context.agents.length ? context.agents : CREW;
  const draw = (query = '') => {
    grid.replaceChildren();
    const matches = items.filter((agent) => `${agent.name} ${agent.role}`.toLowerCase().includes(query.toLowerCase()));
    for (const agent of matches) {
      const card = el('button', 'tt-agent-card', '<span class="tt-avatar"></span><span class="tt-card-copy"><strong></strong><small></small><span></span></span><span class="tt-arrow">↗</span>');
      card.type = 'button';
      card.querySelector('.tt-avatar').textContent = agent.initials || agent.name.slice(0, 2).toUpperCase();
      card.querySelector('.tt-avatar').style.setProperty('--agent-color', agent.color || '#7bdcca');
      card.querySelector('strong').textContent = agent.name;
      card.querySelector('small').textContent = agent.role;
      card.querySelector('.tt-card-copy > span').textContent = agent.description || '';
      card.addEventListener('click', () => {
        if (typeof context.onSelectAgent === 'function') context.onSelectAgent(agent);
        else {
          root.querySelectorAll('.tt-agent-card').forEach((item) => item.classList.remove('selected'));
          card.classList.add('selected');
          root.querySelector('.tt-agent-note').textContent = `${agent.name} — ${agent.description || agent.role}`;
        }
      });
      grid.append(card);
    }
    root.querySelector('.tt-empty').hidden = matches.length > 0;
  };
  root.querySelector('input').addEventListener('input', (event) => draw(event.target.value));
  root.append(el('p', 'tt-agent-note', 'Select a card to view an AI agent profile. On the home page, you can also select its avatar directly in the 3D scene.'));
  draw();
  return root;
}

function tokensPage() {
  const root = shell('Token board.', '02 / RESEARCH', 'A space for token research. No market data provider is connected yet, so this page does not invent prices, charts, percentages, or trading activity.');
  root.innerHTML += `<div class="tt-data-empty"><span class="tt-orbit" aria-hidden="true">◈</span><div><span class="tt-kicker">DATA CONNECTION: OFF</span><h2>No live market data yet.</h2><p>Once a data source is chosen, this page can show price, liquidity, volume, token age, and a clear last-updated time.</p></div></div><div class="tt-info-grid"><article><span>01</span><h3>Verified source</h3><p>Market data should come from a named API, with attribution and a link to its source.</p></article><article><span>02</span><h3>Real timestamps</h3><p>Show when data was updated and when loading fails, instead of numbers that only appear live.</p></article><article><span>03</span><h3>Research, not trades</h3><p>This prototype does not provide buy or sell signals or execute trades.</p></article></div>`;
  return root;
}

function launchPage() {
  const root = shell('Shape your launch.', '03 / AGENT BRIEF', 'Prepare a brief for the planned Launch AI agent. This form only saves a draft in your browser; no agent workflow, coin, wallet, or transaction starts yet.');
  root.innerHTML += `<div class="tt-launch-layout"><form class="tt-form"><div class="tt-form-section"><span class="tt-step">01</span><div><h2>Project identity</h2><p>Start with a clear name and a one-line direction.</p></div></div><label>Project name <input name="project" maxlength="60" required placeholder="For example: Orbit Club"></label><label>Tagline <input name="tagline" maxlength="100" placeholder="One sentence about your idea"></label><label>Description <textarea name="description" maxlength="500" rows="5" placeholder="What would you like to build?"></textarea></label><div class="tt-form-section"><span class="tt-step">02</span><div><h2>Team priorities</h2><p>Choose a first focus. You can change it later.</p></div></div><label>Primary focus <select name="focus"><option value="website">Website & digital experience</option><option value="visual">Visual identity</option><option value="social">Story & social content</option><option value="launch">Launch plan</option></select></label><div class="tt-form-actions"><button class="tt-primary" type="submit">Save local draft</button><button class="tt-secondary" type="button" data-action="clear">Clear</button></div><p class="tt-form-status" role="status" aria-live="polite">Not saved yet.</p></form><aside class="tt-summary"><span class="tt-kicker">DRAFT / NO TRANSACTION</span><h2>Project brief</h2><dl><div><dt>Name</dt><dd data-preview="project">Not entered</dd></div><div><dt>Tagline</dt><dd data-preview="tagline">Not entered</dd></div><div><dt>Focus</dt><dd data-preview="focus">Website & digital experience</dd></div></dl><p>Saved only in this browser's localStorage. Nothing is sent to a server or used to create an agent.</p></aside></div>`;
  const form = root.querySelector('form');
  const status = root.querySelector('.tt-form-status');
  const updatePreview = () => {
    for (const field of ['project', 'tagline']) root.querySelector(`[data-preview="${field}"]`).textContent = form.elements[field].value.trim() || 'Not entered';
    root.querySelector('[data-preview="focus"]').textContent = form.elements.focus.selectedOptions[0].textContent;
  };
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    if (draft && typeof draft === 'object') {
      for (const field of ['project', 'tagline', 'description', 'focus']) if (typeof draft[field] === 'string' && form.elements[field]) form.elements[field].value = draft[field];
      status.textContent = 'Previous local draft loaded.';
    }
  } catch { status.textContent = 'Previous draft could not be read.'; }
  updatePreview();
  form.addEventListener('input', updatePreview);
  form.addEventListener('change', updatePreview);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const draft = Object.fromEntries(new FormData(form).entries());
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); status.textContent = 'Draft saved in this browser.'; }
    catch { status.textContent = 'Browser storage is unavailable. Copy the form contents if you want to keep them.'; }
  });
  root.querySelector('[data-action="clear"]').addEventListener('click', () => {
    form.reset();
    localStorage.removeItem(DRAFT_KEY);
    updatePreview();
    status.textContent = 'Form and local draft cleared.';
  });
  return root;
}

function skinsPage() {
  const root = shell('Find your look.', '04 / AGENT AVATARS', 'Explore visual styles for the TEKKTEAM AI agent avatars. This is a concept gallery, not a store; there are no payments or owned skins.');
  root.innerHTML += `<div class="tt-skin-grid"><button type="button" class="tt-skin-card selected" data-skin="Studio Classic" data-variant="circuit"><span class="tt-skin-card-viewer" aria-label="Studio Classic 3D character preview"></span><strong>Studio Classic</strong><small>Creative uniform · drag to turn</small></button><button type="button" class="tt-skin-card" data-skin="Night Shift" data-variant="ember"><span class="tt-skin-card-viewer" aria-label="Night Shift 3D character preview"></span><strong>Night Shift</strong><small>After-hours operations · drag to turn</small></button><button type="button" class="tt-skin-card" data-skin="Field Notes" data-variant="field"><span class="tt-skin-card-viewer" aria-label="Field Notes 3D character preview"></span><strong>Field Notes</strong><small>On-site exploration · drag to turn</small></button></div><p class="tt-skin-choice" role="status">Selected concept: Studio Classic. Preview only.</p>`;
  root.querySelectorAll('.tt-skin-card').forEach((button) => button.addEventListener('click', () => {
    root.querySelectorAll('.tt-skin-card').forEach((item) => item.classList.remove('selected'));
    button.classList.add('selected');
    root.querySelector('.tt-skin-choice').textContent = `Selected concept: ${button.dataset.skin}. Preview only.`;
  }));
  return root;
}

function howPage() {
  const root = shell('How TEKKTEAM works.', '05 / THE AGENT CONCEPT', 'TEKKTEAM is designed around specialized AI agents. This preview lets you explore their roles in 3D and draft a brief; automated workflows are not active yet.');
  root.innerHTML += `<div class="tt-process"><article><span>01</span><h2>Explore the agent world</h2><p>Orbit the camera and select an avatar. The 3D studio represents where each specialized AI agent would work.</p></article><article><span>02</span><h2>Understand the roles</h2><p>Visit Agents to explore planned workflows for launch, web, design, social content, buyback strategy, and analytics.</p></article><article><span>03</span><h2>Shape a brief</h2><p>Use Launch to save initial instructions locally. It does not submit a task to an AI agent yet.</p></article><article><span>04</span><h2>Connect real workflows</h2><p>AI execution, accounts, live data, and approval controls require backend integration and a security review.</p></article></div><div class="tt-data-empty compact"><div><span class="tt-kicker">PROTOTYPE BOUNDARY</span><h2>What works today?</h2><p>3D agent avatars, role profiles, navigation, and local draft storage. AI task execution, live token prices, wallets, coin launches, and trading are not available in this preview.</p></div></div>`;
  return root;
}

function postPage() {
  const root = shell('Write the next post.', '06 / SOCIAL DRAFT', 'Write a short draft for your project. This page is not connected to X and will never publish automatically.');
  root.innerHTML += '<div class="tt-launch-layout"><div class="tt-form"><div class="tt-form-section"><span class="tt-step">✎</span><div><h2>Social composer</h2><p>Find the right tone before sharing it yourself.</p></div></div><label>Post draft <textarea class="tt-post-input" maxlength="280" rows="7" placeholder="What would you like to say?"></textarea></label><div class="tt-form-actions"><button class="tt-primary tt-copy-post" type="button">Copy text</button><span class="tt-post-count">0 / 280</span></div><p class="tt-form-status" role="status" aria-live="polite">This draft stays on this page.</p></div><aside class="tt-summary"><span class="tt-kicker">NO ACCOUNT CONNECTION</span><h2>Your voice, your call.</h2><p>This tool only helps you write. It does not request account access, send drafts to a server, or claim any social-media results.</p></aside></div>';
  const input=root.querySelector('.tt-post-input');
  const count=root.querySelector('.tt-post-count');
  const status=root.querySelector('.tt-form-status');
  input.addEventListener('input',()=>{count.textContent=`${input.value.length} / 280`});
  root.querySelector('.tt-copy-post').addEventListener('click',async()=>{
    if(!input.value.trim()){status.textContent='Write a draft first.';return}
    try{await navigator.clipboard.writeText(input.value);status.textContent='Draft copied. Nothing has been posted.'}
    catch{status.textContent='Clipboard unavailable. Select and copy the text manually.'}
  });
  return root;
}

/**
 * Render one TEKKTEAM subpage as a detached DOM element.
 * @param {string} route - `/agents`, `/tokens`, `/launch`, `/skins`, `/how` (hash prefixes accepted).
 * @param {{agents?: Array<object>, onSelectAgent?: (agent: object) => void}} [context]
 * @returns {HTMLElement|null} Caller owns mounting and replacement; null means an unknown route.
 *
 * The module intentionally has no market, wallet or transaction adapters: those
 * require a separate, explicitly approved product and security design.
 */
export function renderPage(route, context = {}) {
  const key = String(route || '').replace(/^#/, '').replace(/\/$/, '') || '/';
  if (key === '/agents') return agentsPage(context);
  if (key === '/tokens') return tokensPage();
  if (key === '/launch') return launchPage();
  if (key === '/skins') return skinsPage();
  if (key === '/how') return howPage();
  if (key === '/post') return postPage();
  return null;
}
