import {
  ApiError,
  MAX_STATE_BYTES,
  getSupabaseConfig,
  readJsonBody,
  sendApiError,
  sendJson,
  supabaseRequest
} from './supabase.mjs';
import { accessFor, readRecord, writeRecord, stateForAccess, mergeEmployeeState } from './access.mjs';

export default async function handler(request, response) {
  const method = String(request.method || 'GET').toUpperCase();
  if (!['GET', 'PUT'].includes(method)) {
    if (typeof response.setHeader === 'function') response.setHeader('Allow', 'GET, PUT');
    return sendJson(response, 405, {
      code: 'METHOD_NOT_ALLOWED',
      message: 'Método não permitido para os dados da Cellf.'
    });
  }

  try {
    const access = await accessFor(request);
    const config = getSupabaseConfig();

    if (method === 'GET') {
      const path = '/rest/v1/cellf_app_state?select=state,updated_at&id=eq.'
        + encodeURIComponent(config.stateId) + '&limit=1';
      const rows = await supabaseRequest(path);
      const record = Array.isArray(rows) ? rows[0] : null;
      return sendJson(response, 200, {
        state: stateForAccess(record?.state || null, access),
        access,
        updatedAt: record?.updated_at || null,
        source: 'supabase'
      });
    }

    const body = await readJsonBody(request, { maxBytes: MAX_STATE_BYTES });
    if (!body.state || typeof body.state !== 'object' || Array.isArray(body.state)) {
      throw new ApiError(400, 'INVALID_STATE', 'Envie os dados da aplicação como um objeto válido.');
    }

    const updatedAt = new Date().toISOString();
    if (!access.admin || body.updatedAt) {
      const previous = await readRecord();
      if (!access.admin && !body.updatedAt) throw new ApiError(409, 'VERSION_REQUIRED', 'Recarregue os dados antes de salvar.');
      if (body.updatedAt && body.updatedAt !== previous?.updated_at) throw new ApiError(409, 'STATE_CONFLICT', 'Outro dispositivo atualizou os dados. Recarregue antes de salvar.');
      const next = access.admin ? body.state : mergeEmployeeState(previous?.state || {}, body.state, access);
      const savedAt = await writeRecord(config.stateId, next, previous);
      return sendJson(response, 200, { state: stateForAccess(next, access), access, updatedAt: savedAt, source: 'supabase' });
    }
    const records = await supabaseRequest('/rest/v1/cellf_app_state?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: { id: config.stateId, state: body.state, updated_at: updatedAt }
    });
    const record = Array.isArray(records) ? records[0] : records;

    return sendJson(response, 200, {
      state: record?.state || body.state,
      updatedAt: record?.updated_at || updatedAt,
      source: 'supabase'
    });
  } catch (error) {
    return sendApiError(response, error);
  }
}
