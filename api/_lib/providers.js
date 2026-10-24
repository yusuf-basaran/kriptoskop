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
  const rows = await paprika(`/tickers?quotes=${currency.toUpperCase()}`);
  const compact = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return ids.flatMap(id => {
    const exact = rows.find(coin => coin.id === id);
    const meta = COIN_REGISTRY.get(id);
    const matches = exact ? [exact] : rows.filter(coin => {
      if (meta) return compact(coin.name) === compact(meta.name) && compact(coin.symbol) === compact(meta.symbol);
      const slug = coin.id?.startsWith(`${coin.symbol?.toLowerCase()}-`) ? coin.id.slice(coin.symbol.length + 1) : '';
      return [coin.name, slug, coin.symbol].some(value => value && compact(value) === compact(id));
    });
    // Preserve the saved ID and avoid guessing when multiple tokens share a name/symbol.
    return matches.length === 1 ? [normalizePaprika(matches[0], currency, id)] : [];
  });
}
