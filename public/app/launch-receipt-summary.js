// Shared public receipt facts only. No proof bytes, custody, RPC or execution authority.
const positiveInteger=value=>Number.isSafeInteger(value)&&value>0?value:null;
const timestamp=value=>positiveInteger(value)!==null&&value<=8640000000000000?value:null;
const provenance='FINALIZED_EXACT_MESSAGE_MINT_METADATA_CURVE_CREATOR';
function metadataUri(value){
 if(typeof value!=='string'||value.length>2048)return null;
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
export function confirmedReceiptDetails(receipt,agentId){
 const executionId=(receipt?.id===undefined||receipt.id===receipt.executionId)&&typeof receipt?.executionId==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(receipt.executionId)?receipt.executionId:null;
 const coinDraftAgentId=receipt?.coinDraftAgentId===agentId?agentId:null;
 const result={metadataUri:metadataUri(receipt?.metadataUri),confirmedSlot:positiveInteger(receipt?.confirmedSlot),confirmedAt:timestamp(receipt?.confirmedAt),pumpProvenance:receipt?.pumpProvenance===provenance?provenance:null,coinDraftAgentId,coinDraftRevision:coinDraftAgentId&&receipt?.coinDraftRevision===1?1:null,executionId,bindingProvenance:'UNAVAILABLE'};
 if(executionId&&result.metadataUri&&result.confirmedSlot&&result.confirmedAt&&result.pumpProvenance&&result.coinDraftRevision===1)result.bindingProvenance='FINALIZED_M4_RECEIPT';
 return result;
}
