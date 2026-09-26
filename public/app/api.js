// Local, read-only snapshot adapter for the TEKKWORK frontend preview.
// The original TEKKWORK API executes real Solana actions and must never be
// called from this separately branded demo without its owner's backend setup.
const read = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Demo data unavailable (${response.status})`);
  return response.json();
};

const unavailable = async () => {
  throw new Error('This is a frontend preview. Wallet and transaction actions are not connected.');
};

// Only alias human-readable labels in this saved concept preview. Contract addresses,
// social URLs and token links remain the source snapshot's values.
const demoLabelKeys = new Set(['name', 'ticker', 'symbol', 'agentName', 'coinTicker', 'description', 'goal']);
const demoName = (value) => value.replace(/bagwork/gi, (match) =>
  match === match.toUpperCase() ? 'TEKKWORK' :
  match === match.toLowerCase() ? 'tekkwork' : 'Tekkwork');
function rebrandDemo(value, key = '') {
  if (Array.isArray(value)) return value.map((item) => rebrandDemo(item));
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, rebrandDemo(child, childKey)]));
  return typeof value === 'string' && demoLabelKeys.has(key) ? demoName(value) : value;
}

export async function createApi() {
  const snapshot = rebrandDemo(await read('/demo-state.json'));
  const latestConfig = rebrandDemo(await read('/preview-config.json'));
  const noop = () => () => {};
  return {
    config: {
      ...snapshot.config,
      ...latestConfig,
      preview: true,
      tradingEnabled: false,
      launchEnabled: false,
      contractAddress: '',
      xUrl: '',
      siteUrl: location.origin,
    },
    snapshot,
    onUpdate: noop,
    onTrade: noop,
    onBonded: noop,
    onEvent: noop,
    getAgent: async (id) => {
      const agent = snapshot.agents.find((item) => item.id === id || String(item.no) === String(id));
      return agent ? read(`/demo-agents/${agent.id}.json`).then((detail) => rebrandDemo(detail)).catch(() => null) : null;
    },
    getCustom: async () => null,
    blockhash: unavailable,
    prepareLaunch: unavailable,
    setLaunchImage: unavailable,
    confirmFunding: unavailable,
    deposit: unavailable,
    withdraw: unavailable,
    pause: unavailable,
    setStrategy: unavailable,
    retry: unavailable,
    buySkin: unavailable,
    setSkin: unavailable,
    holdSkin: unavailable,
    saveCustom: unavailable,
  };
}
