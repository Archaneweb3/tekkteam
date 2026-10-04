export function validateOwnerAuthChallenge(challenge,owner,origin,now=Date.now()){
 // Small cross-process clock skew allowance does not extend the server's expiry.
 if(!challenge||typeof challenge.id!=='string'||!Number.isSafeInteger(challenge.expires)||challenge.expires<=now||challenge.expires>now+301000||typeof challenge.message!=='string'||challenge.message.length>2000)throw Error('Sign-in expired. Please try again.');
 const expected=challenge.manualApprovalRequired===true?`TEKKTEAM isolated local owner authentication\nDomain: ${new URL(origin).host}\nOrigin: ${origin}\nWallet: ${owner}\nNonce: ${challenge.id}\nExpires: ${new Date(challenge.expires).toISOString()}\nPurpose: authenticate this wallet to disposable local TEKKTEAM data only.\nNo launch, transaction, payment, funding, withdrawal or trading is authorized.`:`TEKKTEAM wallet sign-in\nOrigin: ${origin}\nWallet: ${owner}\nNonce: ${challenge.id}\nExpires: ${new Date(challenge.expires).toISOString()}\nThis signature signs you in. It does not authorize a payment.`;
 if(challenge.message!==expected)throw Error('Local auth challenge binding mismatch');
 return expected;
}

export function reviewOwnerAuthChallenge(challenge,owner){
 const message=validateOwnerAuthChallenge(challenge,owner,location.origin);
 return new Promise(resolve=>{
  const dialog=document.createElement('dialog');dialog.className='tw-dialog';
  dialog.innerHTML='<h2>Sign In</h2><p>Confirm you own this wallet to manage your Agents. Your wallet will ask you to sign a message. This does not cost SOL or approve a transaction.</p><details><summary>View message</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;max-height:35vh;overflow:auto"></pre></details><p role="status">No signature requested yet.</p><button type="button" class="tw-button" data-auth-cancel>Cancel</button> <button type="button" class="tw-button primary" data-auth-approve>Continue to Wallet</button>';
  dialog.querySelector('pre').textContent=message;document.body.append(dialog);
  let approved=false;const timer=setTimeout(()=>dialog.close(),Math.max(0,challenge.expires-Date.now()));
  dialog.querySelector('[data-auth-cancel]').onclick=()=>dialog.close();
  dialog.querySelector('[data-auth-approve]').onclick=()=>{if(Date.now()>=challenge.expires)return dialog.close();approved=true;dialog.close();};
  dialog.onclose=()=>{clearTimeout(timer);dialog.remove();resolve(approved);};dialog.showModal();
 });
}
