export const COIN_REGISTRY = new Map();

const breaker = { until: 0 };
const VALID_CURRENCY = new Set(['usd', 'eur', 'try']);
const SAFE_ID = /^[a-z0-9-]+$/;

export function json(res, status, body) {
  return res.status(status).json(body);
}

export function method(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    json(res, 405, {
      error: 'Yalnızca GET desteklenir',
      code: 'METHOD_NOT_ALLOWED'
    });
    return false;
  }

  return true;
}

export function currencyParam(value) {
  const currency = String(value || 'usd').toLowerCase();

  if (!VALID_CURRENCY.has(currency)) {
    throw Object.assign(
      new Error('currency usd, eur veya try olmalıdır'),
      { status: 400, code: 'INVALID_CURRENCY' }
    );
  }

  return currency;
}

export function idParam(value) {
  const id = String(value || '').toLowerCase();

  if (!SAFE_ID.test(id)) {
    throw Object.assign(
      new Error('Geçersiz coin id'),
      { status: 400, code: 'INVALID_ID' }
    );
  }

  return id;
}

export function envelope(source, currency, data, extra = {}) {
  return {
    ...data,
    source,
    currency,
    fetchedAt: new Date().toISOString(),
    ...extra
  };
}

export function cache(res, seconds, stale = 0) {
  const staleDirective = stale
    ? `, stale-while-revalidate=${stale}`
    : '';

  res.setHeader(
    'Cache-Control',
    `public, s-maxage=${seconds}${staleDirective}`
  );
}

export function error(res, err) {
  const status = err.status || 502;

  if (status === 429 && err.retryAfter) {
    res.setHeader('Retry-After', String(err.retryAfter));
  }

  return json(res, status, {
    error:
      status === 400
        ? err.message
        : status === 429
          ? 'Veri sağlayıcı hız sınırına ulaştı'
          : 'Veri sağlayıcılarına şu anda erişilemiyor',
    code:
      err.code ||
      (status === 429
        ? 'RATE_LIMITED'
        : status === 400
          ? 'BAD_REQUEST'
          : 'UPSTREAM_ERROR')
  });
}

export function shouldFallback(err) {
  return (
    !err.status ||
    err.status === 429 ||
    err.status === 401 ||
    err.status === 403 ||
    err.status >= 500
  );
}

export async function upstream(url, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        ...headers
      },
      signal: controller.signal
    });

    if (!response.ok) {
      const err = new Error('Upstream error');
      err.status = response.status;
      err.retryAfter = response.headers.get('retry-after');
      throw err;
    }

    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function withProvider(coingecko, fallback) {
  const forceFallback = process.env.FORCE_FALLBACK === '1';

  if (
    !forceFallback &&
    process.env.COINGECKO_API_KEY &&
    Date.now() >= breaker.until
  ) {
    try {
      return {
        source: 'coingecko',
        data: await coingecko()
      };
    } catch (err) {
      if (!shouldFallback(err)) throw err;

      if (err.status === 401 || err.status === 403) {
        console.error(
          'CoinGecko kimlik doğrulama sorunu; API anahtarı ayarını kontrol edin.'
        );
      }

      if (
        !err.status ||
        err.status === 429 ||
        err.status >= 500 ||
        err.status === 401 ||
        err.status === 403
      ) {
        breaker.until = Date.now() + 60000;
      }
    }
  }

  try {
    return {
      source: 'coinpaprika',
      data: await fallback()
    };
  } catch (err) {
    if (err.status === 429 || err.retryAfter) throw err;

    throw Object.assign(
      new Error('Tüm veri sağlayıcıları başarısız oldu'),
      { status: 502, code: 'UPSTREAM_ERROR' }
    );
  }
}

export function cgHeaders() {
  return process.env.COINGECKO_API_KEY
    ? { 'x-cg-demo-api-key': process.env.COINGECKO_API_KEY }
    : {};
}

export function normalizeCg(coin, currency) {
  COIN_REGISTRY.set(String(coin.id).toLowerCase(), {
    name: coin.name,
    symbol: coin.symbol
  });

  return {
    id: String(coin.id).toLowerCase(),
    symbol: coin.symbol,
    name: coin.name,
    image: coin.image || '',
    price: coin.current_price ?? null,
    marketCap: coin.market_cap ?? null,
    rank: coin.market_cap_rank ?? null,
    change24h: coin.price_change_percentage_24h ?? null,
    high24h: coin.high_24h ?? null,
    low24h: coin.low_24h ?? null,
    circulatingSupply: coin.circulating_supply ?? null,
    volume24h: coin.total_volume ?? null
  };
}

export function normalizePaprika(coin, currency, id) {
  const quote =
    coin.quotes?.[currency.toUpperCase()] ||
    coin.quotes?.USD ||
    {};

  const metadata =
    COIN_REGISTRY.get(id) ||
    COIN_REGISTRY.get(String(coin.id || '').toLowerCase());

  const coinPaprikaId = coin.id || id;

  return {
    id,
    symbol: metadata?.symbol || coin.symbol,
    name: metadata?.name || coin.name,
    image: coinPaprikaId
      ? `/api/logo?id=${encodeURIComponent(coinPaprikaId)}`
      : '',
    price: quote.price ?? null,
    marketCap: quote.market_cap ?? null,
    rank: coin.rank || null,
    change24h: quote.percent_change_24h ?? null,
    high24h: null,
    low24h: null,
    circulatingSupply: coin.circulating_supply ?? null,
    volume24h: quote.volume_24h ?? null
  };
}
