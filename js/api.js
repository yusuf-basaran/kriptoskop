// CoinGecko API, Vercel proxy desteği, iptal edilebilir grafik istekleri ve geriye dönük uyumluluk
const PAGE_CACHE_TTL_MS = 60 * 1000;
const CHART_CACHE_TTL_MS = 120 * 1000;

const pageCache = new Map();
const chartCache = new Map();
const detailCache = new Map();

let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 1500;

export class ApiError extends Error {
  constructor(message, status, retryAfter = 0) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
    this.name = 'ApiError';
  }
}

// Vercel üzerindeyken /api/proxy endpoint'ini kullanır, yerelde doğrudan çağırır
function buildApiUrl(subpath, queryObj = {}) {
  const isVercelHost = typeof window !== 'undefined' && window.location.hostname.includes('vercel.app');
  const params = new URLSearchParams(queryObj);

  if (isVercelHost) {
    return `/api/proxy?path=${encodeURIComponent(subpath)}&${params.toString()}`;
  }
  return `https://api.coingecko.com/api/v3/${subpath}?${params.toString()}`;
}

async function throttleQueue() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

function getChartFailTestOverride() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('chartfail');
  } catch {
    return null;
  }
}

export async function fetchCoinsPage(currency = 'usd', page = 1, forceBypass = false) {
  const cacheKey = `${currency.toLowerCase()}_p${page}`;
  const now = Date.now();
  const cached = pageCache.get(cacheKey);

  if (!forceBypass && cached && (now - cached.timestamp < PAGE_CACHE_TTL_MS)) {
    return { data: cached.data, fromCache: true, page };
  }

  await throttleQueue();

  const endpoint = buildApiUrl('coins/markets', {
    vs_currency: currency,
    order: 'market_cap_desc',
    per_page: '250',
    page: String(page),
    sparkline: 'false',
    price_change_percentage: '24h'
  });

  try {
    const res = await fetch(endpoint, { headers: { 'Accept': 'application/json' } });

    if (res.status === 429) {
      throw new ApiError('CoinGecko istek sınırı aşıldı (HTTP 429).', 429);
    }
    if (!res.ok) {
      throw new ApiError(`Ağ yanıtı başarısız: HTTP ${res.status}`, res.status);
    }

    const data = await res.json();
    pageCache.set(cacheKey, { timestamp: now, data });

    return { data, fromCache: false, page };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('Ağ bağlantısı kurulamadı. Sunucuya erişilemiyor.', 0);
  }
}

// main.js içindeki eski 'fetchTopCoins' çağrısı için köprü (export)
export async function fetchTopCoins(currency = 'usd', forceBypass = false) {
  return await fetchCoinsPage(currency, 1, forceBypass);
}

export async function fetchCoinsByIds(currency = 'usd', coinIds = []) {
  if (coinIds.length === 0) return [];
  await throttleQueue();

  const endpoint = buildApiUrl('coins/markets', {
    vs_currency: currency,
    ids: coinIds.slice(0, 100).join(','),
    order: 'market_cap_desc',
    sparkline: 'false',
    price_change_percentage: '24h'
  });

  try {
    const res = await fetch(endpoint, { headers: { 'Accept': 'application/json' } });
    if (res.status === 429) throw new ApiError('İstek sınırı aşıldı (HTTP 429).', 429);
    if (!res.ok) throw new ApiError(`Ağ hatası: HTTP ${res.status}`, res.status);
    return await res.json();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('Coin detay listesi alınamadı.', 0);
  }
}

export async function searchCoinsGlobal(queryText) {
  if (!queryText.trim()) return [];
  await throttleQueue();

  const endpoint = buildApiUrl('search', { query: queryText });
  try {
    const res = await fetch(endpoint, { headers: { 'Accept': 'application/json' } });
    if (res.status === 429) throw new ApiError('Arama sınırı aşıldı (HTTP 429).', 429);
    if (!res.ok) throw new ApiError(`Arama hatası: HTTP ${res.status}`, res.status);
    const result = await res.json();
    return (result.coins || []).slice(0, 25).map(c => c.id);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('Global arama servisi yanıt vermiyor.', 0);
  }
}

