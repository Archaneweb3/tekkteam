import './agent-detail.css';

const ROLE_DETAILS = {
  LAUNCHER: { number: '01', specialty: 'Launch direction', tasks: ['Shape the launch brief', 'Turn ideas into a clear sequence', 'Keep the crew aligned'], quote: 'Every strong launch starts with a plan the whole team can see.' },
  WEBSITE: { number: '02', specialty: 'Digital experience', tasks: ['Build the interface', 'Check interaction details', 'Prepare the site for launch'], quote: 'The small details are part of the experience.' },
  DESIGNER: { number: '03', specialty: 'Visual identity', tasks: ['Explore visual directions', 'Create a coherent identity', 'Polish every final pixel'], quote: 'A distinct idea deserves a distinct visual world.' },
  SOCIAL: { number: '04', specialty: 'Story and voice', tasks: ['Find the angle', 'Write social content', 'Keep the voice consistent'], quote: 'Give people something worth talking about.' },
  BUYBACK: { number: '05', specialty: 'Market watch', tasks: ['Monitor market signals', 'Maintain the buyback playbook', 'Surface decisions for review'], quote: 'A good playbook is deliberate, never automatic theater.' },
  ANALYTICS: { number: '06', specialty: 'Signals and insight', tasks: ['Read the data', 'Connect useful patterns', 'Help the team decide what matters'], quote: 'Clarity is the most useful metric.' },
};

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

/**
 * Build the original TEKKTEAM agent profile view.
 * @param {{name:string,role:string,color?:string,accent?:string,icon?:string,description?:string}} agent
 * @returns {HTMLElement}
 */
export function renderAgentDetail(agent) {
  const data = agent || {};
  const role = String(data.role || 'TEAM MEMBER').toUpperCase();
  const detail = ROLE_DETAILS[role] || {
    number: '—', specialty: 'Team member', tasks: ['Explore the role', 'Collaborate with the crew', 'Make the work visible'],
    quote: 'Good work is a team effort.',
  };
  const name = String(data.name || 'Agent');
  const color = /^#[0-9a-f]{3,8}$/i.test(data.color || '') ? data.color : '#8ddac9';
  const accent = /^#[0-9a-f]{3,8}$/i.test(data.accent || '') ? data.accent : color;
  const root = element('section', 'tk-agent-detail');
  root.style.setProperty('--agent-color', color);
  root.style.setProperty('--agent-accent', accent);

  const back = element('a', 'tk-agent-back', '← All agents');
  back.href = '#/agents';
  root.append(back);

  const hero = element('div', 'tk-agent-hero');
  const copy = element('div', 'tk-agent-hero-copy');
  copy.append(element('p', 'tk-agent-eyebrow', `TEKKTEAM / AGENT ${detail.number}`));
  copy.append(element('h1', '', name));
  copy.append(element('p', 'tk-agent-role', role));
  copy.append(element('p', 'tk-agent-lead', data.description || `${name} is part of the TEKKTEAM studio crew.`));
  const tags = element('div', 'tk-agent-tags');
  tags.append(element('span', '', detail.specialty));
  tags.append(element('span', '', 'Voxel studio prototype'));
  copy.append(tags);
  hero.append(copy);

  const portrait = element('div', 'tk-agent-portrait');
  portrait.setAttribute('aria-label', `${name} character preview`);
  portrait.setAttribute('role', 'img');
  const frame = element('div', 'tk-agent-portrait-frame');
  const figure = element('div', 'tk-agent-figure');
  figure.append(element('div', 'tk-agent-figure-hair'));
  const face = element('div', 'tk-agent-figure-face');
  face.append(element('i', ''), element('i', ''));
  figure.append(face, element('div', 'tk-agent-figure-body'), element('div', 'tk-agent-figure-legs'));
  frame.append(figure);
  portrait.append(frame, element('div', 'tk-agent-portrait-caption', 'CHARACTER STUDY / 3D SCENE IN PROGRESS'));
  hero.append(portrait);
  root.append(hero);

  const columns = element('div', 'tk-agent-columns');
  const mission = element('article', 'tk-agent-card');
  mission.append(element('p', 'tk-agent-eyebrow', '01 / THE ROLE'), element('h2', '', `Meet ${name}`));
  mission.append(element('p', 'tk-agent-card-copy', data.description || detail.quote));
  mission.append(element('blockquote', '', detail.quote));
  columns.append(mission);
  const capability = element('article', 'tk-agent-card');
  capability.append(element('p', 'tk-agent-eyebrow', '02 / WHAT THEY DO'), element('h2', '', 'Capabilities'));
  const list = element('ul', 'tk-agent-capabilities');
  detail.tasks.forEach((task, index) => {
    const item = element('li', '');
    item.append(element('span', '', `0${index + 1}`), element('strong', '', task));
    list.append(item);
  });
  capability.append(list);
  columns.append(capability);
  root.append(columns);

  const status = element('aside', 'tk-agent-status');
  status.append(element('span', 'tk-agent-status-light'));
  const statusCopy = element('div', '');
  statusCopy.append(element('strong', '', 'Studio prototype'), element('p', '', 'The interactive 3D crew is being built. Live operations and performance data are not connected.'));
  status.append(statusCopy);
  root.append(status);
  return root;
}
