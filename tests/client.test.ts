import {test,expect} from 'bun:test';
import {createHcssClient} from '../src';
const id='11111111-1111-4111-8111-111111111111';
const token={access_token:'synthetic-token',token_type:'Bearer',expires_in:3600};
const row={id,code:'A',businessUnitId:id,jobId:id};
const response=(body:unknown)=>Response.json(body);
test('read scope, fixed host, secret-safe projection and coalesced tokens',async()=>{
 let tokens=0;
 const client=createHcssClient({clientId:'client',clientSecret:'secret',fetch:async(input,init)=>{
  expect(String(input).startsWith('https://api.hcssapps.com/')).toBe(true);
  expect(init?.redirect).toBe('error');
  if(String(input).endsWith('/connect/token')) {tokens++;expect(String(init?.body)).toContain('scope=heavyjob%3Aread');return response(token);}
  expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer synthetic-token');return response([{...row,unexpected:'discard'}]);
 }});
 const [a,b]=await Promise.all([client.businessUnits(),client.businessUnits()]);
 expect(tokens).toBe(1);expect(a).toEqual(b);expect(a[0]).toEqual({id,code:'A',description:null});
});
test('cursor pagination preserves missing quantity and checks completeness',async()=>{
 let page=0;
 const client=createHcssClient({clientId:'c',clientSecret:'s',fetch:async(input)=>{
  if(String(input).endsWith('/connect/token')) return response(token);
  page++;if(page===2) expect(String(input)).toContain('cursor=next%2Bpage');
  return response({results:page===1?[row]:[],metadata:{nextCursor:page===1?'next+page':null}});
 }});
 const rows=await client.costCodes(id);expect(page).toBe(2);expect(rows[0]?.quantity).toBeNull();expect(rows[0]?.isDeleted).toBeNull();
});
test('repeated cursors, malformed rows and item limits fail closed',async()=>{
 for(const body of [{results:[],metadata:{nextCursor:'loop'}},[{id:'bad',code:'A'}],[row,row]]) {
  const client=createHcssClient({clientId:'c',clientSecret:'s',fetch:async(input)=>response(String(input).endsWith('/connect/token')?token:body)});
  await expect(Array.isArray(body)?client.businessUnits():client.costCodes(id)).rejects.toMatchObject({code:'INVALID_RESPONSE'});
 }
 const client=createHcssClient({clientId:'c',clientSecret:'s',maxItems:1,fetch:async(input)=>response(String(input).endsWith('/connect/token')?token:[row,row])});
 await expect(client.businessUnits()).rejects.toMatchObject({code:'LIMIT_EXCEEDED'});
});
test('bounded bodies, sanitized status errors, no automatic retries',async()=>{
 for(const status of [401,403,429,500]) {
  let requests=0;const c=createHcssClient({clientId:'c',clientSecret:'s',fetch:async()=>{requests++;return new Response('sensitive-provider-body',{status});}});
  try {await c.businessUnits();throw Error('unexpected success');}catch(e){expect(String(e)).not.toContain('sensitive-provider-body');expect(e).toHaveProperty('httpStatus',status);}
  expect(requests).toBe(1);
 }
 const c=createHcssClient({clientId:'c',clientSecret:'s',maxResponseBytes:5,fetch:async()=>response(token)});
 await expect(c.businessUnits()).rejects.toMatchObject({code:'LIMIT_EXCEEDED'});
});
test('invalid IDs are rejected before token or data requests',async()=>{
 const c=createHcssClient({clientId:'c',clientSecret:'s',fetch:async()=>{throw Error('must not fetch');}});
 await expect(c.jobs('../other')).rejects.toMatchObject({code:'INVALID_INPUT'});
});
test('timeout cancels pending HTTP and failed token acquisition can be retried explicitly',async()=>{
 let requests=0;const c=createHcssClient({clientId:'c',clientSecret:'s',timeoutMs:10,fetch:async(_input,init)=>{requests++;return new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(Error('secret'))));}});
 await expect(c.businessUnits()).rejects.toMatchObject({code:'UNAVAILABLE'});
 await expect(c.businessUnits()).rejects.toMatchObject({code:'UNAVAILABLE'});expect(requests).toBe(2);
});
