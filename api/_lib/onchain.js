import { upstream } from './http.js';
import { paprika } from './providers.js';

const GT = 'https://api.geckoterminal.com/api/v2';
const requests = new Map();
function cached(key, fetcher) {
  const entry = requests.get(key);
  if (entry && Date.now() < entry.until) return entry.promise;
  const promise = fetcher().catch(err => { requests.delete(key); throw err; });
  requests.set(key, { promise, until: Date.now() + 60000 });
  return promise;
}
const gt = path => cached(path, () => upstream(`${GT}${path}`, { Accept: 'application/json;version=20230302' }));
const number = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);

async function exchangeRate(currency) {
  if (currency === 'usd') return 1;
  // Derive USD conversion from simultaneous quotes of the same asset.
  const ticker = await cached('fx', () => paprika('/tickers/btc-bitcoin?quotes=USD,EUR,TRY'));
  const usd = number(ticker.quotes?.USD?.price);
  const target = number(ticker.quotes?.[currency.toUpperCase()]?.price);
  if (!(usd > 0) || !(target > 0)) throw new Error('Exchange rate unavailable');
  return target / usd;
}

async function tokenPool(coin) {
  const result = await gt(`/networks/eth/tokens/${coin.contract}/pools?include=base_token,quote_token`);
  const pool = (result.data || []).filter(pool => pool.relationships?.base_token?.data?.id?.toLowerCase() === `eth_${coin.contract}` && number(pool.attributes?.base_token_price_usd) > 0)
    .sort((a, b) => (number(b.attributes.reserve_in_usd) || 0) - (number(a.attributes.reserve_in_usd) || 0))[0];
  if (!pool) throw new Error('Token pool unavailable');
  const token = (result.included || []).find(item => item.id.toLowerCase() === `eth_${coin.contract}`);
  return { pool, image: token?.attributes?.image_url || '' };
}

export async function onchainMarket(coin, currency) {
  const [{ pool, image }, rate] = await Promise.all([tokenPool(coin), exchangeRate(currency)]);
  const attributes = pool.attributes;
  const convert = value => number(value) === null ? null : number(value) * rate;
  return {
    image, price: convert(attributes.base_token_price_usd),
    marketCap: convert(attributes.market_cap_usd),
    change24h: number(attributes.price_change_percentage?.h24),
    volume24h: convert(attributes.volume_usd?.h24), source: 'geckoterminal'
  };
}

export async function onchainChart(coin, currency, days) {
  const [{ pool }, rate] = await Promise.all([tokenPool(coin), exchangeRate(currency)]);
  const timeframe = days <= 7 ? 'hour' : 'day';
  const limit = days <= 7 ? days * 24 : days;
  const chart = await gt(`/networks/eth/pools/${pool.attributes.address}/ohlcv/${timeframe}?aggregate=1&limit=${limit}&currency=usd&token=${coin.contract}&include_empty_intervals=true`);
  const cutoff = Date.now() - days * 86400000;
  return {
    prices: (chart.data?.attributes?.ohlcv_list || []).filter(row => row[0] * 1000 >= cutoff && number(row[4]) !== null).map(row => [row[0] * 1000, number(row[4]) * rate]),
    note: `GeckoTerminal: en likit havuzun kapanış fiyatları.${currency === 'usd' ? '' : ' Tarihçe güncel USD kuru ile çevrilmiştir.'}`
  };
}
