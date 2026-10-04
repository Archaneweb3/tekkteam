export const fixtureOwner='ECMaFXkpb2bDFKXQciAKa1HNtqWgJs9PU3DcEmzgNMNS';
export const fixtureOtherOwner='11111111111111111111111111111111';
export const defaultPorts=Object.freeze({frontend:5198,backend:4290});
export const provenance=Object.freeze({dataSource:'LOCAL_FIXTURE',authSource:'TEST_SESSION_SEEDED',realWalletAuthenticated:false,backgroundJobs:false,publicDelivery:'UNVERIFIED'});
export function port(value){const n=Number(value);if(!Number.isInteger(n)||n<1024||n>65535||[5188,4190].includes(n))throw Error('Separate fixture port required');return n;}
export function permitted(method,pathname){
 if(method==='GET')return ['/api/health','/api/state','/api/strategy-registry'].includes(pathname)||/^\/api\/agents\/[a-zA-Z0-9_-]+(?:\/(?:contract|operating-plan|launch-lifecycle))?$/.test(pathname);
 return method==='POST'&&(pathname==='/api/launchpad/agent-identities'||/^\/api\/launchpad\/agents\/[a-zA-Z0-9_-]+\/token-draft$/.test(pathname));
}
export function trustedRequest(req,ports){
 const hosts=[`127.0.0.1:${ports.backend}`,`127.0.0.1:${ports.frontend}`];
 return hosts.includes(req.headers.host)&&(!req.headers.origin||req.headers.origin===`http://127.0.0.1:${ports.frontend}`)&&(!req.headers['sec-fetch-site']||['same-origin','none'].includes(req.headers['sec-fetch-site']));
}
export function frontendPathAllowed(pathname,cachePrefix){
 if((/(?:^|\/)\./.test(pathname)&&!/^\/node_modules\/\.vite\/deps\//.test(pathname))||(/^\/(?:server|tools|tests|docs|artifacts)(?:\/|$)/.test(pathname)&&pathname!=='/server/config.js')||(pathname.startsWith('/@fs/')&&!pathname.startsWith(cachePrefix)))return false;
 return true;
}
