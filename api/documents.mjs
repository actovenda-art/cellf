import {
  ApiError,
  MAX_DOCUMENT_BYTES,
  getSupabaseConfig,
  queryValue,
  readJsonBody,
  requireAuthenticatedSession,
  sendApiError,
  sendJson,
  supabaseRequest
} from './supabase.mjs';

const DOCUMENT_TYPES = new Map([
  ['pdf', ['application/pdf']],
  ['jpg', ['image/jpeg']],
  ['jpeg', ['image/jpeg']],
  ['png', ['image/png']],
  ['webp', ['image/webp']],
  ['doc', ['application/msword']],
  ['docx', ['application/vnd.openxmlformats-officedocument.wordprocessingml.document']],
  ['xls', ['application/vnd.ms-excel']],
  ['xlsx', ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']],
  ['txt', ['text/plain']],
  ['csv', ['text/csv']]
]);

function validatedId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id)) {
    throw new ApiError(400, 'INVALID_DOCUMENT_ID', 'O identificador do documento é inválido.');
  }
  return id;
}

function documentPath(id) {
  return 'company/' + validatedId(id);
}

function encodedObjectPath(config, path) {
  return encodeURIComponent(config.bucket) + '/' + path.split('/').map(encodeURIComponent).join('/');
}

function signedStorageUrl(config, value) {
  if (typeof value !== 'string' || !value) {
    throw new ApiError(502, 'INVALID_SIGNED_URL', 'O armazenamento não forneceu uma autorização válida.');
  }

  let signed;
  try {
    signed = value.startsWith('https://') || value.startsWith('http://')
      ? new URL(value)
      : new URL(config.url + '/storage/v1/' + value.replace(/^\/+/, ''));
  } catch {
    throw new ApiError(502, 'INVALID_SIGNED_URL', 'O armazenamento não forneceu uma autorização válida.');
  }

  const origin = new URL(config.url).origin;
  if (signed.origin !== origin || !signed.pathname.startsWith('/storage/v1/object/')) {
    throw new ApiError(502, 'INVALID_SIGNED_URL', 'O armazenamento não forneceu uma autorização válida.');
  }
  return signed;
}

function validateUpload(value) {
  const id = validatedId(value.id);
  const fileName = typeof value.fileName === 'string' ? value.fileName.trim() : '';
  const contentType = typeof value.contentType === 'string'
    ? value.contentType.split(';')[0].trim().toLowerCase()
    : '';
  const size = value.size;

  if (
    !fileName
    || fileName.length > 255
    || /[/\\\u0000-\u001f\u007f]/.test(fileName)
    || fileName === '.'
    || fileName === '..'
  ) {
    throw new ApiError(400, 'INVALID_DOCUMENT_NAME', 'O nome do arquivo enviado é inválido.');
  }

  const extension = fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
  const allowedTypes = DOCUMENT_TYPES.get(extension);
  if (!allowedTypes || !contentType || !allowedTypes.includes(contentType)) {
    throw new ApiError(400, 'INVALID_DOCUMENT_TYPE', 'O formato ou tipo do documento não é permitido.');
  }

  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_DOCUMENT_BYTES) {
    throw new ApiError(400, 'INVALID_DOCUMENT_SIZE', 'O documento deve ter entre 1 byte e 10 MB.');
  }

  return { id, fileName, contentType, size, path: documentPath(id) };
}

export default async function handler(request, response) {
  const method = String(request.method || 'GET').toUpperCase();
  if (!['GET', 'POST', 'DELETE'].includes(method)) {
    if (typeof response.setHeader === 'function') response.setHeader('Allow', 'GET, POST, DELETE');
    return sendJson(response, 405, {
      code: 'METHOD_NOT_ALLOWED',
      message: 'Método não permitido para os documentos.'
    });
  }

  try {
    requireAuthenticatedSession(request);
    const config = getSupabaseConfig();

    if (method === 'POST') {
      if (queryValue(request, 'operation') !== 'upload-url') {
        throw new ApiError(400, 'INVALID_OPERATION', 'A operação de envio do documento é inválida.');
      }
      const document = validateUpload(await readJsonBody(request, { maxBytes: 8 * 1024 }));
      const result = await supabaseRequest(
        '/storage/v1/object/upload/sign/' + encodedObjectPath(config, document.path),
        { method: 'POST', body: {} }
      );
      const signedUrl = signedStorageUrl(config, result?.url || result?.signedUrl || result?.signedURL);
      const token = signedUrl.searchParams.get('token') || '';
      if (!token) {
        throw new ApiError(502, 'INVALID_SIGNED_URL', 'A autorização segura para envio está incompleta.');
      }
      return sendJson(response, 200, { signedUrl: signedUrl.toString(), path: document.path, token });
    }

    const id = validatedId(queryValue(request, 'id'));
    const path = documentPath(id);

    if (method === 'GET') {
      if (queryValue(request, 'operation') !== 'download-url') {
        throw new ApiError(400, 'INVALID_OPERATION', 'A operação de download do documento é inválida.');
      }
      const result = await supabaseRequest(
        '/storage/v1/object/sign/' + encodedObjectPath(config, path),
        { method: 'POST', body: { expiresIn: 300 } }
      );
      const signedUrl = signedStorageUrl(config, result?.signedURL || result?.signedUrl || result?.url);
      return sendJson(response, 200, { signedUrl: signedUrl.toString(), path });
    }

    await supabaseRequest('/storage/v1/object/' + encodeURIComponent(config.bucket), {
      method: 'DELETE',
      body: { prefixes: [path] }
    });
    return sendJson(response, 200, { removed: true, id });
  } catch (error) {
    return sendApiError(response, error);
  }
}
