import {resolve} from 'node:path';
import {createPumpLaunch} from './pump-launch.js';
import 'dotenv/config';
import {runtime,dataPath,tokenConfiguration} from './runtime.js';
import {createMetadataPublisher} from './agent-metadata.js';
const config=runtime();
// Retired production sender may not be restarted without an explicit preserved
// quarantine manifest. Removing the file must not silently reopen legacy sends.
// This process is the explicit single-launch exception. Existing safety RPC stays read-only.
// The historical test receipt stays untouched and is never assigned to an agent.
createPumpLaunch({journal:dataPath('pump-agent-launches.json'),quarantineRequired:config.production,rpc:config.rpc,origins:config.origins,serviceHost:new URL(config.launchInternal).host,publishMetadata:createMetadataPublisher(tokenConfiguration(process.env))}).listen(config.launchPort,config.host,()=>console.log('Agent launch service ready. Manual wallet approval required.'));
