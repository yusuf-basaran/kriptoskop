import { cgHeaders, upstream, normalizeCg, normalizePaprika, COIN_REGISTRY } from './http.js';

const CG = 'https://api.coingecko.com/api/v3';
const CP = 'https://api.coinpaprika.com/v1';
export const cg = (path) => upstream(`${CG}${path}`, cgHeaders());
export const paprika = (path) => upstream(`${CP}${path}`);
export const cgMarkets = async (currency, page, perPage) => (await cg(`/coins/markets?vs_currency=${currency}&order=market_cap_desc&per_page=${perPage}&page=${page}&sparkline=false&price_change_percentage=24h`)).map(c => normalizeCg(c, currency));
export async function paprikaMarkets(currency, page, perPage) {
  const result = await paprika(`/tickers?quotes=${currency.toUpperCase()}`);
  const sorted = result.sort((a, b) => (a.rank || 999999) - (b.rank || 999999));
  const begin = (page - 1) * perPage;
  return sorted.slice(begin, begin + perPage).map(c => normalizePaprika(c, currency, c.id));
}
export async function paprikaByIds(ids, currency) {
  const result = await paprikaMarkets(currency, 1, 250);
  return result.filter(c => {
    const meta = COIN_REGISTRY.get(c.id);
    return ids.includes(c.id) || (meta && result.some(item => item.id === c.id && item.symbol?.toLowerCase() === meta.symbol.toLowerCase()));
  });
}
