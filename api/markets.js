import { method, currencyParam, cache, envelope, error, withProvider, idParam } from './_lib/http.js';
import { cgMarkets, paprikaMarkets, cg, paprika } from './_lib/providers.js';
import { normalizeCg, normalizePaprika } from './_lib/http.js';

export default async function handler(req, res) {
  if (!method(req, res)) return;
  try {
    const currency = currencyParam(req.query.currency);
    const page = Number(req.query.page || 1), perPage = Number(req.query.per_page || 250);
    if (!Number.isInteger(page) || page < 1 || page > 10 || !Number.isInteger(perPage) || perPage < 1 || perPage > 250) throw Object.assign(new Error('page 1-10 ve per_page 1-250 aralığında olmalıdır'), { status: 400, code: 'INVALID_PAGINATION' });
    const ids = req.query.ids ? String(req.query.ids).toLowerCase().split(',') : null;
    if (ids && (!ids.length || ids.length > 50 || ids.some(id => !/^[a-z0-9-]+$/.test(id)))) throw Object.assign(new Error('En fazla 50 geçerli id verilebilir'), { status: 400, code: 'INVALID_IDS' });
    let result;
    if (!ids) {
      result = await withProvider(() => cgMarkets(currency, page, perPage), () => paprikaMarkets(currency, page, perPage));
    } else {
      result = await withProvider(async () => (await cg(`/coins/markets?vs_currency=${currency}&ids=${ids.join(',')}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`)).map(c => normalizeCg(c, currency)), async () => {
        const all = await paprika(`/tickers?quotes=${currency.toUpperCase()}`);
        const found = all.filter(p => ids.some(id => p.id === id || (p.symbol && p.symbol.toLowerCase() === id)));
        return found.map(p => normalizePaprika(p, currency, ids.find(id => id === p.id) || p.id));
      });
    }
    cache(res, result.source === 'coinpaprika' ? 60 : 300, result.source === 'coingecko' ? 600 : 0);
    const note = result.source === 'coinpaprika' && currency !== 'usd' ? 'CoinPaprika fiyat geçmişi/kur kapsamı sınırlı olabilir.' : undefined;
    return res.status(200).json(envelope(result.source, currency, { coins: result.data, ...(note ? { note } : {}) }));
  } catch (err) { return error(res, err); }
}
