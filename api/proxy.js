// Vercel Serverless Proxy: Tarayıcı CORS ve Referrer blokajını sunucu üzerinden aşar
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { path } = req.query;
  if (!path) {
    return res.status(400).json({ error: 'Eksik path parametresi' });
  }

  const queryParams = new URLSearchParams(req.query);
  queryParams.delete('path');
  const targetUrl = `https://api.coingecko.com/api/v3/${path}?${queryParams.toString()}`;

  try {
    const upstreamRes = await fetch(targetUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const data = await upstreamRes.json();
    return res.status(upstreamRes.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'CoinGecko sunucusuna erişilemedi', details: err.message });
  }
}
