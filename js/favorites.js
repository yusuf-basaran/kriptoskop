// Every saved favorite gets a row, even outside the loaded market pages.
export function favoriteRows(ids, availableCoins = []) {
  const available = new Map();
  for (const coin of availableCoins) {
    if (!coin.marketUnavailable || !available.has(coin.id)) available.set(coin.id, coin);
  }
  return ids.map(id => available.get(id) || {
    id, name: id, symbol: '', image: '', marketUnavailable: true,
    price: null, marketCap: null, rank: null, change24h: null,
    high24h: null, low24h: null, circulatingSupply: null, volume24h: null
  });
}

export function mergeFavoriteRows(loadedCoins, ids, fetchedCoins = []) {
  const coins = new Map(loadedCoins.map(coin => [coin.id, coin]));
  const savedIds = new Set(ids);
  const identity = coin => coin.symbol && coin.name
    ? `${coin.symbol}:${coin.name}`.toLowerCase().replace(/\s+/g, '') : '';
  for (const favorite of favoriteRows(ids, [...loadedCoins, ...fetchedCoins])) {
    // A provider change can give the same asset a different ID. Show its saved
    // favorite once, without duplicating an unfavorited copy from the market page.
    const key = identity(favorite);
    if (key) {
      for (const [id, coin] of coins) {
        if (!savedIds.has(id) && identity(coin) === key) coins.delete(id);
      }
    }
    coins.set(favorite.id, favorite);
  }
  return [...coins.values()];
}
