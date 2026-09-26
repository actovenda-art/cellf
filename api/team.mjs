import { randomUUID } from 'node:crypto';
import { ApiError, hashPassword, normalizeLoginEmail, readJsonBody, requireAuthenticatedSession, sendJson, sendApiError } from './supabase.mjs';
import { MODULES, readTeam, teamId, writeRecord } from './access.mjs';
export default async function handler(req,res) {
  try {
    requireAuthenticatedSession(req);
    if (!['GET','POST'].includes(req.method)) throw new ApiError(405,'METHOD_NOT_ALLOWED','Método não permitido.');
    const record = await readTeam();
    const users = record?.state?.users || [];
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const previous = users.find(u=>u.id === body.id);
      const email = normalizeLoginEmail(body.email);
      if (!email || !String(body.name || '').trim()) throw new ApiError(400,'INVALID_USER','Informe nome e e-mail válidos.');
      if (email === normalizeLoginEmail(process.env.CELLF_ADMIN_EMAIL) || users.some(u=>u.email === email && u.id !== previous?.id)) throw new ApiError(409,'EMAIL_EXISTS','Este e-mail já está em uso.');
      const passwordHash = body.password ? hashPassword(body.password) : previous?.passwordHash;
      if (!passwordHash) throw new ApiError(400,'PASSWORD_REQUIRED','Informe uma senha inicial com pelo menos 8 caracteres.');
      const financial = Boolean(body.financial);
      const modules = MODULES.filter(m => body.modules?.includes(m) && (financial || !['cash','payables','reports'].includes(m)));
      const user = { id: previous?.id || randomUUID(), name: String(body.name).trim().slice(0,120), email, passwordHash, modules, financial, active: body.active !== false, version: (previous?.version || 0)+1 };
      const next = previous ? users.map(u=>u.id === previous.id ? user : u) : [...users,user];
      await writeRecord(teamId(), {users:next}, record);
      return sendJson(res,200,{users:next.map(({passwordHash,...u})=>u)});
    }
    return sendJson(res,200,{users:users.map(({passwordHash,...u})=>u)});
  } catch(e) { return sendApiError(res,e); }
}
