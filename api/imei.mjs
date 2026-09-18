function isValidImei(value) {
  if (!/^\d{15}$/.test(value)) return false;
  const digits = [...value].map(Number);
  let sum = 0;
  for (let index = 0; index < 14; index += 1) {
    let digit = digits[index] * (index % 2 === 1 ? 2 : 1);
    sum += digit > 9 ? digit - 9 : digit;
  }
  return (10 - (sum % 10)) % 10 === digits[14];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ message: 'Método não permitido.' });
  }

  const imei = String(req.body?.imei || '').replace(/\D/g, '');
  if (!isValidImei(imei)) {
    return res.status(400).json({
      code: 'INVALID_IMEI',
      message: 'Informe um IMEI válido com 15 dígitos.'
    });
  }

  const token = process.env.INFOSIMPLES_TOKEN;
  if (!token) {
    return res.status(503).json({
      code: 'IMEI_API_NOT_CONFIGURED',
      message: 'A integração está pronta, mas o token da Infosimples ainda não foi configurado.'
    });
  }

  try {
    const endpoint = process.env.INFOSIMPLES_ENDPOINT || 'https://api.infosimples.com/api/v2/consultas/anatel/celular-legal';
    const params = new URLSearchParams({ token, imei, timeout: '300' });
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body: params,
      signal: AbortSignal.timeout(310_000)
    });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(502).json({
        code: 'UPSTREAM_ERROR',
        message: 'A Infosimples não concluiu a consulta.',
        details: payload
      });
    }
    return res.status(200).json(payload);
  } catch (error) {
    return res.status(500).json({
      code: 'SERVER_ERROR',
      message: error.message || 'Falha inesperada na consulta.'
    });
  }
}
