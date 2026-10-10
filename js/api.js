// All market data flows through same-origin Vercel functions; no provider keys ship to the browser.
export class ApiError extends Error {
  constructor(message, status = 0, retryAfter = 0) { super(message); this.name = 'ApiError'; this.status = status; this.retryAfter = retryAfter; }
}
async function request(path, params = {}, signal = null) {
  const url = new URL(`/api/${path}`, window.location.origin);
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value); });
  let response;
  try { response = await fetch(url, { headers: { Accept: 'application/json' }, signal }); }
  catch (err) { if (err.name === 'AbortError') throw err; throw new ApiError('Sunucuya erişilemiyor.', 0); }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.error || `İstek başarısız (HTTP ${response.status})`, response.status, Number(response.headers.get('Retry-After') || 0));
  return body;
}
export async function fetchCoinsPage(currency = 'usd', page = 1, forceBypass = false) {
  const result = await request('markets', { currency, page, per_page: 250, _: forceBypass ? Date.now() : undefined });
  return { data: result.coins || [], source: result.source, fetchedAt: result.fetchedAt, note: result.note, page };
}
export async function fetchTopCoins(currency = 'usd', forceBypass = false) { return fetchCoinsPage(currency, 1, forceBypass); }
export async function fetchCoinsByIds(currency = 'usd', coinIds = []) {
  if (!coinIds.length) return [];
  const result = await request('markets', { currency, ids: coinIds.slice(0, 50).join(',') });
  return result.coins || [];
}
export async function searchCoinsGlobal(queryText, currency = 'usd') {
  if (!queryText.trim()) return [];
  const result = await request('search', { query: queryText.trim(), currency });
  return (result.coins || []).map(coin => coin.id);
}
export async function fetchCoinChart(coinId, currency = 'usd', days = 1, abortSignal = null) {
  const result = await request('chart', { id: coinId, currency, days }, abortSignal);
  return { prices: result.prices || [], source: result.source, fetchedAt: result.fetchedAt, note: result.note };
}
export function getStaleChartData() { return null; }
export async function fetchCoinDetail(coinId, currency = 'usd', abortSignal = null) {
  return request('coin', { id: coinId, currency }, abortSignal);
}
