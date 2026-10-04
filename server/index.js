// The explicit local mode is selected before dotenv or product side effects load.
if(process.argv.includes('--wallet-test')){
 const {startWalletTest}=await import('./wallet-test-startup.js');
 await startWalletTest();
}else if(process.argv.includes('--http-only')){
 const {startHttpOnly}=await import('./http-only-startup.js');
 await startHttpOnly('api');
}else{
 await import('./operational-api.js');
}
