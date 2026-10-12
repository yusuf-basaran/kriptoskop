import { method, idParam, currencyParam, cache, envelope, error, withProvider } from './_lib/http.js';
import { cg, paprika } from './_lib/providers.js';

const VALID_DAYS = new Set([1, 7, 30, 365]);

// CoinPaprika tarihçe aralığı: gün sayısına göre makul nokta sayısı üretir.
const PAPRIKA_INTERVAL = { 1: '5m', 7: '1h', 30: '6h', 365: '1d' };

function parseDays(value) {
  const days = Number(value || 1);
  if (!VALID_DAYS.has(days)) {
    throw Object.assign(new Error('days 1, 7, 30 veya 365 olmalıdır'), {
      status: 400,
      code: 'INVALID_DAYS'
    });
  }
  return days;
}

function cleanPrices(rows) {
  return rows
    .filter(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map(p => [p[0], p[1]]);
}

export default async function handler(req, res) {
  if (!method(req, res)) return;

  try {
    const id = idParam(req.query.id);
    const currency = currencyParam(req.query.currency);
    const days = parseDays(req.query.days);

    let note;

    const result = await withProvider(
      async () => {
        const body = await cg(
          `/coins/${encodeURIComponent(id)}/market_chart?vs_currency=${currency}&days=${days}`
        );
        return cleanPrices(body.prices || []);
      },
      async () => {
        const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        const rows = await paprika(
          `/tickers/${encodeURIComponent(id)}/historical?start=${encodeURIComponent(start)}` +
            `&interval=${PAPRIKA_INTERVAL[days]}&limit=5000&quote=usd`
        );
        if (currency !== 'usd') {
          note = 'Yedek kaynak geçmiş fiyatları yalnızca USD cinsinden sunar.';
        }
        return cleanPrices(
          (Array.isArray(rows) ? rows : []).map(r => [Date.parse(r.timestamp), r.price])
        );
      }
    );

    cache(res, days === 1 ? 900 : 3600);

    return res.status(200).json(
      envelope(result.source, result.source === 'coinpaprika' ? 'usd' : currency, {
        id,
        days,
        prices: result.data,
        ...(note ? { note } : {})
      })
    );
  } catch (err) {
    return error(res, err);
  }
}
