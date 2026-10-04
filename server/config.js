import { networkConfig } from '../src/networks.js';
export const strategies = [
  { id: 'balanced', name: 'Balanced', description: 'A measured profile with conservative position limits.', maxPositionPct: 10 },
  { id: 'momentum', name: 'Momentum', description: 'Broader movement and activity filters; shared position limits.', maxPositionPct: 10 },
  { id: 'selective', name: 'Selective', description: 'Stricter activity and liquidity filters; shared position limits.', maxPositionPct: 10 },
];
export const characters = [
  { id: 'frank', name: 'Felix Builder', role: 'Build with intention', color: '#548dff' },
  { id: 'cupsey', name: 'Nora Signal', role: 'Find the signal', color: '#5dddcf' },
  { id: 'fomy', name: 'Otto Analyst', role: 'Make data legible', color: '#ae90ff' },
  { id: 'alon', name: 'Theo Scout', role: 'Explore what is next', color: '#69c5ed' },
  { id: 'satoshi', name: 'Hugo Director', role: 'Keep the big picture', color: '#edbe68' },
  { id: 'diamond', name: 'Luca Prism', role: 'See another angle', color: '#b0d9ff' },
];
export function publicConfig(network) {
  return {
    brand: 'TEKKTEAM', network, preview: false, backendOnline: true,
    networkConfig: ['devnet','mainnet'].includes(network) ? networkConfig(network) : null,
    mainnetSafetyMode: network === 'mainnet', broadcastEnabled: network === 'devnet',
    launchEnabled: network === 'devnet', tradingEnabled: false,
    mainnetLaunchEnabled: false, contractAddress: '', contractAddressStatus: 'COMING_SOON', socialXUrl: 'https://x.com', socialTelegramUrl: 'https://t.me', strategies, characters,
    capabilities: { walletAuth: true, persistentAgents: network !== 'mainnet', devnetMint: network === 'devnet', pumpfun: false, autonomousTrading: false },
  };
}
