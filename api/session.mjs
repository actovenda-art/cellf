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
  verifyPassword
} from './supabase.mjs';

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
      return sendJson(response, 200, {
        authenticated: Boolean(session),
        expiresAt: session ? new Date(session.exp * 1000).toISOString() : null
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
    if (!verifyPassword(body.password)) {
      throw new ApiError(401, 'INVALID_CREDENTIALS', 'A senha informada está incorreta.');
    }

    const session = issueSession();
    setSessionCookie(response, request, session.token);
    return sendJson(response, 200, { authenticated: true, expiresAt: session.expiresAt });
  } catch (error) {
    return sendApiError(response, error);
  }
}
