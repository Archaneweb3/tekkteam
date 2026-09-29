import {createHash} from 'node:crypto';
import {reject} from './intent.js';

export const JUPITER_ROUTER='JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';
// Observation is not authorization. No CPI program enters the allowlist merely
// because Jupiter references it or a sampled transaction invokes it.
export const JUPITER_ROUTE_POLICY=Object.freeze({version:'observed-v1-deny-all',router:JUPITER_ROUTER,approvedCpiPrograms:Object.freeze([]),approvedRouteDiscriminators:Object.freeze([])});
export function inspectJupiterRoute(ix){
 if(ix.programId.toBase58()!==JUPITER_ROUTER)reject('UNKNOWN_ROUTER_PROGRAM');
 const discriminator=Buffer.from(ix.data).subarray(0,8).toString('hex');
 const names=['route','shared_accounts_route','route_v2','shared_accounts_route_v2'];
 const candidate=names.find(n=>createHash('sha256').update('global:'+n).digest().subarray(0,8).toString('hex')===discriminator)??'unknown';
 return {discriminator,anchorNameCandidate:candidate,bytes:ix.data.length,supported:false,reason:candidate.endsWith('_v2')?'UNVERIFIED_V2_ROUTE_ABI_AND_CPI':'UNAUDITED_ROUTE_ABI_AND_CPI'};
}
export function requireApprovedJupiterRoute(ix){const report=inspectJupiterRoute(ix);reject(report.reason);}
