import {digest,reject} from './intent.js';
import {validateStrategyConfig} from '../../public/app/strategy-config.js';
import {PERSONALITY_VERSION} from '../../public/app/agent-personalities.js';

// A snapshot of the consent already validated by the reservation store. This
// helper grants nothing and must never accept a browser-supplied policy.
export function pumpEntryPolicyFromAuthority(a) {
  if(!a?.strategyConfig)return null; // Historical records remain unqualified.
  const {digest:proof,...body}=a;
  if(digest(body)!==proof||a.personalityVersion!==PERSONALITY_VERSION||a.strategyConfig.strategy!==a.personality)reject('PUMP_ENTRY_POLICY_AUTHORITY');
  const policy={schema:'PUMP_ENTRY_POLICY_V1',authorizationId:a.id,authorizationRevision:a.revision,authorizationDigest:a.digest,launchBindingDigest:a.launchBindingDigest,personality:a.personality,personalityVersion:a.personalityVersion,strategyConfig:validateStrategyConfig(a.strategyConfig)};
  return {...policy,digest:digest(policy)};
}
