// The explicit local mode is selected before dotenv or product side effects load.
if(process.argv.includes('--http-only')){
 const {startHttpOnly}=await import('./http-only-startup.js');
 await startHttpOnly('launch');
}else{
 await import('./operational-launch.js');
}
