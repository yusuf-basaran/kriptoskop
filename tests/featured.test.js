import test from 'node:test';
import assert from 'node:assert/strict';
import markets from '../api/markets.js';
import search from '../api/search.js';
import coin from '../api/coin.js';
import chart from '../api/chart.js';
import { FEATURED_COINS } from '../api/_lib/featured.js';

const fixtures = FEATURED_COINS.map((item, index) => ({
  id: item.id, name: item.name, symbol: item.symbol.toLowerCase(),
  current_price: index ? 0.03 : 0.28, market_cap: 1000000,
  market_cap_rank: 2000 + index, price_change_percentage_24h: -2,
  circulating_supply: 3500000, total_volume: 1000
}));
const originalFetch = globalThis.fetch;
let testClock = Date.now();
test.beforeEach(t => { testClock += 120000; t.mock.method(Date, 'now', () => testClock); });
const originalKey = process.env.COINGECKO_API_KEY;
process.env.COINGECKO_API_KEY = '';

test.afterEach(() => { globalThis.fetch = originalFetch; });
test.after(() => {
  if (originalKey === undefined) delete process.env.COINGECKO_API_KEY;
  else process.env.COINGECKO_API_KEY = originalKey;
});

function respond(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
function mockProviders({ failFeatured = false, failGeneral = false } = {}) {
  globalThis.fetch = async input => {
    const url = new URL(input);
    if (url.hostname === 'api.coingecko.com') {
      if (failFeatured) return respond({}, 429);
      const rate = { usd: 1, eur: 0.9, try: 40 }[url.searchParams.get('vs_currency')];
      return respond(fixtures.filter(c => url.searchParams.get('ids').split(',').includes(c.id)).map(c => ({ ...c, current_price: c.current_price * rate })));
    }
    if (failGeneral) return respond({}, 503);
    if (url.pathname.endsWith('/search')) return respond({ currencies: [] });
    return respond([
      { id: 'btc-bitcoin', symbol: 'BTC', name: 'Bitcoin', rank: 1, quotes: { USD: { price: 60000 } } },
      { id: 'orta-orta-chain', symbol: 'ORTA', name: 'Orta Chain', rank: 2000, quotes: { USD: { price: 0.03 } } }
    ]);
  };
}
async function invoke(handler, query = {}, method = 'GET') {
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ method, query }, res);
  return res;
}

test('first page includes GIBI and ORTA once on a keyless installation', async () => {
  mockProviders();
  const res = await invoke(markets);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.coins.length, 3);
  for (const item of FEATURED_COINS) {
    assert.equal(res.body.coins.filter(c => c.symbol.toUpperCase() === item.symbol).length, 1);
    assert.ok(res.body.coins.find(c => c.id === item.id).price > 0);
  }
  assert.ok(res.body.coins.some(c => c.id === 'btc-bitcoin'));
});

test('later pages do not inject featured coins or remove provider records', async () => {
  mockProviders();
  const res = await invoke(markets, { page: '2', per_page: '1' });
  assert.equal(res.body.coins.length, 1);
  assert.equal(res.body.coins[0].id, 'orta-orta-chain');
});

test('canonical IDs and symbols return only requested coins in each currency', async () => {
  for (const currency of ['usd', 'eur', 'try']) {
    mockProviders();
    const res = await invoke(markets, { ids: 'gibi-swap,orta,ORTA', currency });
    assert.equal(res.body.coins.length, 2);
    assert.equal(res.body.currency, currency);
    const rate = { usd: 1, eur: 0.9, try: 40 }[currency];
    assert.equal(res.body.coins.find(c => c.id === 'gibi-swap').price, 0.28 * rate);
  }
});

test('featured search survives general provider failure and accepts unspaced names', async () => {
  mockProviders({ failGeneral: true });
  for (const [query, id] of [['gibiswap', 'gibi-swap'], ['GIBI', 'gibi-swap'], ['orta', 'orta-chain'], ['Orta Chain', 'orta-chain']]) {
    const res = await invoke(search, { query });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.coins[0].id, id);
  }
});

