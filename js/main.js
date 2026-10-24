// Orkestrasyon, tema yönetimi, alarmlar ve veri döngüsü
import { fetchTopCoins, fetchCoinsByIds, searchCoinsGlobal, fetchCoinChart, getStaleChartData, fetchCoinDetail } from './api.js';
import { favoriteRows, mergeFavoriteRows } from './favorites.js';
import { 
  getFavorites, 
  toggleFavorite, 
  getCurrency, 
  setCurrency,
  getSavedTheme,
  saveTheme,
  getAlerts
} from './storage.js';
import { 
  renderPriceChart, 
  destroyChart 
} from './chart.js';
import { 
  createAlert, 
  deleteAlert, 
  checkAlerts 
} from './alerts.js';
import { 
  renderSkeletons, 
  renderMarketData, 
  updateMetaStatus, 
  renderBanner, 
  clearBanner,
  openDetailModal,
  closeDetailModal,
  updateModalDescription,
  setChartLoading,
  openAlertsModal,
  closeAlertsModal,
  renderAlertsList,
  showToast,
  applyTheme
} from './ui.js';

const state = {
  rawCoins: [],
  filteredCoins: [],
  searchCoins: [],
  searchRequestId: 0,
  favoriteCoins: [],
  favoriteRequestId: 0,
  dataRequestId: 0,
  totalCoins: 0,
  prevPrices: new Map(),
  sortKey: 'marketCap',
  sortOrder: 'desc',
  searchQuery: '',
  currency: getCurrency(),
  viewTab: 'all',
  activeCoin: null,
  activeCoinCurrency: null,
  activeDays: 1,
  chartRequestId: 0,
  detailRequestId: 0,
  theme: document.documentElement.getAttribute('data-theme') || 'dark',
  timerId: null,
  page: 1,
  source: '',
  fetchedAt: null
};

function debounce(fn, delay = 250) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

function processPipeline() {
  const compact = value => value.toLowerCase().replace(/\s+/g, '');
  const q = compact(state.searchQuery.trim());
  const favList = getFavorites();

  const coins = mergeFavoriteRows([...state.rawCoins, ...state.searchCoins], favList, state.favoriteCoins);
  state.totalCoins = coins.length;
  let result = coins.filter(c => {
    if (state.viewTab === 'fav' && !favList.includes(c.id)) {
      return false;
    }
    if (!q) return true;
    return compact(c.name).includes(q) || compact(c.symbol).includes(q) || c.contract?.toLowerCase().includes(q);
  });

  result.sort((a, b) => {
    const valA = a[state.sortKey] ?? 0;
    const valB = b[state.sortKey] ?? 0;
    if (valA === valB) return 0;
    return state.sortOrder === 'asc' ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
  });

  state.filteredCoins = result;

  renderMarketData(
    result, 
    state.prevPrices, 
    state.currency, 
    state.viewTab,
    handleCoinSelect,
    handleFavToggle
  );

  updateMetaStatus({
    totalShown: result.length,
    totalAll: state.totalCoins,
    favCount: favList.length,
    alertsCount: getAlerts().length,
    source: state.source,
    timestamp: state.fetchedAt
  });
}

async function loadFavoriteData() {
  const requestId = ++state.favoriteRequestId;
  const currency = state.currency;
  const ids = getFavorites();
  try {
    const coins = await fetchCoinsByIds(currency, ids);
    if (requestId !== state.favoriteRequestId || currency !== state.currency) return;
    // Read the current IDs again so a removed favorite cannot reappear mid-request.
    state.favoriteCoins = favoriteRows(getFavorites(), [...state.rawCoins, ...state.searchCoins, ...coins]);
  } catch {
    if (requestId !== state.favoriteRequestId || currency !== state.currency) return;
    state.favoriteCoins = favoriteRows(getFavorites(), [...state.rawCoins, ...state.searchCoins]);
  }
  processPipeline();
}

