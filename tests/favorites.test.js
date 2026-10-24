import test from 'node:test';
import assert from 'node:assert/strict';
import { favoriteRows, mergeFavoriteRows } from '../js/favorites.js';
import { fetchCoinsByIds } from '../js/api.js';
import { getFavorites } from '../js/storage.js';
import markets from '../api/markets.js';
import { COIN_REGISTRY } from '../api/_lib/http.js';

const savedFetch = globalThis.fetch;
const savedWindow = globalThis.window;
const savedStorage = globalThis.localStorage;
const savedKey = process.env.COINGECKO_API_KEY;
const savedFallback = process.env.FORCE_FALLBACK;
test.beforeEach(() => {
  COIN_REGISTRY.clear();
  process.env.COINGECKO_API_KEY = '';
  delete process.env.FORCE_FALLBACK;
  globalThis.window = { location: { origin: 'https://kriptoskop.example' } };
});
test.afterEach(() => {
  globalThis.fetch = savedFetch;
  globalThis.window = savedWindow;
  globalThis.localStorage = savedStorage;
  for (const [name, value] of [['COINGECKO_API_KEY', savedKey], ['FORCE_FALLBACK', savedFallback]]) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});
const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
async function invoke(ids) {
  const res = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await markets({ method: 'GET', query: { ids, currency: 'usd' } }, res);
  return res;
}

test('three saved favorites always have three rows, including one beyond loaded pages', () => {
  const ids = ['orta-chain', 'gibi-swap', 'vstr-vestradao'];
  const loaded = [{ id: ids[0], name: 'Orta Chain', price: 0.03 }, { id: ids[1], name: 'Gibi Swap', price: 0.27 }];
  const pending = favoriteRows(ids, loaded);
  assert.equal(pending.length, 3);
  assert.equal(pending[2].id, ids[2]);
  assert.equal(pending[2].price, null);
  const hydrated = favoriteRows(ids, [...pending, { id: ids[2], name: 'Vestra DAO', price: 0.01 }]);
  assert.equal(hydrated.length, 3);
  assert.equal(hydrated[2].price, 0.01);
  assert.equal(hydrated[2].name, 'Vestra DAO');
});

test('an unavailable favorite remains removable and does not replace a loaded quote with a placeholder', () => {
  const pending = favoriteRows(['missing-coin'])[0];
  const loaded = { id: 'missing-coin', name: 'Saved Coin', price: 12 };
  assert.equal(favoriteRows(['missing-coin'], [loaded, pending])[0].price, 12);
  assert.deepEqual(favoriteRows([], [loaded]), []);
});

test('a provider ID change does not duplicate the saved asset in the market view', () => {
  const loaded = [{ id: 'btc-bitcoin', name: 'Bitcoin', symbol: 'BTC', price: 60000 }];
  const fetched = [{ id: 'bitcoin', name: 'Bitcoin', symbol: 'btc', price: 60001 }];
  const rows = mergeFavoriteRows(loaded, ['bitcoin'], fetched);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'bitcoin');
  assert.equal(rows[0].price, 60001);
});

test('saved favorite IDs are deduplicated and invalid entries cannot inflate the badge', () => {
  globalThis.localStorage = { getItem: () => JSON.stringify(['bitcoin', 'bitcoin', null, {}, 'gibi-swap']) };
  assert.deepEqual(getFavorites(), ['bitcoin', 'gibi-swap']);
});

test('all saved favorites are fetched in batches of at most 50', async () => {
  const ids = Array.from({ length: 103 }, (_, i) => `coin-${i}`);
  const calls = [];
  globalThis.fetch = async input => {
    const batch = new URL(input).searchParams.get('ids').split(',');
    calls.push(batch);
    return json({ coins: batch.map(id => ({ id, price: 1 })) });
  };
  const rows = await fetchCoinsByIds('try', ids);
  assert.equal(rows.length, 103);
  assert.deepEqual(calls.map(batch => batch.length), [50, 50, 3]);
});

test('one failed batch does not discard successfully loaded favorites', async () => {
  const ids = Array.from({ length: 51 }, (_, i) => `coin-${i}`);
  globalThis.fetch = async input => {
    const batch = new URL(input).searchParams.get('ids').split(',');
    return batch.length === 1 ? new Response('{}', { status: 502 }) : json({ coins: batch.map(id => ({ id, price: 1 })) });
  };
  const rows = favoriteRows(ids, await fetchCoinsByIds('usd', ids));
  assert.equal(rows.length, 51);
  assert.equal(rows[0].price, 1);
  assert.equal(rows[50].price, null);
});

test('saved CoinGecko IDs resolve on a cold CoinPaprika fallback beyond rank 250', async () => {
  globalThis.fetch = async input => {
    assert.equal(new URL(input).hostname, 'api.coinpaprika.com');
    return json([{ id: 'vstr-vestradao', name: 'Vestra DAO', symbol: 'VSTR', rank: 1200, quotes: { USD: { price: 0.01 } } }]);
  };
  const res = await invoke('vestra-dao');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.coins[0].id, 'vestra-dao');
  assert.equal(res.body.coins[0].name, 'Vestra DAO');
  assert.equal(res.body.coins[0].price, 0.01);
});

test('saved CoinPaprika IDs survive an empty successful CoinGecko response', async () => {
  process.env.COINGECKO_API_KEY = 'test-only';
  globalThis.fetch = async input => new URL(input).hostname === 'api.coingecko.com' ? json([]) : json([{ id: 'btc-bitcoin', symbol: 'BTC', name: 'Bitcoin', quotes: { USD: { price: 60000 } } }]);
  const res = await invoke('btc-bitcoin');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.coins[0].id, 'btc-bitcoin');
  assert.equal(res.body.coins[0].price, 60000);
});

test('ambiguous symbols do not select an unrelated token', async () => {
  globalThis.fetch = async input => new URL(input).hostname === 'api.coingecko.com' ? json([]) : json([
    { id: 'same-token-a', symbol: 'SAME', name: 'Token A', quotes: { USD: { price: 1 } } },
    { id: 'same-token-b', symbol: 'SAME', name: 'Token B', quotes: { USD: { price: 9 } } }
  ]);
  const res = await invoke('same');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.coins, []);
});
