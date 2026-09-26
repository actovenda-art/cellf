import { getSupabaseConfig, sendJson, sendApiError, supabaseRequest, ApiError } from './supabase.mjs';
import { readRecord } from './access.mjs';
export default async function handler(req,res) {
  try {
    if (req.method !== 'GET') throw new ApiError(405,'METHOD_NOT_ALLOWED','Método não permitido.');
    const record = await readRecord();
    const state = record?.state || {};
    const config = getSupabaseConfig();
    const devices = await Promise.all((state.devices || []).filter(d=>d.published && d.status === 'available' && (!d.productId || Number(state.products?.find(p=>p.id===d.productId)?.stock)>0)).map(async d => {
      const photos = await Promise.all((d.photos || []).slice(0,8).map(async photo => {
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(photo.storageId)) return null;
        const result = await supabaseRequest(`/storage/v1/object/sign/${encodeURIComponent(config.bucket)}/devices/${photo.storageId}`, {method:'POST',body:{expiresIn:300}}).catch(()=>null);
        const raw = result?.signedURL || result?.signedUrl;
        if (!raw) return null;
        const url = new URL(raw.startsWith('http') ? raw : config.url + '/storage/v1/' + raw.replace(/^\/+/,''));
        return url.origin === new URL(config.url).origin ? url.href : null;
      }));
      // Explicit public allowlist: no IMEI, provenance, supplier, cost or customer data.
      return {id:d.id,name:d.name,condition:d.condition,storage:d.storage,color:d.color,battery:d.battery,price:d.price,description:d.description,photos:photos.filter(Boolean)};
    }));
    return sendJson(res,200,{company:{name:state.settings?.companyName || 'CELLF',phone:state.settings?.phone || ''},devices});
  } catch(e) { return sendApiError(res,e); }
}
