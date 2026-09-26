import {PublicKey} from '@solana/web3.js';

// Canonical identity is shared by the UI and service; no test-token fallback.
export function agentLaunchData(agent) {
 const token=agent.token??agent.coin;
 const data={agentId:agent.id,agentName:agent.name,name:token?.name,symbol:token?.symbol??token?.ticker,description:token?.description??agent.description??'',image:token?.image??'',character:agent.character??'',owner:agent.owner??agent.creator};
 for(const [field,max] of [['agentId',100],['agentName',100],['name',32],['symbol',10]])if(typeof data[field]!=='string'||!data[field].trim()||new TextEncoder().encode(data[field]).length>max||/[\x00-\x1f]/.test(data[field]))throw Error('Invalid agent '+field);
 if(!/^[a-zA-Z0-9_-]+$/.test(data.agentId))throw Error('Invalid agent ID');
 if(typeof data.description!=='string'||data.description.length>1000)throw Error('Invalid token description');
 if(data.image && !/^https:\/\//.test(data.image))throw Error('Token image must be public HTTPS');
 if(!PublicKey.isOnCurve(new PublicKey(data.owner).toBytes()))throw Error('Invalid owner');
 return data;
}
export function tokenMetadata(data) {
 return {name:data.name,symbol:data.symbol,description:data.description,image:data.image,properties:{agentId:data.agentId,agentName:data.agentName,character:data.character,owner:data.owner}};
}
export function assertAgentLaunch(expected,actual) {
 if(!actual||Object.keys(expected).some(k=>expected[k]!==actual[k]))throw Error('Agent identity/token data changed. Stop before wallet approval.');
}
