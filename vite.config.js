import { defineConfig } from 'vite';
export default defineConfig({ server: { proxy: { '/api/pump-launch': {target:'http://127.0.0.1:4193',changeOrigin:true,rewrite:path=>path.replace(/^\/api/,'')}, '/pump-launch': {target:'http://127.0.0.1:4193',changeOrigin:true}, '/mainnet-rpc': 'http://127.0.0.1:4191', '/api': 'http://127.0.0.1:4190' } } });
