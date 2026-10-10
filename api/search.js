import { method, currencyParam, cache, envelope, error, withProvider, COIN_REGISTRY, normalizeCg } from './_lib/http.js';
import { cg, paprika } from './_lib/providers.js';
export default async function handler(req, res) {
  if (!method(req, res)) return;
  try {
    const currency = currencyParam(req.query.currency);
    const query = String(req.query.query || '').trim();
    if (!query || query.length > 40) throw Object.assign(new Error('query 1-40 karakter olmalıdır'), { status: 400, code: 'INVALID_QUERY' });
    const result = await withProvider(async () => {
      const items = await cg(`/search?query=${encodeURIComponent(query)}`);
      const coins = (items.coins || []).slice(0, 25);
      for (const c of coins) COIN_REGISTRY.set(c.id.toLowerCase(), { name: c.name, symbol: c.symbol });
      const ids = coins.map(c => c.id).join(',');
      const markets = ids ? await cg(`/coins/markets?vs_currency=${currency}&ids=${ids}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`) : [];
      return markets.map(c => normalizeCg(c, currency));
    }, async () => {
      const found = await paprika(`/search?q=${encodeURIComponent(query)}&c=currencies&limit=25`);
      return (found.currencies || []).slice(0, 25).map(c => ({ id: c.id, symbol: c.symbol, name: c.name, image: '', price: null, marketCap: null, rank: null, change24h: null, high24h: null, low24h: null, circulatingSupply: null, volume24h: null }));
    });
    cache(res, result.source === 'coinpaprika' ? 60 : 600);
    return res.status(200).json(envelope(result.source, currency, { coins: result.data }));
  } catch (err) { return error(res, err); }
}
