// Orkestrasyon, tema yönetimi, alarmlar ve veri döngüsü
import { fetchTopCoins, fetchCoinsByIds, searchCoinsGlobal, fetchCoinChart, fetchCoinDetail } from './api.js';
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
  prevPrices: new Map(),
  sortKey: 'market_cap',
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
  timerId: null
};

function debounce(fn, delay = 250) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

function processPipeline() {
  const q = state.searchQuery.trim().toLowerCase();
  const favList = getFavorites();

  const coinMap = new Map(state.rawCoins.map(coin => [coin.id, coin]));
  state.searchCoins.forEach(coin => coinMap.set(coin.id, coin));
  let result = Array.from(coinMap.values()).filter(c => {
    if (state.viewTab === 'fav' && !favList.includes(c.id)) {
      return false;
    }
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q);
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
    totalAll: state.rawCoins.length,
    favCount: favList.length,
    alertsCount: getAlerts().length
  });
}

async function loadData(bypassCache = false) {
  if (state.rawCoins.length === 0) {
    renderSkeletons(15);
  }

  try {
    const { data, fromCache } = await fetchTopCoins(state.currency, bypassCache);
    clearBanner();

    const priceMap = new Map();
    state.rawCoins.forEach(c => priceMap.set(c.id, c.current_price));
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
    processPipeline();

    // Alarmları kontrol et ve tetiklenenleri bildir
    const fired = checkAlerts(data, state.currency);
    fired.forEach(({ alert, currentPrice }) => {
      const condText = alert.condition === 'above' ? 'üzerine çıktı' : 'altına indi';
      showToast(
        `ALARM TETİKLENDİ // ${alert.coinSymbol}`,
        `Fiyat ${condText}: ${currentPrice.toLocaleString('tr-TR')} ${alert.currency.toUpperCase()}`
      );
    });

    updateMetaStatus({
      timestamp: Date.now(),
      isCache: fromCache,
      isError: false,
      totalShown: state.filteredCoins.length,
      totalAll: state.rawCoins.length,
      favCount: getFavorites().length,
      alertsCount: getAlerts().length
    });
  } catch (err) {
    const isRateLimit = err.status === 429;
    renderBanner(err.message, isRateLimit ? 'warning' : 'danger', () => loadData(true));
    updateMetaStatus({
      isError: true,
      totalShown: state.filteredCoins.length,
      totalAll: state.rawCoins.length,
      favCount: getFavorites().length,
      alertsCount: getAlerts().length
    });
  }
}

async function handleCoinSelect(coin) {
  state.activeCoin = coin;
  state.activeCoinCurrency = state.currency;
  const requestId = ++state.detailRequestId;
  openDetailModal(coin, state.currency);
  loadChartData(coin.id, state.activeDays);

  try {
    const detail = await fetchCoinDetail(coin.id);
    if (requestId !== state.detailRequestId || state.activeCoin?.id !== coin.id) return;
    const desc = detail.description?.tr || detail.description?.en || '';
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

  try {
    const result = await fetchCoinChart(coinId, state.currency, days);
    if (requestId !== state.chartRequestId || state.activeCoin?.id !== coinId) return;
    const prices = result?.prices;
    
    if (!prices || prices.length === 0) {
      setChartLoading(false, true);
      return;
    }

    const isPositive = (prices[prices.length - 1][1] - prices[0][1]) >= 0;
    const rendered = renderPriceChart(canvas, prices, state.currency, days, isPositive);
    
    // Grafik çizildiğinde hata katmanını kapat
    setChartLoading(false, !rendered);
  } catch (err) {
    if (requestId === state.chartRequestId) setChartLoading(false, true);
  }
}

function handleFavToggle(coinId) {
  toggleFavorite(coinId);
  processPipeline();
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
