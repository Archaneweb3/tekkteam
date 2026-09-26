// Explicit contracts only. No signer, wallet secret, RPC sender or DEX adapter.
const unavailable=()=>{throw Object.assign(Error('NOT_IMPLEMENTED: reviewed live adapter required'),{code:'NOT_IMPLEMENTED'});};
export class DexQuoteProvider {async quote(_intent){return unavailable();}}
export class TransactionValidator {async validate(_transaction,_intent,_riskContext){return unavailable();}}
export class TradeExecutor {async execute(_validatedIntent){throw Object.assign(Error('LIVE_TRADING_LOCKED'),{code:'LIVE_TRADING_LOCKED'});}}
export class PositionReconciler {async reconcile(_confirmedReceipt,_position){return unavailable();}}
