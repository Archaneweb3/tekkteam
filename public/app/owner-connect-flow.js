// One user-initiated connection attempt. Only the authenticated server session
// proves ownership; the connected public key alone never authenticates a user.
export function createOwnerConnectFlow({connectWallet,connection,readSession,authenticate,onPhase=()=>{}}){
 let pending=null,revision=0;
 return {
  cancel(){++revision;},
  run(id,{authenticateOnly=false,canAuthenticate=true}={}){
   if(pending)return pending;
   const version=++revision;
   const current=owner=>{if(version!==revision||!owner||connection()?.address!==owner)throw Error('Wallet connection changed or sign-in was cancelled.');};
   const work=async()=>{
    let owner;
    try{
     onPhase(authenticateOnly?'CONNECTED':'CONNECTING');
     owner=authenticateOnly?connection()?.address:await connectWallet(id);
     current(owner);onPhase('CONNECTED');
     if(!canAuthenticate)return {address:owner,authenticated:false};
     const existing=await readSession();current(owner);
     if(existing?.session?.address===owner){onPhase('AUTHENTICATED');return {address:owner,authenticated:true,state:existing,restored:true};}
     onPhase('AUTH_REQUIRED');onPhase('SIGN_IN_REQUESTED');
     await authenticate(id,owner,{automatic:!authenticateOnly});current(owner);
     const state=await readSession();current(owner);
     if(state?.session?.address!==owner)throw Error('Authenticated owner session was not established.');
     onPhase('AUTHENTICATED');return {address:owner,authenticated:true,state,restored:false};
    }catch(error){onPhase(owner&&connection()?.address===owner?'AUTH_REQUIRED':'DISCONNECTED');throw error;}
   };
   pending=work().finally(()=>{pending=null;});return pending;
  }
 };
}
