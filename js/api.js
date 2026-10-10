// CoinGecko API ve bellek içi önbellekleme
const BASE_URL = 'https://api.coingecko.com/api/v3';
const CACHE_TTL_MS = 60 * 1000;
const CHART_CACHE_TTL_MS = 120 * 1000;

let listCache = {
  timestamp: 0,
  currency: '',
  data: null
};

// Grafik ve coin detay istekleri için bellek içi önbellek havuzu
const chartCache = new Map();
const detailCache = new Map();

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

export async function fetchTopCoins(currency = 'usd', forceBypassCache = false) {
  const now = Date.now();
  const cacheAge = now - listCache.timestamp;

  if (!forceBypassCache && listCache.data && listCache.currency === currency && cacheAge < CACHE_TTL_MS) {
    return { data: listCache.data, fromCache: true };
  }

  const endpoint = `${BASE_URL}/coins/markets?vs_currency=${currency}&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=24h`;

  try {
    const res = await fetch(endpoint, {
      headers: { 'Accept': 'application/json' }
    });

    if (res.status === 429) {
      throw new ApiError('CoinGecko istek sınırı aşıldı (HTTP 429). Lütfen 1 dakika bekleyin.', 429);
    }
    if (!res.ok) {
      throw new ApiError(`Ağ yanıtı başarısız: HTTP ${res.status}`, res.status);
    }

    const payload = await res.json();
    listCache = { timestamp: now, currency, data: payload };

    return { data: payload, fromCache: false };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('Ağ bağlantısı kurulamadı. Sunucuya erişilemiyor.', 0);
  }
}

export async function fetchCoinChart(coinId, currency = 'usd', days = 1) {
  const cacheKey = `${coinId}_${currency}_${days}`;
  const cached = chartCache.get(cacheKey);
  const now = Date.now();

  if (cached && (now - cached.timestamp < CHART_CACHE_TTL_MS)) {
    return cached.prices;
  }

  const endpoint = `${BASE_URL}/coins/${coinId}/market_chart?vs_currency=${currency}&days=${days}`;

  try {
    const res = await fetch(endpoint, { headers: { 'Accept': 'application/json' } });
    if (res.status === 429) throw new ApiError('Grafik verisi için hız sınırı aşıldı (HTTP 429).', 429);
    if (!res.ok) throw new ApiError('Grafik verisi alınamadı.', res.status);

    const data = await res.json();
    const prices = data.prices || [];
    chartCache.set(cacheKey, { timestamp: now, prices });
    return prices;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('Grafik servisine bağlanılamadı.', 0);
  }
}

export async function fetchCoinDetail(coinId) {
  const cached = detailCache.get(coinId);
  const now = Date.now();

  if (cached && (now - cached.timestamp < CACHE_TTL_MS * 5)) {
    return cached.data;
  }

  const endpoint = `${BASE_URL}/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`;

  try {
    const res = await fetch(endpoint, { headers: { 'Accept': 'application/json' } });
    if (res.status === 429) throw new ApiError('Detay verisi için hız sınırı aşıldı (429).', 429);
    if (!res.ok) throw new ApiError('Varlık detayları alınamadı.', res.status);

    const data = await res.json();
    detailCache.set(coinId, { timestamp: now, data });
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('Detay servisi yanıt vermiyor.', 0);
  }
}
