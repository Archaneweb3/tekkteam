import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeTokenDraft} from '../src/token-draft-schema.js';

const base = () => ({name:'Legacy Token',ticker:'tk_1'});
const urls = ['image','website','twitter','telegram'];
function rejected(input,code,field='input') {
 assert.throws(()=>normalizeTokenDraft(input),error=>{
  assert.equal(error.constructor,TypeError);
  assert.equal(error.code,code);
  assert.equal(error.field,field);
  assert.equal(error.message,`${code}: ${field}`);
  assert.deepEqual(Object.keys(error).sort(),['code','field']);
  return true;
 });
}

test('legacy metadata has no fabricated description, image, socials or mint',()=>{
 const input=Object.freeze(base()),output=normalizeTokenDraft(input);
 assert.deepEqual(output,input);assert.notEqual(output,input);assert.ok(Object.isFrozen(output));
 assert.deepEqual(Object.keys(output),['name','ticker']);
 assert.throws(()=>{output.name='changed';},TypeError);
});
test('identity-only null remains a caller-owned sentinel, never coerced into a token',()=>{
 const identity=Object.freeze({id:'identity',coin:null});
 rejected(identity.coin,'TOKEN_DRAFT_INPUT');assert.equal(identity.coin,null);
});
test('normalization returns deterministic flat scalars with exact text/case',()=>{
 const input={...base(),name:'  Café  ',ticker:'tK_1',description:'Plain <b>text</b>\nSecond line\tTabbed',image:'HTTPS://EXAMPLE.COM:443/image.png',website:'https://example.com',twitter:'https://example.com/@owner',telegram:'https://example.com/group'};
 const before=JSON.stringify(input),output=normalizeTokenDraft(input);
 assert.deepEqual(output,{...input,image:'https://example.com/image.png',website:'https://example.com/'});
 assert.deepEqual(normalizeTokenDraft(output),output);assert.equal(JSON.stringify(input),before);
 assert.ok(Object.values(output).every(x=>typeof x==='string'));
 assert.deepEqual(normalizeTokenDraft({...Object.fromEntries(Object.entries(input).reverse())}),output);
 assert.deepEqual(Object.keys(output),['name','ticker','description','image','website','twitter','telegram']);
});
test('own null-prototype draft accepted; inherited or custom-class fields rejected',()=>{
 const input=Object.assign(Object.create(null),base());assert.deepEqual(normalizeTokenDraft(input),base());
 rejected(Object.create(base()),'TOKEN_DRAFT_INPUT');
 class Draft { constructor(){Object.assign(this,base());} }
 rejected(new Draft(),'TOKEN_DRAFT_INPUT');
});
test('non-object, array and exotic inputs are rejected with stable errors',()=>{
 for(const input of [undefined,null,false,true,0,1n,'SECRET_INPUT',[],[base()],new Date(),new Map(),new Set(),()=>base(),Symbol('SECRET')])rejected(input,'TOKEN_DRAFT_INPUT');
 const p=Proxy.revocable(base(),{});p.revoke();rejected(p.proxy,'TOKEN_DRAFT_INPUT');
});
test('UTF8 name/ticker boundaries match effective launch limits without coercion',()=>{
 for(const [field,limit] of [['name',32],['ticker',10]]){
  for(const value of ['a'.repeat(limit),'é'.repeat(limit/2)])assert.equal(normalizeTokenDraft({...base(),[field]:value})[field],value);
  for(const value of ['a'.repeat(limit+1),'é'.repeat(limit/2+1)])rejected({...base(),[field]:value},'TOKEN_DRAFT_TEXT',field);
  for(const value of ['', '   ', '\n', '\u00a0'])rejected({...base(),[field]:value},'TOKEN_DRAFT_TEXT',field);
  for(const value of [null,undefined,123,false,{},[],new String('value')])rejected({...base(),[field]:value},'TOKEN_DRAFT_TYPE',field);
  const missing=base();delete missing[field];rejected(missing,'TOKEN_DRAFT_TYPE',field);
 }
 assert.equal(normalizeTokenDraft({...base(),name:'😀'.repeat(8)}).name,'😀'.repeat(8));
 rejected({...base(),ticker:'😀'.repeat(3)},'TOKEN_DRAFT_TEXT','ticker');
});
test('description bound is existing 1000 JS characters, not UTF8 bytes',()=>{
 for(const description of ['', 'a'.repeat(1000),'é'.repeat(1000),'😀'.repeat(500),'line\nline\r\n\ttext'])assert.equal(normalizeTokenDraft({...base(),description}).description,description);
 rejected({...base(),description:'a'.repeat(1001)},'TOKEN_DRAFT_TEXT','description');
 rejected({...base(),description:'😀'.repeat(501)},'TOKEN_DRAFT_TEXT','description');
 for(const description of [null,undefined,[],{},0,false])rejected({...base(),description},'TOKEN_DRAFT_TYPE','description');
});
test('all text/URL control characters rejected without altering permitted multiline description',()=>{
 for(let byte=0;byte<=0x9f;byte++){
  if(byte>0x1f&&byte<0x7f)continue;
  const control=String.fromCharCode(byte);
  for(const field of ['name','ticker'])rejected({...base(),[field]:'x'+control},'TOKEN_DRAFT_TEXT',field);
  if(![9,10,13].includes(byte))rejected({...base(),description:'text'+control},'TOKEN_DRAFT_TEXT','description');
  for(const field of urls)rejected({...base(),[field]:'https://example.com/'+control},'TOKEN_DRAFT_URL',field);
 }
});
test('lone surrogates rejected; valid Unicode URL normalization remains idempotent',()=>{
 for(const bad of ['\ud800','\udfff','x\ud800z']){
  for(const field of ['name','ticker','description'])rejected({...base(),[field]:bad},'TOKEN_DRAFT_TEXT',field);
  for(const field of urls)rejected({...base(),[field]:'https://example.com/'+bad},'TOKEN_DRAFT_URL',field);
 }
 const output=normalizeTokenDraft({...base(),website:'https://例子.com/é/😀'});
 assert.equal(output.website,'https://xn--fsqu00a.com/%C3%A9/%F0%9F%98%80');
 assert.deepEqual(normalizeTokenDraft(output),output);
});
test('only optional public HTTPS scalar URLs accepted, no bytes or nested socials',()=>{
 const invalid=['','http://example.com','javascript:alert(1)','data:image/png;base64,AAAA','file:///image.png','/metadata/image.png','C:\\image.png','//example.com','https:example.com','https:///example.com','https://','not a URL',' https://example.com','https://example.com ','https://example.com\\path','https://owner:SECRET@example.com','https://owner@example.com','https://@example.com','https://localhost','https://LOCALHOST./a','https://sub.localhost','https://127.0.0.1','https://2130706433','https://0x7f000001','https://[::1]','https://[fe80::1]','https://example.com/%00','https://example.com/%1F','https://example.com/%7f','https://example.com/%C2%80'];
 for(const field of urls){
  for(const value of invalid)rejected({...base(),[field]:value},'TOKEN_DRAFT_URL',field);
  for(const value of [null,undefined,0,false,[],{},new String('https://example.com')])rejected({...base(),[field]:value},'TOKEN_DRAFT_TYPE',field);
 }
 rejected({...base(),socials:{website:'https://example.com'}},'TOKEN_DRAFT_UNKNOWN_FIELD');
});
test('new 2048-character URL bound applies to each URL and normalized value',()=>{
 const prefix='https://example.com/';
 for(const field of urls){
  const value=prefix+'a'.repeat(2048-prefix.length);assert.equal(normalizeTokenDraft({...base(),[field]:value})[field],value);
  rejected({...base(),[field]:value+'a'},'TOKEN_DRAFT_URL',field);
  // Raw Unicode input fits, but its percent-encoded URL exceeds the same cap.
  rejected({...base(),[field]:prefix+'é'.repeat(400)},'TOKEN_DRAFT_URL',field);
 }
});
test('unknown keys, symbols and prototype pollution fail without reflecting key/value secrets',()=>{
 for(const key of ['mint','secret','owner','agentId','tokenDescription','symbol','capability','SECRET_KEY','__proto__','constructor','prototype']){
  const input=JSON.parse(JSON.stringify(base()));Object.defineProperty(input,key,{value:'SECRET_VALUE',enumerable:true});
  rejected(input,'TOKEN_DRAFT_UNKNOWN_FIELD');assert.equal({}.polluted,undefined);
 }
 const input=base();input[Symbol('SECRET_SYMBOL')]='SECRET_VALUE';rejected(input,'TOKEN_DRAFT_UNKNOWN_FIELD');
});
test('getters and non-enumerable fields rejected without evaluating input code',()=>{
 for(const field of ['name','ticker','description',...urls]){
  const input=base();let called=0;Object.defineProperty(input,field,{get(){called++;throw Error('SECRET_ACCESSOR');},enumerable:true});
  rejected(input,'TOKEN_DRAFT_FIELD',field);assert.equal(called,0);
  const hidden=base();Object.defineProperty(hidden,field,{value:'SECRET_VALUE',enumerable:false});rejected(hidden,'TOKEN_DRAFT_FIELD',field);
 }
});
test('reflective proxy failure is sanitized without reading thrown error properties',()=>{
 for(const trap of ['getPrototypeOf','ownKeys','getOwnPropertyDescriptor']){
  let reads=0;const secret=new Proxy({}, {get(){reads++;throw Error('SECRET_ERROR');}});
  const input=new Proxy(base(),{[trap](){throw secret;}});
  rejected(input,'TOKEN_DRAFT_INPUT');assert.equal(reads,0);
 }
});
test('validation does not mutate frozen caller fields, nor fetch URLs on success/failure',()=>{
 const oldFetch=globalThis.fetch;let fetches=0;globalThis.fetch=()=>{fetches++;throw Error('Unexpected network');};
 try{
  const input=Object.freeze({...base(),website:'https://example.com/path'}),before=Object.getOwnPropertyDescriptors(input);
  normalizeTokenDraft(input);assert.deepEqual(Object.getOwnPropertyDescriptors(input),before);
  rejected(Object.freeze({...input,secret:'SECRET'}),'TOKEN_DRAFT_UNKNOWN_FIELD');assert.equal(fetches,0);
 }finally{globalThis.fetch=oldFetch;}
});
test('pure module has no imports, persistence, execution or URL-fetch helpers',()=>{
 const source=readFileSync(new URL('../src/token-draft-schema.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\bimport\b|\bfetch\s*\(|\bprocess\b|\bBuffer\b|writeFile|readFile|Keypair|signTransaction|broadcast|localStorage/);
});
