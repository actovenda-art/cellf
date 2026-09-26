import {
  ApiError,
  assertSameOrigin,
  clearSessionCookie,
  isAuthConfigured,
  issueSession,
  readJsonBody,
  readSession,
  sendApiError,
  sendJson,
  setSessionCookie,
  verifyCredentials
} from './supabase.mjs';
import { readTeam, passwordMatches, accessFor } from './access.mjs';

export default async function handler(request, response) {
  const method = String(request.method || 'GET').toUpperCase();

  if (!['GET', 'POST', 'DELETE'].includes(method)) {
    if (typeof response.setHeader === 'function') response.setHeader('Allow', 'GET, POST, DELETE');
    return sendJson(response, 405, {
      code: 'METHOD_NOT_ALLOWED',
      message: 'Método não permitido para a sessão.'
    });
  }

  try {
    if (method === 'GET') {
      if (!isAuthConfigured()) {
        throw new ApiError(503, 'AUTH_NOT_CONFIGURED', 'O acesso seguro da Cellf ainda não foi configurado.');
      }
      const session = readSession(request);
      const access = session ? await accessFor(request) : null;
      return sendJson(response, 200, {
        authenticated: Boolean(session),
        expiresAt: session ? new Date(session.exp * 1000).toISOString() : null,
        email: session?.email || null,
        access
      });
    }

    assertSameOrigin(request);

    if (method === 'DELETE') {
      clearSessionCookie(response, request);
      return sendJson(response, 200, { authenticated: false });
    }

    if (!isAuthConfigured()) {
      throw new ApiError(503, 'AUTH_NOT_CONFIGURED', 'O acesso seguro da Cellf ainda não foi configurado.');
    }

    const body = await readJsonBody(request, { maxBytes: 4 * 1024 });
    let employee = null;
    if (!verifyCredentials(body.email, body.password)) {
      if (String(body.email || '').trim().toLowerCase() === String(process.env.CELLF_ADMIN_EMAIL || '').trim().toLowerCase()) throw new ApiError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos.');
      const record = await readTeam().catch(() => null);
      employee = record?.state?.users?.find(u => u.active && u.email === String(body.email || '').trim().toLowerCase());
      if (!employee || !passwordMatches(body.password, employee.passwordHash)) {
        throw new ApiError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos.');
      }
    }

    const session = issueSession(body.email, employee);
    setSessionCookie(response, request, session.token);
    return sendJson(response, 200, {
      authenticated: true,
      expiresAt: session.expiresAt,
      email: String(body.email || '').trim().toLowerCase()
    });
  } catch (error) {
    return sendApiError(response, error);
  }
}
