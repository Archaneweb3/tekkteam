export function dexConfiguration(env=process.env){
 const requested=env.CONTROLLED_REAL_ENABLED==='true';
 const configured=typeof env.JUPITER_API_KEY==='string'&&env.JUPITER_API_KEY.trim().length>0;
 if(env.CONTROLLED_REAL_ENABLED&&!['true','false'].includes(env.CONTROLLED_REAL_ENABLED))throw Error('Invalid CONTROLLED_REAL_ENABLED');
 if(requested&&!configured)throw Error('Controlled Real blocked: Jupiter configuration unavailable');
 // Credentials are necessary for economic data, never sufficient to unlock signing.
 if(requested)throw Error('Controlled Real blocked: production route security gate NOT_READY');
 return Object.freeze({requested:false,enabled:false,providerConfigured:configured,endpoint:'https://api.jup.ag/swap/v2/build',routePolicyVersion:'jupiter-observed-v1-deny-all'});
}
