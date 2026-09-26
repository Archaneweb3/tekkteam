import {createMainnetTransport} from './mainnet-rpc-transport.js';
// Local diagnostic transport only. No vault, database, signing or broadcast adapter.
createMainnetTransport().listen(4191,'127.0.0.1',()=>console.log('MAINNET SAFETY read-only transport listening on 127.0.0.1:4191'));