async function loadData(bypassCache = false) {
  const requestId = ++state.dataRequestId;
  const currency = state.currency;
  void loadFavoriteData();
  if (state.rawCoins.length === 0) {
    renderSkeletons(15);
  }

  try {
    state.page = 1;
    const { data, fromCache, source, fetchedAt, note } = await fetchTopCoins(currency, bypassCache);
    if (requestId !== state.dataRequestId || currency !== state.currency) return;
    state.source = source;
    state.fetchedAt = fetchedAt;
    clearBanner();
    if (note) renderBanner(note, 'warning');

    const priceMap = new Map();
    state.rawCoins.forEach(c => priceMap.set(c.id, c.price));
    state.prevPrices = priceMap;

    state.rawCoins = data;
    if (state.activeCoin && state.activeCoinCurrency !== state.currency) {
      let refreshedCoin = data.find(coin => coin.id === state.activeCoin.id);
      if (!refreshedCoin) {
        try {
          refreshedCoin = (await fetchCoinsByIds(state.currency, [state.activeCoin.id]))[0];
        } catch {
          // Mevcut ayrıntı görünümünü koru; sonraki yenilemede tekrar denenecek.
        }
      }
      if (refreshedCoin) {
        state.activeCoin = refreshedCoin;
        state.activeCoinCurrency = state.currency;
        if (!document.getElementById('detail-modal').hidden) {
          openDetailModal(refreshedCoin, state.currency);
          loadChartData(refreshedCoin.id, state.activeDays);
        }
      }
    }
    if (requestId !== state.dataRequestId || currency !== state.currency) return;
    processPipeline();

    // Alarmları kontrol et ve tetiklenenleri bildir
    const fired = checkAlerts([...data, ...state.favoriteCoins], state.currency);
    fired.forEach(({ alert, currentPrice }) => {
      const condText = alert.condition === 'above' ? 'üzerine çıktı' : 'altına indi';
      showToast(
        `ALARM TETİKLENDİ // ${alert.coinSymbol}`,
        `Fiyat ${condText}: ${currentPrice.toLocaleString('tr-TR')} ${alert.currency.toUpperCase()}`
      );
    });

    updateMetaStatus({
      timestamp: fetchedAt,
      source,
      isCache: fromCache,
      isError: false,
      totalShown: state.filteredCoins.length,
      totalAll: state.totalCoins,
      favCount: getFavorites().length,
      alertsCount: getAlerts().length
    });
  } catch (err) {
    if (requestId !== state.dataRequestId || currency !== state.currency) return;
    const isRateLimit = err.status === 429;
    renderBanner(err.message, isRateLimit ? 'warning' : 'danger', () => loadData(true));
    updateMetaStatus({
      isError: true,
      totalShown: state.filteredCoins.length,
      totalAll: state.totalCoins,
      favCount: getFavorites().length,
      alertsCount: getAlerts().length
    });
  }
}

let loadingMore = false;
async function loadNextPage() {
  if (loadingMore || state.page >= 10 || state.searchQuery.trim()) return;
  loadingMore = true;
  const currency = state.currency;
  try {
    const { fetchCoinsPage } = await import('./api.js');
    const result = await fetchCoinsPage(currency, state.page + 1);
    if (currency !== state.currency) return;
    if (result.data.length) {
      state.page += 1;
      const existing = new Set(state.rawCoins.map(coin => coin.id));
      const identity = coin => `${coin.symbol.toLowerCase()}:${coin.name.toLowerCase().replace(/\s+/g, '')}`;
      const featured = new Set(state.rawCoins.filter(coin => coin.contract).map(identity));
      state.rawCoins.push(...result.data.filter(coin => !existing.has(coin.id) && !featured.has(identity(coin))));
      state.source = result.source;
      state.fetchedAt = result.fetchedAt;
      processPipeline();
    }
  } catch { /* İlk sayfa kullanılabilir kalır. */ }
  finally { loadingMore = false; }
}

