// The line a creator signs (and the box they tick at launch) before an agent may use an
// extreme-risk strategy such as New Pairs. Shared by the page and the server.
export const RISK_ACK = 'Risk: I understand this strategy is extreme risk and my agent can lose all of its SOL';
export const isExtreme = (st) => !!st && st.risk === 'extreme';
