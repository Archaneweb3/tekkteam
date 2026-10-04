import {publicConfig} from '../../server/config.js';

// The CURRENT demo contract describes a read-only presentation without owner
// capabilities. The fixture HTTP transport is online, but no operational backend
// is available. Preserve actual disposable data; never replace unknown data.
export function fixtureEnvelope(data, pathname) {
  if (pathname === '/api/state') {
    if (!data.config || data.session !== null || !Array.isArray(data.agents) || data.agents.length || !Array.isArray(data.events) || data.events.length) {
      throw Error('LOCAL_FIXTURE_NONEMPTY_OR_INVALID_STATE');
    }
    data = {...data, config: {...publicConfig('demo'), preview:true, backendOnline:false,
      dataSource:'LOCAL_FIXTURE', previewTransportOnline:true, fixtureApplicationNetwork:'local',
      capabilities:{walletAuth:false,persistentAgents:false,devnetMint:false,pumpfun:false,autonomousTrading:false}}};
  }
  if (pathname === '/api/health') data = {...data,paperTrading:false,backgroundJobs:false,externalRpc:false};
  return {...data,dataSource:'LOCAL_FIXTURE'};
}
