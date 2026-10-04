// Explicit user-authorized client key only. Never load the repository environment.
export function readReownProjectId(contents){
 const lines=contents.split(/\r?\n/).filter(line=>/^\s*VITE_REOWN_PROJECT_ID\s*=/.test(line));
 if(!lines.length)return '';
 if(lines.length!==1)throw Error('Duplicate VITE_REOWN_PROJECT_ID configuration');
 const match=lines[0].match(/^\s*VITE_REOWN_PROJECT_ID\s*=\s*["']?([a-f0-9]{32})["']?\s*(?:#.*)?$/i);
 if(!match)throw Error('Invalid VITE_REOWN_PROJECT_ID configuration');
 return match[1];
}
export function reownBrowserPolicy(enabled){
 return enabled?{connect:' https://api.web3modal.org https://api.web3modal.com https://api.reown.com https://rpc.walletconnect.org wss://relay.walletconnect.org wss://relay.walletconnect.com',images:' https://api.web3modal.org https://api.web3modal.com',frames:'https://verify.walletconnect.org https://verify.walletconnect.com'}:{connect:'',images:'',frames:"'none'"};
}
