import { method, idParam, cache, envelope, error, withProvider } from './_lib/http.js';
import { cg, paprika } from './_lib/providers.js';
const allowed = new Set([1,7,30,365]);
export default async function handler(req, res) {
  if (!method(req, res)) return;
  try {
    const id = idParam(req.query.id), days = Number(req.query.days || 1), currency = String(req.query.currency || 'usd').toLowerCase();
    if (!allowed.has(days)) throw Object.assign(new Error('days 1, 7, 30 veya 365 olmalıdır'), { status: 400, code: 'INVALID_DAYS' });
    if (!['usd','eur','try'].includes(currency)) throw Object.assign(new Error('Geçersiz para birimi'), { status: 400, code: 'INVALID_CURRENCY' });
    const result = await withProvider(async () => {
      const d = await cg(`/coins/${encodeURIComponent(id)}/market_chart?vs_currency=${currency}&days=${days}`);
      return { prices: d.prices || [] };
    }, async () => {
      const rows = await paprika(`/tickers/${encodeURIComponent(id)}/historical?start=${new Date(Date.now()-days*86400000).toISOString().slice(0,10)}&interval=${days === 1 ? '1h' : '1d'}&quote=${currency === 'usd' ? 'usd' : 'usd'}`);
      return { prices: rows.map(x => [Date.parse(x.timestamp), x.price]).filter(x => Number.isFinite(x[0]) && Number.isFinite(x[1])) };
    });
    cache(res, result.source === 'coinpaprika' ? 60 : days === 1 ? 900 : 3600);
    const note = result.source === 'coinpaprika' && currency !== 'usd' ? 'Yedek sağlayıcı grafik verisi USD cinsindendir.' : undefined;
    return res.status(200).json(envelope(result.source, currency, result.data, note ? { note } : {}));
  } catch (err) { return error(res, err); }
}
