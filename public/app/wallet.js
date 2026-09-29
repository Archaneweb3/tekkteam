// Deliberately read-only: this frontend preview has no transaction backend.
export const wallet = { address: null, name: null, icon: null };
export const onWallet = () => () => {};
export const onWalletList = () => () => {};
export const listWallets = () => [];
export const restoreWallet = async () => null;
export const disconnect = async () => null;

const unavailable = async () => {
  throw new Error('Wallet actions are unavailable in this frontend preview.');
};
export const connectWallet = unavailable;
export const signAction = unavailable;
export const signMessage = unavailable;
export const sendSol = unavailable;
export const actionMessage = () => 'TEKKTEAM frontend preview';
