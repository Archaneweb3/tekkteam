export const strategies = [
  { id: 'balanced', name: 'Balanced', description: 'A measured profile with conservative position limits.', maxPositionPct: 10 },
  { id: 'momentum', name: 'Momentum', description: 'Follow established movement with a defined risk budget.', maxPositionPct: 15 },
  { id: 'selective', name: 'Selective', description: 'Prioritize fewer opportunities and smaller exposure.', maxPositionPct: 5 },
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
    brand: 'TEKKWORK', network, preview: false, backendOnline: true,
    launchEnabled: network === 'devnet', tradingEnabled: false,
    mainnetLaunchEnabled: false, contractAddress: '', strategies, characters,
    capabilities: { walletAuth: true, persistentAgents: true, devnetMint: network === 'devnet', pumpfun: false, autonomousTrading: false },
  };
}
