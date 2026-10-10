export const COIN_REGISTRY = new Map();
const breaker = { until: 0 };
const VALID_CURRENCY = new Set(['usd', 'eur', 'try']);
const SAFE_ID = /^[a-z0-9-]+$/;

export function json(res, status, body) { return res.status(status).json(body); }
export function method(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); json(res, 405, { error: 'Yalnızca GET desteklenir', code: 'METHOD_NOT_ALLOWED' }); return false; }
  return true;
}
export function currencyParam(value) {
  const v = String(value || 'usd').toLowerCase();
  if (!VALID_CURRENCY.has(v)) throw Object.assign(new Error('currency usd, eur veya try olmalıdır'), { status: 400, code: 'INVALID_CURRENCY' });
  return v;
}
export function idParam(value) {
  const v = String(value || '').toLowerCase();
  if (!SAFE_ID.test(v)) throw Object.assign(new Error('Geçersiz coin id'), { status: 400, code: 'INVALID_ID' });
  return v;
}
export function envelope(source, currency, data, extra = {}) { return { ...data, source, currency, fetchedAt: new Date().toISOString(), ...extra }; }
export function cache(res, seconds, stale = 0) { res.setHeader('Cache-Control', `public, s-maxage=${seconds}${stale ? `, stale-while-revalidate=${stale}` : ''}`); }
export function error(res, err) {
  const status = err.status || 502;
  if (status === 429 && err.retryAfter) res.setHeader('Retry-After', String(err.retryAfter));
  return json(res, status, { error: status === 400 ? err.message : (status === 429 ? 'Veri sağlayıcı hız sınırına ulaştı' : 'Veri sağlayıcılarına şu anda erişilemiyor'), code: err.code || (status === 429 ? 'RATE_LIMITED' : status === 400 ? 'BAD_REQUEST' : 'UPSTREAM_ERROR') });
}
export function shouldFallback(err) { return !err.status || err.status === 429 || err.status === 401 || err.status === 403 || err.status >= 500; }
export async function upstream(url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: controller.signal });
    if (!response.ok) {
      const err = new Error('Upstream error'); err.status = response.status; err.retryAfter = response.headers.get('retry-after'); throw err;
    }
    return response.json();
  } finally { clearTimeout(timer); }
}
export async function withProvider(coingecko, fallback) {
  const force = process.env.FORCE_FALLBACK === '1';
  if (!force && process.env.COINGECKO_API_KEY && Date.now() >= breaker.until) {
    try { return { source: 'coingecko', data: await coingecko() }; }
    catch (err) {
      if (!shouldFallback(err)) throw err;
      if ([401, 403].includes(err.status)) console.error('CoinGecko kimlik doğrulama sorunu; API anahtarı ayarını kontrol edin.');
      if (!err.status || err.status === 429 || err.status >= 500 || err.status === 401 || err.status === 403) breaker.until = Date.now() + 60000;
    }
  }
  try { return { source: 'coinpaprika', data: await fallback() }; }
  catch (err) {
    if (err.status === 429 || err.retryAfter) throw err;
    throw Object.assign(new Error('Tüm veri sağlayıcıları başarısız oldu'), { status: 502, code: 'UPSTREAM_ERROR' });
  }
}
export function cgHeaders() { return process.env.COINGECKO_API_KEY ? { 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY } : {}; }
export function normalizeCg(c, currency) {
  COIN_REGISTRY.set(String(c.id).toLowerCase(), { name: c.name, symbol: c.symbol });
  return { id: String(c.id).toLowerCase(), symbol: c.symbol, name: c.name, image: c.image || '', price: c.current_price ?? null, marketCap: c.market_cap ?? null, rank: c.market_cap_rank ?? null, change24h: c.price_change_percentage_24h ?? null, high24h: c.high_24h ?? null, low24h: c.low_24h ?? null, circulatingSupply: c.circulating_supply ?? null, volume24h: c.total_volume ?? null };
}
export function normalizePaprika(c, currency, id) {
  const q = c.quotes?.[currency.toUpperCase()] || c.quotes?.USD || {};
  const metadata = COIN_REGISTRY.get(id) || COIN_REGISTRY.get(String(c.id || '').toLowerCase());
  return { id, symbol: metadata?.symbol || c.symbol, name: metadata?.name || c.name, image: '', price: q.price ?? null, marketCap: q.market_cap ?? null, rank: c.rank || null, change24h: q.percent_change_24h ?? null, high24h: null, low24h: null, circulatingSupply: c.circulating_supply ?? null, volume24h: q.volume_24h ?? null };
}
