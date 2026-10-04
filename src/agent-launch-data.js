import {PublicKey} from '@solana/web3.js';

// Canonical identity is shared by the UI and service; no test-token fallback.
export function agentLaunchData(agent) {
 const token=agent.token??agent.coin;
 const first=agent.tokenDraftRevision===1,descriptionPresent=!!token&&Object.hasOwn(token,'description');
 if(first&&(agent.tokenDraftAuthority?.available!==true||agent.tokenDraftAuthority.revision!==1))throw Error('Token draft authority unavailable');
 const data={agentId:agent.id,agentName:agent.name,name:token?.name,symbol:token?.symbol??token?.ticker,description:token?.description??(first?'':agent.description??''),image:token?.image??'',character:agent.character??'',owner:agent.owner??agent.creator};
 if(first){data.tokenDraftRevision=1;data.tokenDescriptionPresent=descriptionPresent;for(const field of ['website','twitter','telegram'])if(Object.hasOwn(token??{},field))data[field]=token[field];}
 for(const [field,max] of [['agentId',100],['agentName',100],['name',32],['symbol',10]])if(typeof data[field]!=='string'||!data[field].trim()||new TextEncoder().encode(data[field]).length>max||/[\x00-\x1f]/.test(data[field]))throw Error('Invalid agent '+field);
 if(!/^[a-zA-Z0-9_-]+$/.test(data.agentId))throw Error('Invalid agent ID');
 if(typeof data.description!=='string'||data.description.length>1000)throw Error('Invalid token description');
 if(data.image && !/^https:\/\//.test(data.image))throw Error('Token image must be public HTTPS');
 if(!PublicKey.isOnCurve(new PublicKey(data.owner).toBytes()))throw Error('Invalid owner');
 return data;
}
export function tokenMetadata(data) {
 return {name:data.name,symbol:data.symbol,...(data.tokenDraftRevision===1&&data.tokenDescriptionPresent===false?{}:{description:data.description}),image:data.image,...(data.tokenDraftRevision===1?Object.fromEntries(['website','twitter','telegram'].filter(k=>Object.hasOwn(data,k)).map(k=>[k,data[k]])):{}),properties:{agentId:data.agentId,agentName:data.agentName,character:data.character,owner:data.owner}};
}
export function assertAgentLaunch(expected,actual) {
 if(!actual||Object.keys(expected).some(k=>expected[k]!==actual[k])||(expected.tokenDraftRevision===1&&['website','twitter','telegram'].some(k=>Object.hasOwn(actual,k)&&!Object.hasOwn(expected,k))))throw Error('Agent identity/token data changed. Stop before wallet approval.');
}
