import { method, currencyParam, cache, envelope, error, withProvider } from './_lib/http.js';
import { cgMarkets, paprikaMarkets, cg, paprika } from './_lib/providers.js';
import { normalizeCg, normalizePaprika } from './_lib/http.js';
import { FEATURED_COINS, findFeatured, featuredMarkets, mergeFeatured } from './_lib/featured.js';

export default async function handler(req, res) {
  if (!method(req, res)) return;
  try {
    const currency = currencyParam(req.query.currency);
    const page = Number(req.query.page || 1), perPage = Number(req.query.per_page || 250);
    if (!Number.isInteger(page) || page < 1 || page > 10 || !Number.isInteger(perPage) || perPage < 1 || perPage > 250) throw Object.assign(new Error('page 1-10 ve per_page 1-250 aralığında olmalıdır'), { status: 400, code: 'INVALID_PAGINATION' });
    const ids = req.query.ids ? String(req.query.ids).toLowerCase().split(',') : null;
    if (ids && (!ids.length || ids.length > 50 || ids.some(id => !/^[a-z0-9-]+$/.test(id)))) throw Object.assign(new Error('En fazla 50 geçerli id verilebilir'), { status: 400, code: 'INVALID_IDS' });
    const featuredIds = ids ? [...new Set(ids.map(id => findFeatured(id)).filter(Boolean))] : page === 1 ? FEATURED_COINS : [];
    const regularIds = ids?.filter(id => !findFeatured(id));
    const featuredPromise = featuredMarkets(currency, featuredIds);
    let result;
    try {
      if (ids && !regularIds.length) {
        result = { source: '', data: [] };
      } else if (!ids) {
        result = await withProvider(() => cgMarkets(currency, page, perPage), () => paprikaMarkets(currency, page, perPage));
      } else {
        result = await withProvider(async () => (await cg(`/coins/markets?vs_currency=${currency}&ids=${regularIds.join(',')}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`)).map(c => normalizeCg(c, currency)), async () => {
          const all = await paprika(`/tickers?quotes=${currency.toUpperCase()}`);
          const found = all.filter(p => regularIds.some(id => p.id === id || (p.symbol && p.symbol.toLowerCase() === id)));
          return found.map(p => normalizePaprika(p, currency, ids.find(id => id === p.id) || p.id));
        });
      }
    } catch (err) {
      const featured = await featuredPromise;
      if (!featured.some(coin => coin.price !== null)) throw err;
      result = { source: '', data: [], note: 'Genel piyasa listesi yüklenemedi; takip edilen projeler gösteriliyor.' };
    }
    const featured = await featuredPromise;
    result.data = mergeFeatured(result.data, featured);
    result.source = [...new Set([result.source, ...featured.map(coin => coin.source)].filter(Boolean))].join(', ') || 'unavailable';
    cache(res, result.source.includes('coinpaprika') ? 60 : 300, result.source === 'coingecko' ? 600 : 0);
    const note = result.note || (result.source === 'coinpaprika' && currency !== 'usd' ? 'CoinPaprika fiyat geçmişi/kur kapsamı sınırlı olabilir.' : undefined);
    return res.status(200).json(envelope(result.source, currency, { coins: result.data, ...(note ? { note } : {}) }));
  } catch (err) { return error(res, err); }
}
