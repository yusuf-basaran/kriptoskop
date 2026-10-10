// Orkestrasyon, tema yönetimi, alarmlar ve veri döngüsü
import { fetchTopCoins, fetchCoinChart, fetchCoinDetail } from './api.js';
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
  prevPrices: new Map(),
  sortKey: 'market_cap',
  sortOrder: 'desc',
  searchQuery: '',
  currency: getCurrency(),
  viewTab: 'all',
  activeCoin: null,
  activeDays: 1,
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

  let result = state.rawCoins.filter(c => {
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
    processPipeline();

    // Fiyat alarmlarını tetikle ve kontrol et
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
  openDetailModal(coin, state.currency);
  loadChartData(coin.id, state.activeDays);

  try {
    const detail = await fetchCoinDetail(coin.id);
    const desc = detail.description?.tr || detail.description?.en || '';
    updateModalDescription(desc);
  } catch {
    updateModalDescription('Varlık açıklaması şu anda yüklenemedi.');
  }
}

async function loadChartData(coinId, days) {
  setChartLoading(true, false);
  const canvas = document.getElementById('coin-chart');

  try {
    const prices = await fetchCoinChart(coinId, state.currency, days);
    setChartLoading(false, false);
    if (prices.length === 0) {
      setChartLoading(false, true);
      return;
    }
    const isPositive = (prices[prices.length - 1][1] - prices[0][1]) >= 0;
    renderPriceChart(canvas, prices, state.currency, isPositive);
  } catch {
    setChartLoading(false, true);
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

  // Açık olan grafiğin renklerini yeni temaya uydur
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
  // Arama filtresi
  document.getElementById('search-input').addEventListener('input', debounce((e) => {
    state.searchQuery = e.target.value;
    processPipeline();
  }, 200));

  // Para birimi
  const currSelect = document.getElementById('currency-select');
  currSelect.value = state.currency;
  currSelect.addEventListener('change', (e) => {
    state.currency = e.target.value;
    setCurrency(state.currency);
    loadData(false);
    if (state.activeCoin) {
      loadChartData(state.activeCoin.id, state.activeDays);
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
    destroyChart();
    closeDetailModal();
  });

  document.getElementById('detail-modal').addEventListener('click', (e) => {
    if (e.target.id === 'detail-modal') {
      destroyChart();
      closeDetailModal();
    }
  });

  // Alarm modalı açma ve kapama
  document.getElementById('alerts-modal-open-btn').addEventListener('click', () => {
    openAlertsModal(getAlerts(), (deletedId) => {
      const remaining = deleteAlert(deletedId);
      renderAlertsList(remaining, (id) => deleteAlert(id));
      updateMetaStatus({ alertsCount: remaining.length });
    });
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
