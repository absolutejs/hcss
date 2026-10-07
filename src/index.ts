/** HCSS HeavyJob read API. Raw provider units are intentionally preserved. */
export class HcssError extends Error {
  constructor(public readonly code: 'INVALID_INPUT' | 'INVALID_RESPONSE' | 'UNAVAILABLE' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'RATE_LIMITED' | 'LIMIT_EXCEEDED', public readonly httpStatus?: number) {
    super(`HCSS request failed: ${code}`); this.name = 'HcssError';
  }
}
type Row = Record<string, unknown>;
const fail = (): never => { throw new HcssError('INVALID_RESPONSE'); };
const object = (v: unknown): Row => v && typeof v === 'object' && !Array.isArray(v) ? v as Row : fail();
const string = (v: unknown): string => typeof v === 'string' && v.length <= 4096 ? v : fail();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: unknown): string => typeof v === 'string' && uuidPattern.test(v) ? v.toLowerCase() : fail();
const inputId = (v: string) => { if (!uuidPattern.test(v)) throw new HcssError('INVALID_INPUT'); return v.toLowerCase(); };
const optionalText = (v: unknown): string | null => v == null ? null : string(v);
const number = (v: unknown): number | null => v == null ? null : typeof v === 'number' && Number.isFinite(v) ? v : fail();
const flag = (v: unknown): boolean | null => v == null ? null : typeof v === 'boolean' ? v : fail();
const status = (v: unknown): string | null => optionalText(v);
const base = (r: Row) => ({ id: uuid(r.id), code: string(r.code), description: optionalText(r.description) });
export type BusinessUnit = ReturnType<typeof businessUnit>;
const businessUnit = (v: unknown) => base(object(v));
export type Job = ReturnType<typeof job>;
const job = (v: unknown) => { const r=object(v); return {...base(r), businessUnitId: uuid(r.businessUnitId), status: string(r.status), isDeleted: flag(r.isDeleted)}; };
export type CostCode = ReturnType<typeof costCode>;
const costCode = (v: unknown) => { const r=object(v); return {...base(r), jobId: uuid(r.jobId), businessUnitId: uuid(r.businessUnitId), quantity: number(r.quantity), unitOfMeasure: optionalText(r.unitOfMeasure), status: status(r.status), isDeleted: flag(r.isDeleted), materialDollars: number(r.materialDollars)}; };
export type JobMaterial = ReturnType<typeof jobMaterial>;
const jobMaterial = (v: unknown) => { const r=object(v); return {...base(r), jobId: uuid(r.jobId), materialId: uuid(r.materialId), unitOfMeasure: optionalText(r.unitOfMeasure), unitCost: number(r.unitCost), isDeleted: flag(r.isDeleted), isDiscontinued: flag(r.isDiscontinued)}; };
export type MaterialBudget = ReturnType<typeof materialBudget>;
const materialBudget = (v: unknown) => { const r=object(v); return {id:uuid(r.id), costCodeId:uuid(r.costCodeId), jobMaterialId:uuid(r.jobMaterialId), purchaseOrderDetailId:uuid(r.purchaseOrderDetailId), purchaseOrderId:r.purchaseOrderId == null ? null : uuid(r.purchaseOrderId), quantity:number(r.quantity), unitOfMeasure:optionalText(r.unitOfMeasure), unitCost:number(r.unitCost), status:status(r.status), isDeleted:flag(r.isDeleted)}; };
export type HcssOptions = {
  clientId: string; clientSecret: string;
  /** Injectable for testing; requests always target the documented HCSS host. */
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  timeoutMs?: number; maxResponseBytes?: number; maxItems?: number; maxPages?: number;
};
export function createHcssClient(options: HcssOptions) {
  if (!options.clientId.trim() || !options.clientSecret || options.clientId.length > 4096 || options.clientSecret.length > 4096) throw new HcssError('INVALID_INPUT');
  const fetcher = options.fetch ?? globalThis.fetch;
  const timeout = options.timeoutMs ?? 15000, maxBytes = options.maxResponseBytes ?? 4 * 1024 * 1024;
  const maxItems = options.maxItems ?? 10000, maxPages = options.maxPages ?? 20;
  for (const n of [timeout,maxBytes,maxItems,maxPages]) if (!Number.isSafeInteger(n) || n < 1) throw new HcssError('INVALID_INPUT');
  let token: {value:string; expires:number} | undefined;
  let pending: Promise<string> | undefined;
  async function request(path: string, init: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(),timeout);
    try {
      const r = await fetcher('https://api.hcssapps.com' + path, {...init, signal:controller.signal, redirect:'error'});
      if (!r.ok) { await r.body?.cancel(); throw new HcssError(r.status === 401 ? 'UNAUTHORIZED' : r.status === 403 ? 'FORBIDDEN' : r.status === 429 ? 'RATE_LIMITED' : 'UNAVAILABLE',r.status); }
      if (!r.body) throw new HcssError('INVALID_RESPONSE');
      const reader = r.body.getReader(); let size=0; const chunks: Uint8Array[]=[];
      try { while(true) { const {done,value}=await reader.read(); if(done) break; size+=value.byteLength; if(size>maxBytes) throw new HcssError('LIMIT_EXCEEDED'); chunks.push(value); } }
      finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
      const bytes=new Uint8Array(size); let offset=0; for(const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.length;}
      try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new HcssError('INVALID_RESPONSE'); }
    } catch(e) { if(e instanceof HcssError) throw e; throw new HcssError('UNAVAILABLE'); }
    finally { clearTimeout(timer); }
  }
  async function accessToken(): Promise<string> {
    if(token && token.expires>Date.now()) return token.value;
    if(pending) return pending;
    pending=(async()=>{
      const started=Date.now();
      const r=object(await request('/identity/connect/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:new URLSearchParams({grant_type:'client_credentials',client_id:options.clientId,client_secret:options.clientSecret,scope:'heavyjob:read'})}));
      const value=string(r.access_token), seconds=number(r.expires_in);
      if(!value || /[\r\n]/.test(value) || typeof r.token_type!=='string' || r.token_type.toLowerCase()!=='bearer' || seconds===null || seconds<=0) fail();
      token={value,expires:started+Math.max(0,seconds!-30)*1000}; return value;
    })();
    try {return await pending;} finally {pending=undefined;}
  }
  async function get(path:string) {
    const value=await accessToken();
    try { return await request('/heavyjob'+path,{method:'GET',headers:{Authorization:'Bearer '+value,Accept:'application/json'}}); }
    catch(e) { if(e instanceof HcssError && e.code==='UNAUTHORIZED') token=undefined; throw e; }
  }
  function list<T>(v:unknown, decode:(v:unknown)=>T):T[] {
    if(!Array.isArray(v)) fail(); const a=v as unknown[]; if(a.length>maxItems) throw new HcssError('LIMIT_EXCEEDED');
    const result=a.map(decode); const ids=new Set(result.map(r=>(r as {id:string}).id)); if(ids.size!==result.length) fail(); return result;
  }
  return {
    businessUnits: async () => list(await get('/api/v1/businessUnits'), businessUnit),
    jobs: async (businessUnitId:string) => list(await get('/api/v1/jobs?'+new URLSearchParams({businessUnitId:inputId(businessUnitId)})),job),
    jobMaterials: async (jobId:string) => list(await get(`/api/v1/jobs/${inputId(jobId)}/costTypes/jobMaterial?isDeleted=false&isDiscontinued=false`),jobMaterial),
    materialBudgets: async (jobId:string) => list(await get(`/api/v1/jobs/${inputId(jobId)}/advancedBudgets/material?isDeleted=false&isDiscontinued=false`),materialBudget),
    costCodes: async (jobId:string) => {
      const results:CostCode[]=[]; let cursor:string|null=null; const seen=new Set<string>(); const ids=new Set<string>();
      for(let page=0;page<maxPages;page++) {
        const query=new URLSearchParams({jobId:inputId(jobId),isDeleted:'false',limit:'1000'}); if(cursor) query.set('cursor',cursor);
        const r=object(await get('/api/v2/costCodes?'+query)); const rows=list(r.results,costCode);
        for(const row of rows) {if(ids.has(row.id)) fail();ids.add(row.id);results.push(row);}
        if(results.length>maxItems) throw new HcssError('LIMIT_EXCEEDED');
        cursor=optionalText(object(r.metadata).nextCursor); if(!cursor) return results;
        if(seen.has(cursor)) throw new HcssError('INVALID_RESPONSE'); seen.add(cursor);
      }
      throw new HcssError('LIMIT_EXCEEDED');
    }
  };
}
export type HcssClient = ReturnType<typeof createHcssClient>;
