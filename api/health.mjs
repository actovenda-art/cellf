export default function handler(_req, res) {
  res.status(200).json({
    ok: true,
    imeiConfigured: Boolean(process.env.INFOSIMPLES_TOKEN)
  });
}