async function handleCoinSelect(coin) {
  state.activeCoin = coin;
  state.activeCoinCurrency = state.currency;
  const requestId = ++state.detailRequestId;
  openDetailModal(coin, state.currency);
  loadChartData(coin.id, state.activeDays);

  try {
    const detail = await fetchCoinDetail(coin.id, state.currency);
    if (requestId !== state.detailRequestId || state.activeCoin?.id !== coin.id) return;
    const desc = typeof detail.description === 'string' ? detail.description : detail.description?.tr || detail.description?.en || '';
    updateModalDescription(desc);
  } catch {
    if (requestId === state.detailRequestId && state.activeCoin?.id === coin.id) {
      updateModalDescription('Varlık açıklaması şu anda yüklenemedi.');
    }
  }
}

async function loadChartData(coinId, days) {
  const requestId = ++state.chartRequestId;
  setChartLoading(true, false);
  const canvas = document.getElementById('coin-chart');
  const chartNote = document.getElementById('chart-note');
  chartNote.hidden = true;
  const showFallback = () => {
    const stale = getStaleChartData(coinId, state.currency, days);
    if (stale?.prices?.length >= 2) {
      const stalePrices = stale.prices;
      const isPositive = stalePrices[stalePrices.length - 1][1] >= stalePrices[0][1];
      const rendered = renderPriceChart(canvas, stalePrices, state.currency, days, isPositive);
      setChartLoading(false, true, rendered ? 'ÖNBELLEKTEKİ GRAFİK GÖSTERİLİYOR' : 'GRAFİK VERİSİ ALINAMADI');
    } else {
      setChartLoading(false, true);
    }
  };

  try {
    const result = await fetchCoinChart(coinId, state.currency, days);
    if (requestId !== state.chartRequestId || state.activeCoin?.id !== coinId) return;
    const prices = result?.prices;
    
    if (!prices || prices.length === 0) {
      showFallback();
      return;
    }

    const isPositive = (prices[prices.length - 1][1] - prices[0][1]) >= 0;
    const rendered = renderPriceChart(canvas, prices, result.currency || state.currency, days, isPositive);
    chartNote.textContent = result.note || '';
    chartNote.hidden = !rendered || !result.note;
    
    // Grafik çizildiğinde hata katmanını kapat
    setChartLoading(false, !rendered);
  } catch (err) {
    if (requestId !== state.chartRequestId || state.activeCoin?.id !== coinId) return;
    showFallback();
  }
}

function handleFavToggle(coinId) {
  toggleFavorite(coinId);
  processPipeline();
  void loadFavoriteData();
}

function handleThemeToggle() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  state.theme = next;
  applyTheme(next);
  saveTheme(next);

  if (state.activeCoin) {
    loadChartData(state.activeCoin.id, state.activeDays);
  }
}

