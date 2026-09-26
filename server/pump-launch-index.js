import {resolve} from 'node:path';
import {createPumpLaunch} from './pump-launch.js';
import 'dotenv/config';
import {runtime,dataPath} from './runtime.js';
const config=runtime();
// This process is the explicit single-launch exception. Existing safety RPC stays read-only.
// The historical test receipt stays untouched and is never assigned to an agent.
createPumpLaunch({journal:dataPath('pump-agent-launches.json'),rpc:config.rpc,origins:config.origins,serviceHost:new URL(config.launchInternal).host}).listen(config.launchPort,config.host,()=>console.log('Agent launch service ready. Manual wallet approval required.'));
