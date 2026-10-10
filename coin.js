import { method, idParam, cache, envelope, error, withProvider, normalizeCg } from './_lib/http.js';
import { cg, paprika } from './_lib/providers.js';
export default async function handler(req, res) {
  if (!method(req, res)) return;
  try {
    const id = idParam(req.query.id), currency = String(req.query.currency || 'usd').toLowerCase();
    if (!['usd','eur','try'].includes(currency)) throw Object.assign(new Error('Geçersiz para birimi'), { status: 400, code: 'INVALID_CURRENCY' });
    const result = await withProvider(async () => {
      const [market, detail] = await Promise.all([
        cg(`/coins/markets?vs_currency=${currency}&ids=${id}&sparkline=false&price_change_percentage=24h`),
        cg(`/coins/${encodeURIComponent(id)}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false`)
      ]);
      return { coin: market[0] ? normalizeCg(market[0], currency) : null, description: detail.description?.tr || detail.description?.en || '' };
    }, async () => {
      const rows = await paprika('/tickers?quotes=' + currency.toUpperCase());
      const p = rows.find(x => x.id === id || x.symbol?.toLowerCase() === id);
      if (!p) return { coin: null, description: '' };
      const q = p.quotes?.[currency.toUpperCase()] || p.quotes?.USD || {};
      return { coin: { id, symbol:p.symbol, name:p.name, image:'', price:q.price??null, marketCap:q.market_cap??null, rank:p.rank??null, change24h:q.percent_change_24h??null, high24h:null, low24h:null, circulatingSupply:p.circulating_supply??null, volume24h:q.volume_24h??null }, description:'' };
    });
    if (!result.data.coin) throw Object.assign(new Error('Coin bulunamadı'), { status: 404, code: 'NOT_FOUND' });
    cache(res, result.source === 'coinpaprika' ? 60 : 1800);
    return res.status(200).json(envelope(result.source, currency, result.data));
  } catch (err) { return error(res, err); }
}
