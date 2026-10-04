import {renderLaunchConfigurator,bindLaunchConfigurator,bindConfiguredAgent,configuredCoin,clearConfiguredCoin,reviseConfiguredIdentity} from './launch-configurator.js';
import {characterPortraitUrl} from './character-registry.js';
import {launchpadUnit} from './launchpad-view-model.js';
import {normalizeTokenDraft} from '../../src/token-draft-schema.js';
import {tokenImageField} from './token-image-ui.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={NOT_CONFIGURED:'TOKEN NOT CONFIGURED',CONFIGURED_NOT_LAUNCHED:'NOT LAUNCHED',PREPARED:'PREPARED · REVIEW REQUIRED',AWAITING_OWNER_APPROVAL:'AWAITING OWNER APPROVAL',CONFIRMED:'LAUNCH CONFIRMED',FAILED:'LAUNCH FAILED',RECONCILIATION_REQUIRED:'RECONCILIATION REQUIRED',UNAVAILABLE:'STATUS UNAVAILABLE'};
const explanations={NOT_CONFIGURED:'Identity-only Agent. Token setup is not available in this flow.',CONFIGURED_NOT_LAUNCHED:'Configured metadata is a draft. No launched mint is verified.',PREPARED:'Preparation is not a launch. Review the current state and expiry in the existing launch flow.',AWAITING_OWNER_APPROVAL:'Wallet approval is a separate manual action.',CONFIRMED:'Confirmed receipt links this Agent and coin. Trading requires separate authorization.',FAILED:'Inspect the existing result before considering any new attempt.',RECONCILIATION_REQUIRED:'An uncertain transaction must be reconciled. Do not start a fresh launch.',UNAVAILABLE:'Launch evidence could not be verified. Open the Agent to inspect its current state.'};
function renderConfirmedReceipt(launch){
 if(!launch.confirmed)return '';
 const details=launch.receiptDetails;
 const rows=[['Transaction signature',launch.signature],['Network','Solana Mainnet Beta'],['Confirmed slot',details?.confirmedSlot],['Launch timestamp',details?.confirmedAt?new Date(details.confirmedAt).toISOString():null],['Pump provenance',details?.pumpProvenance],['Coin draft revision',details?.coinDraftRevision],['Authoritative binding',details?.bindingProvenance==='FINALIZED_M4_RECEIPT'?'Finalized M4 receipt':null]];
 return '<dl data-confirmed-launch>'+rows.map(([label,value])=>`<div><dt>${label}</dt><dd style="overflow-wrap:anywhere">${esc(value??'UNAVAILABLE')}</dd></div>`).join('')+'</dl>'+(details?.metadataUri?`<a class="tw-text-link" href="${esc(details.metadataUri)}" target="_blank" rel="noopener noreferrer">VIEW METADATA ↗</a>`:'<p>Metadata URI · UNAVAILABLE</p>')+'<p>Funding and trading require separate authorization.</p>';
}
function renderLaunchWorkflow(launch){
 const workflow=launch.workflow;
 if(workflow?.available!==true)return '<p>Recorded launch workflow · UNAVAILABLE</p>';
 const pending=launch.state==='RECONCILIATION_REQUIRED'&&workflow.finality==='UNAVAILABLE';
 return '<div data-launchpad-workflow><p>'+esc(workflow.provenance)+' · Recorded launch workflow</p><p>Recorded receipt phase · '+esc(workflow.receiptStatus??'No phase recorded')+' (workflow only)</p><p>Signature recorded · '+(workflow.signatureRecorded?'YES':'NO')+'</p><p>Transaction delivery · '+esc(workflow.deliveryStatus)+'</p><p>Recorded finality · '+esc(workflow.finality)+(pending?' · Reconciliation pending':workflow.finality==='CONFIRMED'?' · Canonical confirmed receipt':workflow.finality==='FAILED'?' · Canonical failed receipt':'')+'</p>'+(pending?'<p>'+ (workflow.signatureRecorded?'Signed outcome':'Transaction outcome')+' is unknown. '+(workflow.signatureRecorded?'Inspect the existing same-signature status':'Inspect the recorded launch status')+' in the related Agent; do not start a fresh launch.</p>':'')+'<p>Workflow recording does not prove transaction delivery or independently verify the chain.</p></div>';
}
function identityReviewSection(input,config,busy,recovering,coin){
 const preset=config.strategies?.find(s=>s.id===input.strategy)?.name??input.strategy;
 const character=config.characters?.find(c=>c.id===input.character)?.name??input.character;
 return `<section class="tw-world-section"><h2>${recovering?'Resume Agent':coin?'Review coin + Agent':'Review Agent'}</h2>${coin?`<div class="tt-review-coin"><img src="${esc(coin.tokenImage)}" alt="Coin logo"><div><strong>${esc(coin.draft.name)} · ${esc(coin.draft.ticker)}</strong><p>${esc(coin.draft.description??'')}</p></div></div>`:''}<dl>${[['Agent name',input.name],['Description',input.description],['Character',character],['Preset',preset]].map(([label,value])=>`<div><dt>${label}</dt><dd style="overflow-wrap:anywhere">${esc(value||'Not provided')}</dd></div>`).join('')}</dl><p>${recovering?'Your Agent may already be saved. Retry safely to check the same request without creating another Agent.':'Create your Agent first, then add its coin details. This does not launch a coin or fund an Agent wallet.'}</p><p>The preset configures deterministic rules; saving does not authorize trading or launch.</p><button type="button" class="tw-button primary" data-launchpad-identity-save ${busy?'disabled':''}>${recovering?'Retry Save':coin?'Save Agent & continue':'Create Agent'}</button>${recovering?'':`<button type="button" class="tw-button" data-launchpad-identity-edit ${busy?'disabled':''}>EDIT BEFORE SAVING</button>`}</section>`;
}
export function renderLaunchpadPage({agents=[],owner=null,walletConnected=false,config={},units=[],loading=false,showCreate=false,message='',busy=false,identityDraft={},identityReview=false,identityRecovery=null,identityBlocked=false,tokenAvailability={},tokenSavedAvailability={},tokenEditor=null,launchControls=false,composerCoin=null}={}){
 const canCreate=!!owner&&!config.preview&&config.capabilities?.walletAuth===true&&!identityBlocked;
 const canConnect=!owner&&!config.preview&&config.capabilities?.walletAuth===true;
 const action=canConnect?`<button type="button" class="tw-world-cta primary" data-launchpad-connect>${walletConnected?'Sign In':'Connect Wallet'} →</button>`:canCreate?'<button type="button" class="tw-world-cta primary" data-launchpad-create>Create Agent →</button>':'<a class="tw-world-cta primary" href="#/agents">VIEW AGENTS →</a>';
 const card=(agent,index)=>{
  const unit=units.find(u=>u.agentId===agent.id)??launchpadUnit(agent,null),launch=unit.launch,href='#/agent/'+encodeURIComponent(agent.id);
  const tokenLabel=unit.token.configured?esc(unit.token.name)+' · $'+esc(unit.token.symbol):launch.confirmed?'TOKEN METADATA UNAVAILABLE':'TOKEN NOT CONFIGURED';
  const scopeLabel=!loading&&unit.scope?.available?unit.scope.scoped?'LAUNCHPAD SCOPE · ASSOCIATED-COIN PAPER ONLY':'LEGACY GENERAL AGENT':'Launchpad scope unavailable; inspect only.';
  const entry=!loading&&unit.scope?.available&&unit.scope.scoped===false&&['CONFIRMED','CONFIGURED_NOT_LAUNCHED'].includes(launch.state)?`<button type="button" class="tw-button" data-launchpad-enter="${esc(agent.id)}" ${busy?'disabled':''}>ENTER LAUNCHPAD →</button><p>Restricts this Agent to its confirmed associated coin in Paper. No trading starts. An active or unresolved Paper position must be handled separately.</p>`:'';
  const launchControl=!loading&&launchControls&&owner===agent.creator&&!config.preview&&unit.available&&unit.token.configured&&!['UNAVAILABLE','CONFIRMED'].includes(launch.state)?`<button type="button" class="tw-button" data-launchpad-inspect="${esc(agent.id)}" ${busy?'disabled':''}>${launch.state==='CONFIGURED_NOT_LAUNCHED'?'REVIEW LAUNCH':'INSPECT LAUNCH STATUS'}</button>`:'';
  const tokenSetup=(!loading&&agent.coin===null&&unit.available&&unit.scope?.available&&unit.scope.scoped&&launch.state==='NOT_CONFIGURED'?(tokenAvailability[agent.id]===true?`<button type="button" class="tw-button" data-launchpad-token="${esc(agent.id)}" ${busy?'disabled':''}>Add Coin Details</button><p>Save this Agent’s first immutable coin draft. Preparation and wallet approval are separate.</p>`:'<p>Coin draft saving is unavailable until owner, receipt and image authority are verified.</p>'):'')+launchControl;
  return `<article class="tw-agent"><div class="tw-card-character"><img src="${characterPortraitUrl(agent.character)}" alt="" aria-hidden="true"></div><div class="tw-card-title"><h3>${esc(agent.name)}</h3></div><p>${tokenLabel}</p><span class="tw-status">${loading?'CHECKING LAUNCH EVIDENCE':labels[launch.state]}</span><p>${loading?'Reading your current launch lifecycle.':launch.state==='NOT_CONFIGURED'&&tokenAvailability[agent.id]===true?'Identity-only Agent. Review its first coin draft separately from launch.':explanations[launch.state]}</p><p>${esc(launch.provenance)} · ${launch.confirmed?'Solana Mainnet receipt':'Launch lifecycle'}</p>${loading?'':renderLaunchWorkflow(launch)}${launch.confirmed?`<p class="tw-token-mint">CA ${esc(unit.token.mint)}</p><a class="tw-text-link" href="https://pump.fun/coin/${encodeURIComponent(unit.token.mint)}" target="_blank" rel="noopener noreferrer">VIEW COIN ↗</a>`:''}${renderConfirmedReceipt(launch)}<p>${scopeLabel}</p>${entry}${tokenSetup}${tokenSavedAvailability[agent.id]===true?`<button type="button" class="tw-button" data-launchpad-token-view="${esc(agent.id)}" ${busy?'disabled':''}>View Saved Draft</button>`:''}<a class="tw-world-card-action" href="${href}">${launch.confirmed?'CONFIGURE / FUND AGENT':'VIEW AGENT'} →</a></article>`;
 };
 const identityForm=showCreate&&canCreate?`<section class="tw-world-section"><h2>Create Agent</h2><p>Choose your Agent name, character and trading preset. Next, add your coin details. Creating an Agent does not launch a coin, add funds or start trading.</p><form data-launchpad-identity><label class="tw-field">Agent name<input name="name" value="${esc(identityDraft.name??'')}" required minlength="2" maxlength="40"></label><label class="tw-field">Description<textarea name="description" maxlength="300">${esc(identityDraft.description??'')}</textarea></label><label class="tw-field">Character<select name="character">${(config.characters??[]).map(c=>'<option value="'+esc(c.id)+'"'+(identityDraft.character===c.id?' selected':'')+'>'+esc(c.name)+'</option>').join('')}</select></label><label class="tw-field">Preset<select name="strategy">${(config.strategies??[]).map(c=>'<option value="'+esc(c.id)+'"'+(identityDraft.strategy===c.id?' selected':'')+'>'+esc(c.name)+'</option>').join('')}</select></label><button class="tw-button primary" type="submit" ${busy?'disabled':''}>Review Agent</button></form></section>`:'';
 const roster=!owner?'<div class="tw-world-empty"><div><h3>YOUR LAUNCH PIPELINE</h3><p>Connect your wallet, then sign in to see your Agents and saved coin drafts.</p></div></div>':agents.length?'<div class="tw-agent-grid directory">'+agents.map(card).join('')+'</div>':`<div class="tw-world-empty"><div><h3>NO AGENTS YET</h3><p>${config.mainnetSafetyMode?'Create your first Agent, then add and review its coin details.':'Create an Agent with token metadata first when the current network permits it. Creation does not launch a coin.'}</p></div></div>`;
 const existingAgent=!showCreate&&!tokenEditor&&owner&&agents.length?`<section class="tt-sheet"><label class="tw-field">Use an existing Agent<select data-launchpad-selected-agent><option value="">Create a new Agent below</option>${agents.filter(a=>a.creator===owner).map(a=>`<option value="${esc(a.id)}" ${units.find(u=>u.agentId===a.id)?.launch.confirmed||tokenAvailability[a.id]||tokenSavedAvailability[a.id]?'':'disabled'}>${esc(a.name)} · ${units.find(u=>u.agentId===a.id)?.launch.confirmed?'LAUNCHED':tokenSavedAvailability[a.id]?'Saved coin draft':tokenAvailability[a.id]?'Add coin details':'Unavailable for preparation'}</option>`).join('')}</select></label><button type="button" class="tw-button" data-launchpad-selected-open ${loading||busy?'disabled':''}>Continue with selected Agent</button></section>`:'';
 return `<div class="tw-world tw-world-launchpad"><header class="tt-page-title"><h1><i></i>Launch coin + Agent</h1><p>Configure your coin and its Agent. Save a draft first; review costs and approve a launch separately.</p></header>${existingAgent}${!showCreate&&!tokenEditor?renderLaunchConfigurator(config,{owner,walletConnected}):''}${showCreate&&canCreate&&identityReview?identityReviewSection(identityDraft,config,busy,!!identityRecovery,composerCoin):identityForm}${owner&&!config.preview?renderTokenDraftEditor(tokenEditor,busy):''}<p role="status" data-launchpad-message>${esc(message)}</p><details class="tt-pipeline"><summary>Your saved Agents & drafts</summary><section class="tw-world-section"><div class="tw-world-section-head"><h2>Your launch pipeline</h2><div>${canCreate?'<a class="tw-world-cta" href="#/agents">View Agents →</a>':action}<a class="tw-text-link" href="#/tokens">Your tokens →</a></div></div>${roster}</section></details></div>`;

}
const tokenFormError=code=>Object.assign(new Error(code),{code});
export function tokenDraftRead(dto,agentId,owner){
 const t=dto?.tokenDraft;
 if(dto?.id!==agentId||dto.owner!==owner||dto.lifecycle?.agent?.id!==agentId||t?.version!==1||t.agentId!==agentId||t.owner!==owner||t.authorizationGranted!==false||t.ownerAuthority?.available!==true||t.ownerAuthority.provenance!=='BACKEND VERIFIED'||t.save?.expectedRevision!==0||t.save.immutable!==true||t.image?.required!==true||t.image.publicDelivery!=='UNVERIFIED')return {allowed:false,saved:null};
 if(t.state==='EMPTY'&&t.revision===0&&t.savedDraft===null&&t.save.allowed===true&&t.save.reason===null&&t.image.localAsset==='MISSING'&&t.image.complete===false)return {allowed:true,saved:null};
 if(t.state==='IMMUTABLE'&&t.revision===1&&t.save.allowed===false&&((t.image.complete===true&&t.image.localAsset==='VERIFIED'&&t.save.reason==='TOKEN_ALREADY_CONFIGURED')||(t.image.complete===false&&t.image.localAsset==='UNAVAILABLE'&&t.save.reason==='IMMUTABLE_IMAGE_UNAVAILABLE'))){
  try{const draft=normalizeTokenDraft(t.savedDraft);if(!draft.image)return {allowed:false,saved:null};return {allowed:false,saved:{agentId,revision:1,draft,imageAuthority:{localAsset:t.image.localAsset,publicDelivery:'UNVERIFIED'}}};}catch{}
 }
 return {allowed:false,saved:null};
}
export function tokenDraftEnvelope(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['draft','tokenImage'].includes(k)))throw tokenFormError('TOKEN_FORM_VALIDATION');
 const draft=normalizeTokenDraft(input.draft),tokenImage=input.tokenImage;
 if(tokenImage!==undefined){
  if(draft.image||typeof tokenImage!=='string'||tokenImage.length>4500000||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(tokenImage))throw tokenFormError('TOKEN_FORM_VALIDATION');
  const bytes=tokenImage.slice(tokenImage.indexOf(',')+1),size=bytes.length*3/4-(bytes.endsWith('==')?2:bytes.endsWith('=')?1:0);
  if(bytes.length%4!==0||size>3*1024*1024)throw tokenFormError('TOKEN_FORM_VALIDATION');
 }else if(!draft.image)throw tokenFormError('TOKEN_FORM_IMAGE_REQUIRED');
 return Object.freeze({draft,expectedRevision:0,...(tokenImage!==undefined?{tokenImage}:{})});
}
function verifiedTokenResult(result,agentId,envelope){
 if(result?.agentId!==agentId||result.revision!==1||typeof result.replayed!=='boolean'||result.imageAuthority?.localAsset!=='VERIFIED'||result.imageAuthority?.publicDelivery!=='UNVERIFIED')throw tokenFormError('TOKEN_FORM_RESPONSE_UNVERIFIED');
 let draft;try{draft=normalizeTokenDraft(result.draft);}catch{throw tokenFormError('TOKEN_FORM_RESPONSE_UNVERIFIED');}
 if(!draft.image)throw tokenFormError('TOKEN_FORM_RESPONSE_UNVERIFIED');
 const parsed=new URL(draft.image);
 if(parsed.search||parsed.hash||!parsed.pathname.startsWith('/metadata/agents/'+agentId+'/')||!/^([a-f0-9]{64})\.png$/.test(parsed.pathname.slice(('/metadata/agents/'+agentId+'/').length)))throw tokenFormError('TOKEN_FORM_RESPONSE_UNVERIFIED');
 const comparable={...draft};if(envelope.tokenImage!==undefined)delete comparable.image;
 if(JSON.stringify(comparable)!==JSON.stringify(envelope.draft))throw tokenFormError('TOKEN_FORM_RESPONSE_UNVERIFIED');
 return Object.freeze({agentId,revision:1,draft,imageAuthority:Object.freeze({localAsset:'VERIFIED',publicDelivery:'UNVERIFIED'}),replayed:result.replayed});
}
function tokenErrorStatus(error){try{return Object.getOwnPropertyDescriptor(error,'httpStatus')?.value;}catch{return undefined;}}
export function createTokenDraftActions({owner,getOwner=()=>owner,isCurrent=()=>true,canSaveTokenDraft=()=>false,saveTokenDraft}={}){
 const intents=new Map();let authLost=false;
 const current=()=>!authLost&&!!owner&&getOwner()===owner&&isCurrent();
 // Exact current owner-API validation responses: each rejects before COMMIT or
 // rolls back the token transaction. Generic/intermediary 400s are not proof.
 const noncommittingMessages=new Set(['Invalid token draft metadata','Invalid or oversized token image','Invalid normalized token image','Token draft cannot form a valid launch snapshot','Token metadata exceeds the current launch request size']);
 const definiteRejection=error=>{try{return Object.getOwnPropertyDescriptor(error,'httpStatus')?.value===400&&noncommittingMessages.has(Object.getOwnPropertyDescriptor(error,'message')?.value);}catch{return false;}};
 return {
  hasAttempt(agentId){return intents.get(agentId)?.attempted===true;},
  canEditRejected(agentId){const intent=intents.get(agentId);return current()&&!!intent&&intent.rejected===true&&!intent.uncertain&&!intent.pending&&!intent.result;},
  editRejected(agentId){
   if(!this.canEditRejected(agentId))return false;
   try{if(canSaveTokenDraft(agentId)!==true)return false;}catch{return false;}
   intents.delete(agentId);return true;
  },
 save(agentId,input){
   if(!current())return Promise.reject(tokenFormError('TOKEN_FORM_AUTH_REQUIRED'));
   if(typeof agentId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(agentId)||typeof saveTokenDraft!=='function')return Promise.reject(tokenFormError('TOKEN_FORM_UNAVAILABLE'));
   let envelope;try{envelope=tokenDraftEnvelope(input);}catch(error){return Promise.reject(error);}
   const fingerprint=JSON.stringify(envelope);let intent=intents.get(agentId);
   if(intent&&intent.fingerprint!==fingerprint)return Promise.reject(tokenFormError('TOKEN_FORM_RETRY_LOCKED'));
   const ready=()=>{try{return canSaveTokenDraft(agentId)===true;}catch{return false;}};
   if(!intent){if(!ready())return Promise.reject(tokenFormError('TOKEN_FORM_UNAVAILABLE'));intent={fingerprint,envelope,key:crypto.randomUUID(),pending:null,result:null,attempted:false,rejected:false,uncertain:false};intents.set(agentId,intent);}
   if(intent.result)return Promise.resolve(intent.result);
   if(intent.pending)return intent.pending;
   intent.rejected=false;
   intent.pending=Promise.resolve().then(()=>{
    if(!current()||(!intent.attempted&&!ready()))throw tokenFormError('TOKEN_FORM_UNAVAILABLE');
    // A clone prevents an injected request adapter from altering the retry intent.
    intent.attempted=true;
    return saveTokenDraft(agentId,structuredClone(intent.envelope),intent.key);
   }).then(result=>{
    if(!current())return null;
    intent.result=verifiedTokenResult(result,agentId,intent.envelope);return intent.result;
   }).catch(error=>{
    // Latch first: malformed errors or throwing authority checks remain unknown.
    const wasUncertain=intent.uncertain;if(intent.attempted){intent.uncertain=true;intent.rejected=false;}
    if(tokenErrorStatus(error)===401)authLost=true;
    if(intent.attempted&&!wasUncertain){try{if(current()&&definiteRejection(error)){intent.rejected=true;intent.uncertain=false;}}catch{}}
    throw error;
   }).finally(()=>{intent.pending=null;});
   return intent.pending;
  }
 };
}
function renderTokenDraftEditor(editor,busy){
 if(!editor)return '';
 const {agentId,character,name,stage='editing',input={},result}=editor,values=input.draft??{};busy=busy||editor.blocked===true;
 const fields=[['name','Coin name'],['ticker','Ticker'],['description','Coin description'],['website','Website'],['twitter','Twitter'],['telegram','Telegram']];
 const review=stage!=='editing';
 const imagePreview=typeof input.tokenImage==='string'&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(input.tokenImage)?`<figure class="tw-token-image"><img src="${esc(input.tokenImage)}" alt="Coin image selected for this draft" style="width:160px;max-width:100%;height:160px;object-fit:contain"><figcaption>Selected coin image · included in this save</figcaption></figure>`:'';
 const imageEvidence=result?(result.imageAuthority?.localAsset==='VERIFIED'?'BACKEND VERIFIED local asset. Public delivery UNVERIFIED.':'Local image completeness UNAVAILABLE. Public delivery UNVERIFIED.'):'Selected for local validation on save. Public delivery UNVERIFIED.';
 const saveEvidence=editor.fromRead?'Immutable coin draft, revision 1. Current launch status is shown in the Agent receipt above.':'Coin draft saved, revision 1. Check the current launch status in the related Agent receipt. Public delivery remains unverified.';
 const body=review?`${imagePreview}<dl>${fields.map(([key,label])=>`<div><dt>${label}</dt><dd style="overflow-wrap:anywhere">${Object.hasOwn(result?.draft??values,key)?esc((result?.draft??values)[key]):'Not provided'}</dd></div>`).join('')}</dl><p>Image · ${imageEvidence}</p><p>Launch costs · UNAVAILABLE until the existing preparation supplies fresh evidence. Draft saving does not request wallet approval.</p>${stage==='saved'?'<p>'+saveEvidence+'</p>':`<button type="button" class="tw-button primary" data-launchpad-token-save ${busy?'disabled':''}>${['retry','rejected'].includes(stage)?'Retry Save':'Save Draft'}</button>${['review','rejected'].includes(stage)?`<button type="button" class="tw-button" data-launchpad-token-edit ${busy?'disabled':''}>${stage==='rejected'?'EDIT REJECTED DRAFT':'EDIT BEFORE SAVING'}</button>`:''}`}`:`<form data-launchpad-token-form><div class="tw-create-token"><label class="tw-field">Coin name<input name="tokenName" required maxlength="32" value="${esc(values.name??'')}"></label><label class="tw-field">Ticker<input name="tokenTicker" required maxlength="10" value="${esc(values.ticker??'')}"></label></div><input type="hidden" name="character" value="${esc(character)}"><label class="tw-field"><span>Include coin description</span><input name="includeDescription" type="checkbox" ${Object.hasOwn(values,'description')?'checked':''}></label><label class="tw-field">Coin description<textarea name="tokenDescription" maxlength="1000">${esc(values.description??'')}</textarea></label>${['website','twitter','telegram'].map(key=>`<label class="tw-field">${key}<input type="url" name="token${key}" maxlength="2048" value="${esc(values[key]??'')}" placeholder="https://"></label>`).join('')}<button type="submit" class="tw-button primary" ${busy?'disabled':''}>Review Draft</button></form>`;
 return `<section class="tw-world-section" data-token-editor="${esc(agentId)}"><h2>${stage==='saved'?'COIN DRAFT SAVED':'COIN DRAFT · REVIEW BEFORE SAVING'}</h2><p>Related Agent · ${esc(name)}. This is its first immutable token draft; it cannot be edited after saving in this flow. Agent identity and description stay separate.</p>${body}<a class="tw-world-card-action" href="#/agent/${encodeURIComponent(agentId)}">OPEN RELATED AGENT →</a><p>Preparation, manual wallet approval, confirmation and trading permissions remain separate. Live stays OFF.</p></section>`;
}
export function createLaunchpadActions({owner,createIdentity,enterScope,isCurrent=()=>true,onChanged=()=>{},onEntered=()=>{},identityJournal=null}){
 let identityIntent=null,identityPending=null;const entryKeys=new Map();
 return {
  pendingIdentity(){return identityJournal?.read()??null;},
  create(input){
   if(!owner||!isCurrent())return Promise.resolve(null);if(typeof createIdentity!=='function')return Promise.reject(Error('Identity creation unavailable'));
   try{
    const restored=identityJournal?.read();if(restored)identityIntent={fingerprint:JSON.stringify(restored.input),key:restored.key,input:restored.input};
    const fingerprint=JSON.stringify(input);if(identityIntent&&identityIntent.fingerprint!==fingerprint)throw Error('Retry the original identity details before changing this request.');
    if(identityPending)return identityPending;
    const nextIntent=identityIntent??{fingerprint,key:crypto.randomUUID(),input:structuredClone(input)};
    identityJournal?.write(nextIntent);identityIntent=nextIntent;
   }catch(error){return Promise.reject(error);}
   const intent=identityIntent;
   identityPending=Promise.resolve().then(()=>{if(!isCurrent())return null;return createIdentity(structuredClone(intent.input),intent.key);}).then(async result=>{
    if(!isCurrent())return null;
    if(!result?.id||result.creator!==owner||(result.coin!==null&&result.replayed!==true)||result.launchpadScope?.available!==true||result.launchpadScope?.scoped!==true||result.launchpadScope?.reason!==null)throw Error('Scoped identity result unavailable. Retry the same request to verify.');
    identityJournal?.acknowledge(intent.key,result.id);await onChanged(result);identityJournal?.clear(intent.key);identityIntent=null;return result;
   }).finally(()=>{identityPending=null;});
   return identityPending;
  },
  async enter(agentId){
   if(!owner||!isCurrent())return null;if(typeof enterScope!=='function')throw Error('Launchpad entry unavailable');
   if(!entryKeys.has(agentId))entryKeys.set(agentId,crypto.randomUUID());const result=await enterScope(agentId,entryKeys.get(agentId));if(!isCurrent())return null;
   if(result?.agentId!==agentId||result.launchpadScope?.available!==true||result.launchpadScope?.scoped!==true||result.launchpadScope?.reason!==null)throw Error('Launchpad scope could not be verified. No trading was started.');
   await onEntered(agentId);return result;
  }
 };
}
export function mountLaunchpadPage(host,{agents=[],owner=null,walletConnected=false,config={},isCurrent=()=>true,loadContract=async()=>null,projectUnit=launchpadUnit,onConnect=()=>{},createIdentity,enterScope,onChanged=()=>{},onEntered=()=>{},getOwner=()=>owner,canSaveTokenDraft=()=>false,saveTokenDraft,onTokenSaved=()=>{},imageField=tokenImageField,onLaunch,identityJournal=null}={}){
 let composerCleanup=()=>{},composerReview=null;let dead=false,busy=false,showCreate=false,message='',units=[],identityDraft={},identityReview=false,identityRecovery=null,identityBlocked=false,tokenEditor=null,image=null,tokenAuthLost=false;const tokenReads=new Map();const current=()=>!dead&&isCurrent()&&(!owner||getOwner()===owner);
 const clean=Array.isArray(agents)&&agents.every(a=>a&&typeof a.id==='string'&&(!owner||a.creator===owner));
 const actions=createLaunchpadActions({owner,createIdentity,enterScope,isCurrent:current,onChanged:async result=>{bindConfiguredAgent(owner,result,identityDraft,composerReview);await onChanged(result);},onEntered,identityJournal});
 const readIdentityRecovery=()=>{try{identityRecovery=actions.pendingIdentity();if(identityRecovery?.state==='ACKNOWLEDGED'&&agents.some(a=>a.id===identityRecovery.agentId&&a.creator===owner)){identityJournal.clear(identityRecovery.key);identityRecovery=null;showCreate=false;identityReview=false;}if(identityRecovery){identityDraft=identityRecovery.input;showCreate=true;identityReview=true;}}catch{identityBlocked=true;message='Identity recovery storage is unavailable. Restore this tab storage before creating another identity; existing Agents remain readable.';}};
 readIdentityRecovery();
 const tokenReady=id=>{
  const agent=agents.find(a=>a.id===id),unit=units.find(u=>u.agentId===id);
  try{return !tokenAuthLost&&!config.preview&&!!owner&&current()&&tokenReads.get(id)?.allowed===true&&typeof saveTokenDraft==='function'&&agent?.creator===owner&&agent.coin===null&&unit?.available===true&&unit.scope?.available===true&&unit.scope.scoped===true&&unit.launch.state==='NOT_CONFIGURED'&&canSaveTokenDraft(id)===true;}catch{return false;}
 };
 const tokenActions=createTokenDraftActions({owner,getOwner,isCurrent:current,canSaveTokenDraft:tokenReady,saveTokenDraft});
 const paint=(next=units,loading=false)=>{
  units=next;if(!current())return;
  const tokenAvailability=Object.fromEntries(agents.map(a=>[a.id,tokenReady(a.id)]));
  const tokenSavedAvailability=Object.fromEntries(agents.map(a=>[a.id,!!tokenReads.get(a.id)?.saved]));
  if(!tokenEditor)for(const a of agents){const input=configuredCoin(owner,a.id);if(input&&tokenReady(a.id)){tokenEditor={agentId:a.id,name:a.name,character:a.character,stage:'review',input};break;}}
  composerCleanup();host.innerHTML=renderLaunchpadPage({agents:owner?agents:[],owner,walletConnected,config,units,loading,showCreate,message,busy,identityDraft,identityReview,identityRecovery,identityBlocked,tokenAvailability,tokenSavedAvailability,tokenEditor,composerCoin:composerReview?.coin??null,launchControls:typeof onLaunch==='function'});
  composerCleanup=bindLaunchConfigurator(host,{owner,onConnect,onReview:(input,context)=>{composerReview=context;identityDraft=input;showCreate=true;identityReview=true;paint();host.querySelector('h2')?.scrollIntoView({block:'start',behavior:'smooth'});}});
  image=null;
  const form=host.querySelector?.('[data-launchpad-token-form]');
  if(form&&tokenEditor?.stage==='editing')image=imageField(form);
 };
 const perform=async action=>{if(busy||!current())return;busy=true;message='Saving your Agent. No launch or trading will start.';paint();try{const result=await action();if(current()){if(result?.id){showCreate=false;identityReview=false;identityDraft={};}message='Agent saved. Launch and trading require separate approval.';}}catch{if(current())message='Could not confirm the save. Retry the same details to avoid creating a duplicate.';}finally{busy=false;if(current()){readIdentityRecovery();paint();}}};
 const saveToken=async()=>{
  if(busy||!current()||!tokenEditor||!['review','retry','rejected'].includes(tokenEditor.stage)||tokenAuthLost)return;
  if(!tokenReady(tokenEditor.agentId)&&!(['retry','rejected'].includes(tokenEditor.stage)&&tokenActions.hasAttempt(tokenEditor.agentId))){message='Token save capability changed or is unavailable. Reload the related Agent before saving.';tokenEditor.blocked=true;paint();return;}
  busy=true;const editor=tokenEditor;message='Saving coin metadata off-chain. No preparation or wallet approval is requested.';paint();
  let saved=null;
  try{saved=await tokenActions.save(editor.agentId,editor.input);if(current()&&saved){tokenEditor={...editor,stage:'saved',result:saved};message='Coin draft saved. Public delivery UNVERIFIED. Check the current launch status in the related Agent receipt; this save did not request wallet approval.';}}
  catch(error){if(current()){tokenEditor={...editor,stage:tokenActions.canEditRejected(editor.agentId)?'rejected':'retry'};if(tokenErrorStatus(error)===401){tokenAuthLost=true;tokenEditor.blocked=true;message='Owner authentication expired. Reconnect and reload your Agent before any retry.';}else if(tokenEditor.stage==='rejected')message='The draft was rejected before saving. Edit the rejected draft and review again, or retry these same details. No launch was requested.';else if(tokenErrorStatus(error)===409)message='The draft conflicts with current immutable or receipt state. Inspect the related Agent; no launch was requested.';else if(tokenErrorStatus(error)===503)message='Token save authority or image configuration is unavailable. Inspect the related Agent before retrying.';else message='Draft save outcome unavailable. Retry only these same details with the same intent. Do not start a launch.';}}
  finally{busy=false;if(current())paint();}
  if(saved&&current())try{clearConfiguredCoin();await onTokenSaved(saved);}catch{if(current()){message='Draft saved, but the workspace refresh is unavailable. Inspect the related Agent.';paint();}}
 };
 const click=event=>{
  if(event.target.closest('[data-launchpad-selected-open]')&&current()&&owner&&!busy&&!tokenEditor){
   const id=host.querySelector('[data-launchpad-selected-agent]')?.value,a=agents.find(a=>a.id===id&&a.creator===owner);
   if(a&&units.find(u=>u.agentId===id)?.launch.confirmed){onEntered(id);}
   else if(a&&tokenReady(id)){tokenEditor={agentId:id,name:a.name,character:a.character,stage:'editing',input:{}};showCreate=false;paint();}
   else if(a&&tokenReads.get(id)?.saved&&typeof onLaunch==='function')Promise.resolve().then(()=>onLaunch(id)).catch(()=>{if(current()){message='Launch preparation unavailable. No transaction was created.';paint();}});
  }
  const inspect=event.target.closest('[data-launchpad-inspect]');
  if(inspect&&current()&&owner&&!config.preview&&!busy&&!tokenEditor&&typeof onLaunch==='function'){
   const id=inspect.dataset.launchpadInspect,unit=units.find(u=>u.agentId===id),agent=agents.find(a=>a.id===id);
   if(agent?.creator===owner&&unit?.available&&unit.token.configured&&unit.launch.state!=='UNAVAILABLE')Promise.resolve().then(()=>onLaunch(id)).catch(()=>{if(current()){message='Launch review unavailable. No transaction was created.';paint();}});
  }
  if(!current())return;
  if(event.target.closest('[data-launchpad-connect]'))onConnect();
  if(event.target.closest('[data-launchpad-create]')&&owner&&!config.preview&&!busy&&!tokenEditor&&!identityBlocked){composerReview=null;showCreate=true;paint();}
  if(event.target.closest('[data-launchpad-identity-save]')&&owner&&!config.preview&&!busy&&identityReview&&!identityBlocked)perform(()=>actions.create(identityDraft));
  if(event.target.closest('[data-launchpad-identity-edit]')&&!busy&&!identityRecovery){identityReview=false;if(composerReview)showCreate=false;paint();}
  const token=event.target.closest('[data-launchpad-token]');
  if(token&&owner&&!busy&&!tokenEditor&&tokenReady(token.dataset.launchpadToken)){const a=agents.find(a=>a.id===token.dataset.launchpadToken);tokenEditor={agentId:a.id,name:a.name,character:a.character,stage:'editing',input:{}};showCreate=false;paint();}
  const saved=event.target.closest('[data-launchpad-token-view]');
  if(saved&&owner&&!busy&&!tokenEditor){const id=saved.dataset.launchpadTokenView,result=tokenReads.get(id)?.saved,a=agents.find(a=>a.id===id);if(result&&a?.creator===owner){tokenEditor={agentId:id,name:a.name,character:a.character,stage:'saved',fromRead:true,result};showCreate=false;paint();}}
  if(event.target.closest('[data-launchpad-token-edit]')&&!busy&&current()&&tokenEditor&&((tokenEditor.stage==='review'&&tokenReady(tokenEditor.agentId))||(tokenEditor.stage==='rejected'&&tokenReady(tokenEditor.agentId)&&tokenActions.editRejected(tokenEditor.agentId)))){tokenEditor={...tokenEditor,stage:'editing',input:{draft:tokenEditor.input.draft}};message='Choose the image again after editing; review before saving.';paint();}
  if(event.target.closest('[data-launchpad-token-save]'))saveToken();
  const entry=event.target.closest('[data-launchpad-enter]');if(entry&&owner&&!config.preview&&!busy&&!tokenEditor){const id=entry.dataset.launchpadEnter,unit=units.find(u=>u.agentId===id);if(unit?.scope?.available&&unit.scope.scoped===false&&['CONFIRMED','CONFIGURED_NOT_LAUNCHED'].includes(unit.launch.state))perform(()=>actions.enter(id));}
 };
 const submit=event=>{
  const token=event.target.matches('[data-launchpad-token-form]'),identity=event.target.matches('[data-launchpad-identity]');
  if(!token&&!identity)return;event.preventDefault();if(!owner||config.preview||!current()||busy)return;
  if(token){
   if(!tokenEditor||!tokenReady(tokenEditor.agentId))return;
   try{
    const values=Object.fromEntries(new FormData(event.target)),draft={name:values.tokenName,ticker:values.tokenTicker};
    if(values.includeDescription)draft.description=values.tokenDescription;
    for(const key of ['website','twitter','telegram'])if(values['token'+key])draft[key]=values['token'+key];
    const envelope=tokenDraftEnvelope({draft,tokenImage:image?.value()});
    tokenEditor={...tokenEditor,stage:'review',input:{draft:envelope.draft,tokenImage:envelope.tokenImage}};message='Review the exact coin fields before the immutable off-chain save.';paint();
   }catch{message='Check coin fields and choose a valid PNG, JPEG or WebP image. No save was requested.';const status=host.querySelector?.('[data-launchpad-message]');if(status)status.textContent=message;}
   return;
  }
  if(identityBlocked||identityRecovery)return;
  const input=Object.fromEntries(new FormData(event.target));reviseConfiguredIdentity(owner,input,composerReview);identityDraft=input;identityReview=true;message='Review this Agent identity before saving. Coin setup is the next separate step.';paint();
 };
 if(!clean){host.innerHTML='<section class="tw-empty" role="alert"><h1>Launchpad unavailable</h1><p>Agent owner mismatch. Reconnect your owner wallet.</p></section>';return {destroy(){dead=true;}};}
 host.addEventListener('click',click);host.addEventListener('submit',submit);paint(agents.map(a=>projectUnit(a,null)),!!owner&&agents.length>0);
 if(owner&&agents.length)Promise.allSettled(agents.map(a=>Promise.resolve().then(()=>current()?loadContract(a.id):null))).then(results=>{if(current()){results.forEach((r,i)=>tokenReads.set(agents[i].id,tokenDraftRead(r.status==='fulfilled'?r.value:null,agents[i].id,owner)));paint(results.map((r,i)=>projectUnit(agents[i],r.status==='fulfilled'?r.value:null)));}});
 return {destroy(){dead=true;composerCleanup();host.removeEventListener('click',click);host.removeEventListener('submit',submit);}};
}