test('a general outage still returns live featured prices and a partial-list note', async () => {
  mockProviders({ failGeneral: true });
  const res = await invoke(markets);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.coins.length, 2);
  assert.ok(res.body.note);
});

test('unavailable data stays null rather than becoming a zero-price quote', async () => {
  mockProviders({ failFeatured: true, failGeneral: true });
  const res = await invoke(markets, { ids: 'gibi-swap,orta-chain' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.coins.length, 2);
  assert.ok(res.body.coins.every(c => c.price === null && c.marketCap === null));
});

test('detail returns official identity, contract and a usable description', async () => {
  mockProviders();
  for (const item of FEATURED_COINS) {
    const res = await invoke(coin, { id: item.id });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.coin.contract, item.contract);
    assert.equal(res.body.coin.website, item.website);
    assert.match(res.body.description, /Ethereum/);
  }
});

test('chart is a real GET handler that returns sorted points for both featured IDs', async () => {
  for (const item of FEATURED_COINS) {
    for (const days of [1, 7, 30, 365]) {
      globalThis.fetch = async input => {
        const url = new URL(input);
        assert.equal(url.pathname, `/api/v3/coins/${item.id}/market_chart`);
        assert.equal(url.searchParams.get('vs_currency'), 'try');
        assert.equal(url.searchParams.get('days'), String(days));
        return respond({ prices: [[2000, 12], [1000, 11], [3000, null]] });
      };
      const res = await invoke(chart, { id: item.id, days, currency: 'try' });
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body.prices, [[1000, 11], [2000, 12]]);
      assert.match(res.headers['Cache-Control'], /s-maxage=/);
    }
  }
});

test('invalid inputs and unsupported methods do not reach providers', async () => {
  globalThis.fetch = () => { throw new Error('Unexpected provider call'); };
  for (const query of [{ id: 'gibi-swap', days: '2' }, { id: 'bad!', days: '1' }, { id: 'orta-chain', currency: 'gbp' }]) {
    assert.equal((await invoke(chart, query)).statusCode, 400);
  }
  assert.equal((await invoke(chart, {}, 'POST')).statusCode, 405);
  assert.equal((await invoke(markets, { page: '0' })).statusCode, 400);
});


test('rate-limited featured quotes and charts fall back to verified on-chain pools with correct TRY conversion', async () => {
  globalThis.fetch = async input => {
    const url = new URL(input);
    if (url.hostname === 'api.coingecko.com') return respond({}, 429);
    if (url.hostname === 'api.coinpaprika.com') {
      if (url.pathname.includes('/btc-bitcoin')) return respond({ quotes: { USD: { price: 60000 }, TRY: { price: 2400000 }, EUR: { price: 54000 } } });
      return respond([]);
    }
    const featured = FEATURED_COINS.find(c => url.pathname.includes(c.contract));
    if (url.pathname.includes('/ohlcv/')) return respond({ data: { attributes: { ohlcv_list: [[Math.floor(Date.now() / 1000) - 60, 1, 1, 1, 0.3, 10]] } } });
    assert.ok(featured, 'only official contract addresses are queried');
    return respond({
      data: [{ attributes: { address: '0xpool', base_token_price_usd: '0.3', reserve_in_usd: '100000', market_cap_usd: null, fdv_usd: '999999', volume_usd: { h24: '100' }, price_change_percentage: { h24: '-2' } }, relationships: { base_token: { data: { id: `eth_${featured.contract}` } } } }], included: []
    });
  };
  const res = await invoke(markets, { ids: 'gibi-swap,orta-chain', currency: 'try' });
  assert.equal(res.statusCode, 200);
  for (const coin of res.body.coins) {
    assert.equal(coin.price, 12);
    assert.equal(coin.volume24h, 4000);
    assert.equal(coin.marketCap, null, 'FDV is not passed off as circulating market cap');
    assert.equal(coin.source, 'geckoterminal');
  }
  const history = await invoke(chart, { id: 'gibi-swap', currency: 'try', days: '1' });
  assert.equal(history.statusCode, 200);
  assert.equal(history.body.currency, 'try');
  assert.equal(history.body.prices[0][1], 12);
  assert.match(history.body.note, /güncel USD kuru/);
});