function syncSortUI() {
  document.querySelectorAll('th.sortable').forEach(th => {
    const key = th.dataset.key;
    if (key === state.sortKey) {
      th.classList.add('active', state.sortOrder);
      th.classList.remove(state.sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      th.classList.remove('active', 'asc', 'desc');
    }
  });

  const mobileSelect = document.getElementById('mobile-sort');
  if (mobileSelect) {
    mobileSelect.value = `${state.sortKey}-${state.sortOrder}`;
  }
}

function handleSortClick(key) {
  if (state.sortKey === key) {
    state.sortOrder = state.sortOrder === 'desc' ? 'asc' : 'desc';
  } else {
    state.sortKey = key;
    state.sortOrder = 'desc';
  }
  syncSortUI();
  processPipeline();
}

function setupListeners() {
  const sentinel = document.getElementById('load-more-sentinel');
  if (sentinel && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) loadNextPage(); }, { rootMargin: '500px' });
    observer.observe(sentinel);
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('detail-modal').hidden) {
      state.detailRequestId++;
      state.chartRequestId++;
      destroyChart();
    }
  });

  // Arama filtresi
  const runGlobalSearch = debounce((query, requestId) => {
    query = query.trim();
    if (query.length >= 2) {
      searchCoinsGlobal(query)
        .then(ids => fetchCoinsByIds(state.currency, ids))
        .then(coins => {
          if (requestId !== state.searchRequestId || query !== state.searchQuery.trim()) return;
          state.searchCoins = coins;
          processPipeline();
        })
        .catch(() => {}); // Yerel listedeki eşleşmeler kullanılabilir durumda kalır.
    }
  }, 250);
  document.getElementById('search-input').addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    state.searchCoins = [];
    const requestId = ++state.searchRequestId;
    processPipeline();
    runGlobalSearch(state.searchQuery, requestId);
  });

  // Para birimi
  const currSelect = document.getElementById('currency-select');
  currSelect.value = state.currency;
  currSelect.addEventListener('change', (e) => {
    state.currency = e.target.value;
    setCurrency(state.currency);
    state.searchCoins = [];
    state.searchRequestId++;
    state.favoriteCoins = [];
    state.rawCoins = [];
    loadData(false);
    const searchInput = document.getElementById('search-input');
    if (searchInput.value.trim().length >= 2) {
      searchInput.dispatchEvent(new Event('input'));
    }
  });

  // Tema değişimi
  document.getElementById('theme-toggle').addEventListener('click', handleThemeToggle);

  // Sekmeler
  document.querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.seg-btn').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      state.viewTab = btn.dataset.view;
      processPipeline();
      if (state.viewTab === 'fav') void loadFavoriteData();
    });
  });

  // Sıralama
  document.querySelectorAll('th.sortable').forEach(th => {
    const key = th.dataset.key;
    th.addEventListener('click', () => handleSortClick(key));
    th.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleSortClick(key);
      }
    });
  });

  // Mobil sıralama
  document.getElementById('mobile-sort').addEventListener('change', (e) => {
    const [key, order] = e.target.value.split('-');
    state.sortKey = key;
    state.sortOrder = order;
    syncSortUI();
    processPipeline();
  });

  // Yenileme
  document.getElementById('refresh-btn').addEventListener('click', () => loadData(true));

  // Modal kapatma
  document.getElementById('modal-close-btn').addEventListener('click', () => {
    state.detailRequestId++;
    state.chartRequestId++;
    destroyChart();
    closeDetailModal();
  });

  document.getElementById('detail-modal').addEventListener('click', (e) => {
    if (e.target.id === 'detail-modal') {
      state.detailRequestId++;
      state.chartRequestId++;
      destroyChart();
      closeDetailModal();
    }
  });

  // Alarm modalı açma ve kapama
  document.getElementById('alerts-modal-open-btn').addEventListener('click', () => {
    const handleDelete = (deletedId) => {
      const remaining = deleteAlert(deletedId);
      renderAlertsList(remaining, handleDelete);
      updateMetaStatus({ alertsCount: remaining.length });
    };
    openAlertsModal(getAlerts(), handleDelete);
  });

  document.getElementById('alerts-modal-close-btn').addEventListener('click', closeAlertsModal);
  document.getElementById('alerts-modal').addEventListener('click', (e) => {
    if (e.target.id === 'alerts-modal') closeAlertsModal();
  });

  // Alarm Ekleme Formu
  document.getElementById('create-alert-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!state.activeCoin) return;

    const condition = document.getElementById('alert-condition').value;
    const targetPrice = document.getElementById('alert-target-price').value;

    const res = createAlert({
      coinId: state.activeCoin.id,
      coinSymbol: state.activeCoin.symbol,
      targetPrice,
      condition,
      currency: state.currency
    });

    if (res.success) {
      showToast('ALARM KAYDEDİLDİ', `${state.activeCoin.name} için hedef fiyat listeye eklendi.`);
      updateMetaStatus({ alertsCount: getAlerts().length });
      document.getElementById('alert-target-price').value = '';
    } else {
      showToast('ALARM EKLENEMEDİ', res.error || 'Fiyat hedefini kontrol edin.');
    }
  });

  // Grafik aralıkları
  document.querySelectorAll('.range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeDays = parseInt(btn.dataset.days, 10);
      if (state.activeCoin) {
        loadChartData(state.activeCoin.id, state.activeDays);
      }
    });
  });
}

function init() {
  applyTheme(state.theme);
  setupListeners();
  syncSortUI();
  loadData(false);

  state.timerId = setInterval(() => {
    loadData(false);
  }, 60 * 1000);
}

document.addEventListener('DOMContentLoaded', init);
