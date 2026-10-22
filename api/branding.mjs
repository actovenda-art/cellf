import { ApiError, getSupabaseConfig, queryValue, sendApiError, sendJson, supabaseRequest } from './supabase.mjs';
import { readRecord } from './access.mjs';

// Only the published identity is public; company documents and contacts stay private.
export function publicBranding(settings = {}) {
  settings = settings && typeof settings === 'object' ? settings : {};
  const brand = settings.branding || {};
  const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value)) ? value.toLowerCase() : fallback;
  const id = brand.logo?.id;
  return {
    companyName: String(settings.companyName || 'Cellf').slice(0, 100),
    slogan: String(settings.slogan ?? 'Reparo e Comércio').slice(0, 100),
    branding: {
      primaryColor: color(brand.primaryColor, '#d9f15a'),
      secondaryColor: color(brand.secondaryColor, '#00aeef'),
      logo: typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id) ? { id } : null
    }
  };
}

export default async function handler(request, response) {
  try {
    if (request.method !== 'GET') throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Método não permitido.');
    const record = await readRecord();
    const brand = publicBranding(record?.state?.settings);
    if (queryValue(request, 'asset') !== 'logo') return sendJson(response, 200, brand);
    let location = '/cellf-logo-brand.svg';
    if (brand.branding.logo) {
      const config = getSupabaseConfig();
      const result = await supabaseRequest(`/storage/v1/object/sign/${encodeURIComponent(config.bucket)}/branding/${encodeURIComponent(brand.branding.logo.id)}`, { method: 'POST', body: { expiresIn: 300 } });
      const raw = result?.signedURL || result?.signedUrl;
      const signed = typeof raw === 'string' && raw ? new URL(raw.startsWith('https://') ? raw : config.url + '/storage/v1/' + raw.replace(/^\/+/, '')) : null;
      if (!signed || signed.origin !== new URL(config.url).origin || !signed.pathname.startsWith('/storage/v1/object/sign/')) throw new ApiError(502, 'INVALID_LOGO_URL', 'Não foi possível carregar a logo.');
      location = signed.href;
    }
    response.statusCode = 302;
    response.setHeader('Location', location);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.end();
  } catch (error) { return sendApiError(response, error); }
}
