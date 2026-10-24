import { cg, paprika } from './providers.js';
import { normalizeCg, normalizePaprika } from './http.js';
import { onchainMarket } from './onchain.js';

// IDs and Ethereum contracts verified against the projects' official websites.
export const FEATURED_COINS = [
  {
    id: 'gibi-swap', name: 'Gibi Swap', symbol: 'GIBI',
    contract: '0xb6cd7fee2daa8a2e7e4c0e194468af0f08be527d',
    website: 'https://gibiswap.com/',
    description: 'Gibi Swap, platformların kendi uygulamaları içinde token takası sunmasını sağlayan modüler bir altyapıdır. GIBI, projenin Ethereum üzerindeki ERC-20 tokenıdır.'
  },
  {
    id: 'orta-chain', name: 'Orta Chain', symbol: 'ORTA',
    contract: '0xcb20b537f5df50bccc00fe6a8eb4d57b14a89a03',
    website: 'https://ortachain.com/',
    description: 'Orta Chain, işletmeler için dijital varlık yönetimi, ödeme ve muhasebe süreçlerini bir araya getiren bir altyapıdır. ORTA, projenin Ethereum üzerindeki ERC-20 tokenıdır.'
  }
];

export function findFeatured(id) {
  return FEATURED_COINS.find(coin => [coin.id, coin.symbol.toLowerCase(), coin.contract].includes(id.toLowerCase()));
}

export function searchFeatured(query) {
  const compact = value => value.toLowerCase().replace(/\s+/g, '');
  const q = compact(query);
  return FEATURED_COINS.filter(coin => [coin.name, coin.symbol, coin.id, coin.contract].some(value => compact(value).includes(q)));
}

function unavailable(coin) {
  return {
    id: coin.id, name: coin.name, symbol: coin.symbol, image: '',
    price: null, marketCap: null, rank: null, change24h: null,
    high24h: null, low24h: null, circulatingSupply: null, volume24h: null,
    website: coin.website, contract: coin.contract, source: null
  };
}

// The featured coins also use CoinGecko's public API when no Demo key is set.
// Keep their identities visible during an outage without inventing market data.
export async function featuredMarkets(currency, coins = FEATURED_COINS) {
  if (!coins.length) return [];
  let rows = [];
  try {
    rows = await cg(`/coins/markets?vs_currency=${currency}&ids=${coins.map(c => c.id).join(',')}&sparkline=false&price_change_percentage=24h`);
  } catch { /* Try the existing alternative provider below. */ }
  const missing = coins.filter(coin => !rows.some(row => row.id === coin.id));
  let fallback = [];
  if (missing.length) {
    try {
      fallback = await paprika(`/tickers?quotes=${currency.toUpperCase()}`);
    } catch { /* The UI shows unavailable values for these coins. */ }
  }
  return Promise.all(coins.map(async coin => {
    const primary = rows.find(row => row.id === coin.id);
    const secondary = fallback.find(row => row.symbol?.toLowerCase() === coin.symbol.toLowerCase() && row.name?.toLowerCase().replace(/\s+/g, '') === coin.name.toLowerCase().replace(/\s+/g, ''));
    let market = primary ? { ...normalizeCg(primary, currency), source: 'coingecko' }
      : secondary ? { ...normalizePaprika(secondary, currency, coin.id), source: 'coinpaprika' } : {};
    if (!primary && !secondary) {
      try { market = await onchainMarket(coin, currency); }
      catch { /* Preserve identity with unavailable market values. */ }
    }
    return { ...unavailable(coin), ...market };
  }));
}

export function mergeFeatured(markets, featured) {
  const ids = new Set(featured.map(coin => coin.id));
  // Keep the requested coins easy to find, and do not duplicate them on page 1.
  return [...featured, ...markets.filter(coin => !ids.has(coin.id) && !featured.some(item => coin.symbol?.toLowerCase() === item.symbol.toLowerCase() && coin.name?.toLowerCase() === item.name.toLowerCase()))];
}
