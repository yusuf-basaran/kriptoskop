import { method, currencyParam, cache, envelope, error, withProvider } from './_lib/http.js';
import { cg, paprika } from './_lib/providers.js';

const FNG_URL = 'https://api.alternative.me/fng/?limit=1';

// Korku ve Açgözlülük endeksi isteğe bağlıdır: başarısız olursa piyasa özeti yine döner.
async function fetchFearGreed() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(FNG_URL, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    if (!response.ok) return null;
    const body = await response.json();
    const item = body?.data?.[0];
    const value = Number(item?.value);
    if (!Number.isFinite(value)) return null;
    return {
      value,
      label: String(item.value_classification || ''),
      timestamp: Number(item.timestamp) || null
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const num = value => (Number.isFinite(Number(value)) ? Number(value) : null);

export default async function handler(req, res) {
  if (!method(req, res)) return;

  try {
    const currency = currencyParam(req.query.currency);

    const [market, fearGreed] = await Promise.all([
      withProvider(
        async () => {
          const body = (await cg('/global')).data || {};
          return {
            currency,
            totalMarketCap: num(body.total_market_cap?.[currency]),
            totalVolume: num(body.total_volume?.[currency]),
            btcDominance: num(body.market_cap_percentage?.btc),
            ethDominance: num(body.market_cap_percentage?.eth),
            marketCapChange24h: num(body.market_cap_change_percentage_24h_usd),
            activeCoins: num(body.active_cryptocurrencies)
          };
        },
        async () => {
          const body = await paprika('/global');
          return {
            // CoinPaprika global ucu yalnızca USD verir.
            currency: 'usd',
            totalMarketCap: num(body.market_cap_usd),
            totalVolume: num(body.volume_24h_usd),
            btcDominance: num(body.bitcoin_dominance_percentage),
            ethDominance: null,
            marketCapChange24h: num(body.market_cap_change_24h),
            activeCoins: num(body.cryptocurrencies_number)
          };
        }
      ),
      fetchFearGreed()
    ]);

    cache(res, 300, 600);

    return res
      .status(200)
      .json(envelope(market.source, market.data.currency, { stats: market.data, fearGreed }));
  } catch (err) {
    return error(res, err);
  }
}