export async function fetchCoinChart(coinId, currency = 'usd', days = 1, abortSignal = null) {
  const cacheKey = `${coinId}_${currency.toLowerCase()}_${days}`;
  const cached = chartCache.get(cacheKey);
  const now = Date.now();

  const testFail = getChartFailTestOverride();
  if (testFail === '429') {
    console.warn(`[KRİPTOSKOP TEST] Simüle 429 tetiklendi: ${coinId}`);
    throw new ApiError('Veri limiti doldu', 429, 30);
  } else if (testFail === 'network') {
    console.warn(`[KRİPTOSKOP TEST] Simüle ağ hatası tetiklendi`);
    throw new ApiError('Bağlantı kurulamadı', 0);
  } else if (testFail === 'empty') {
    console.warn(`[KRİPTOSKOP TEST] Simüle boş veri tetiklendi`);
    return { prices: [], fromCache: false, timestamp: now };
  }

  if (cached && (now - cached.timestamp < CHART_CACHE_TTL_MS)) {
    return { prices: cached.prices, fromCache: true, timestamp: cached.timestamp };
  }

  await throttleQueue();
  const endpoint = buildApiUrl(`coins/${coinId}/market_chart`, {
    vs_currency: currency,
    days: String(days)
  });

  let attempts = 0;
  const maxAttempts = 2;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      const res = await fetch(endpoint, {
        headers: { 'Accept': 'application/json' },
        signal: abortSignal
      });

      console.log(`[KRİPTOSKOP API] Grafik Yanıtı: ${coinId} (${days}G) -> HTTP ${res.status}`);

      if (res.status === 429) {
        let retryAfterSec = 30;
        const retryHeader = res.headers.get('Retry-After');
        if (retryHeader) {
          const parsed = parseInt(retryHeader, 10);
          if (!isNaN(parsed) && parsed > 0) retryAfterSec = parsed;
        }
        throw new ApiError('Veri limiti doldu', 429, retryAfterSec);
      }

      if (!res.ok) {
        if (res.status >= 500 && attempts < maxAttempts) {
          console.warn(`[KRİPTOSKOP API] HTTP ${res.status} alındı, 800ms sonra tekrar deneniyor...`);
          await new Promise(r => setTimeout(r, 800));
          continue;
        }
        throw new ApiError(`Sunucu hatası: HTTP ${res.status}`, res.status);
      }

      const data = await res.json();
      const rawPrices = Array.isArray(data.prices) ? data.prices : [];

      chartCache.set(cacheKey, { timestamp: now, prices: rawPrices });
      return { prices: rawPrices, fromCache: false, timestamp: now };
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log(`[KRİPTOSKOP API] İstek iptal edildi: ${coinId}`);
        throw err;
      }
      if (err instanceof ApiError) throw err;

      if (attempts < maxAttempts) {
        console.warn(`[KRİPTOSKOP API] Ağ hatası, 800ms sonra tekrar deneniyor...`);
        await new Promise(r => setTimeout(r, 800));
        continue;
      }

      throw new ApiError('Bağlantı kurulamadı', 0);
    }
  }
}

export function getStaleChartData(coinId, currency = 'usd', days = 1) {
  const cacheKey = `${coinId}_${currency.toLowerCase()}_${days}`;
  const cached = chartCache.get(cacheKey);
  if (cached && Array.isArray(cached.prices) && cached.prices.length >= 2) {
    return cached;
  }
  return null;
}

export async function fetchCoinDetail(coinId, abortSignal = null) {
  const cached = detailCache.get(coinId);
  const now = Date.now();

  if (cached && (now - cached.timestamp < PAGE_CACHE_TTL_MS * 5)) {
    return cached.data;
  }

  await throttleQueue();
  const endpoint = buildApiUrl(`coins/${coinId}`, {
    localization: 'false',
    tickers: 'false',
    market_data: 'true',
    community_data: 'false',
    developer_data: 'false',
    sparkline: 'false'
  });

  try {
    const res = await fetch(endpoint, {
      headers: { 'Accept': 'application/json' },
      signal: abortSignal
    });
    if (res.status === 429) throw new ApiError('Detay verisi için hız sınırı aşıldı (429).', 429);
    if (!res.ok) throw new ApiError('Varlık detayları alınamadı.', res.status);

    const data = await res.json();
    detailCache.set(coinId, { timestamp: now, data });
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    if (err instanceof ApiError) throw err;
    throw new ApiError('Detay servisi yanıt vermiyor.', 0);
  }
}
