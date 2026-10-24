import { method, idParam, currencyParam, cache, envelope, error, withProvider } from './_lib/http.js';
import { cg, paprika } from './_lib/providers.js';
import { findFeatured } from './_lib/featured.js';
import { onchainChart } from './_lib/onchain.js';

export default async function handler(req, res) {
  if (!method(req, res)) return;
  try {
    const id = idParam(req.query.id);
    const currency = currencyParam(req.query.currency);
    const days = Number(req.query.days || 1);
    if (![1, 7, 30, 365].includes(days)) {
      throw Object.assign(new Error('days 1, 7, 30 veya 365 olmalıdır'), { status: 400, code: 'INVALID_DAYS' });
    }
    const featured = findFeatured(id);
    const primary = async () => {
      const chart = await cg(`/coins/${featured?.id || id}/market_chart?vs_currency=${currency}&days=${days}`);
      return { prices: chart.prices || [] };
    };
    // Featured IDs are canonical CoinGecko IDs, including on keyless installs.
    let result;
    if (featured) {
      try { result = { source: 'coingecko', data: await primary() }; }
      catch { result = { source: 'geckoterminal', data: await onchainChart(featured, currency, days) }; }
    } else {
      result = await withProvider(primary, async () => {
        const start = new Date(Date.now() - days * 86400000).toISOString();
        const points = await paprika(`/tickers/${encodeURIComponent(id)}/historical?start=${encodeURIComponent(start)}&interval=${days === 1 ? '1h' : '24h'}`);
        return {
          prices: points.map(point => [Date.parse(point.timestamp), point.price]),
          ...(currency !== 'usd' ? { note: 'CoinPaprika fiyat geçmişi USD cinsindedir.' } : {})
        };
      });
    }
    const prices = result.data.prices.filter(point => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1])).sort((a, b) => a[0] - b[0]);
    cache(res, result.source !== 'coingecko' ? 60 : days === 1 ? 900 : 3600);
    return res.status(200).json(envelope(result.source, result.source === 'coinpaprika' ? 'usd' : currency, { ...result.data, prices }));
  } catch (err) { return error(res, err); }
}
