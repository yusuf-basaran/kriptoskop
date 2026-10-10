// Arayüz render, modal odak yönetimi, toast bildirimleri ve alarm arayüzü
import { isFavorite } from './storage.js';

const tbody = document.getElementById('market-tbody');
const cardFlow = document.getElementById('card-flow');
const emptyState = document.getElementById('empty-state');
const emptyTitle = document.getElementById('empty-title');
const emptySub = document.getElementById('empty-sub');
const bannerRegion = document.getElementById('banner-region');
const lastUpdateEl = document.getElementById('last-update');
const filterCountEl = document.getElementById('filter-count');
const statusTextEl = document.getElementById('stream-status');
const pulseDotEl = document.getElementById('stream-pulse');
const colPriceLabel = document.getElementById('col-price-label');

// Coin Detay Modalı
const detailModal = document.getElementById('detail-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');
const modalCoinImg = document.getElementById('modal-coin-img');
const modalTitle = document.getElementById('modal-title');
const modalSymbol = document.getElementById('modal-symbol');
const modalPrice = document.getElementById('modal-price');
const modalHighLow = document.getElementById('modal-high-low');
const modalMcap = document.getElementById('modal-mcap');
const modalSupply = document.getElementById('modal-supply');
const modalDesc = document.getElementById('modal-desc');
const chartLoader = document.getElementById('chart-loader');
const chartError = document.getElementById('chart-error');
const alertCurSymbol = document.getElementById('alert-cur-symbol');

// Alarmlar Modalı ve Toast
const alertsModal = document.getElementById('alerts-modal');
const alertsModalCloseBtn = document.getElementById('alerts-modal-close-btn');
const alertsListContainer = document.getElementById('alerts-list-container');
const alertsCountBadge = document.getElementById('alerts-count-badge');
const toastContainer = document.getElementById('toast-container');

// Tema elemanları
const themeText = document.getElementById('theme-text');

let previousFocusedElement = null;

function createFormatters(currency = 'usd') {
  const cur = currency.toUpperCase();
  return {
    price: new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: cur,
      minimumFractionDigits: 2,
      maximumFractionDigits: 6
    }),
    compact: new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: cur,
      notation: 'compact',
      compactDisplay: 'short'
    }),
    percent: new Intl.NumberFormat('tr-TR', {
      style: 'percent',
      signDisplay: 'always',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }),
    number: new Intl.NumberFormat('tr-TR', {
      maximumFractionDigits: 0
    })
  };
}

export function renderSkeletons(rowCount = 12) {
  tbody.textContent = '';
  cardFlow.textContent = '';
  emptyState.hidden = true;

  const rowFragment = document.createDocumentFragment();
  const cardFragment = document.createDocumentFragment();

  for (let i = 0; i < rowCount; i++) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="skel-block" style="width: 14px;"></span></td>
      <td><span class="skel-block" style="width: 16px;"></span></td>
      <td>
        <div class="asset-cell">
          <span class="skel-block" style="width: 20px; height: 20px;"></span>
          <span class="skel-block" style="width: 100px;"></span>
        </div>
      </td>
      <td class="col-num"><span class="skel-block" style="width: 70px;"></span></td>
      <td class="col-num"><span class="skel-block" style="width: 50px;"></span></td>
      <td class="col-num"><span class="skel-block" style="width: 90px;"></span></td>
    `;
    rowFragment.appendChild(tr);

    const card = document.createElement('div');
    card.className = 'asset-card';
    card.innerHTML = `
      <div class="card-head">
        <span class="skel-block" style="width: 120px;"></span>
        <span class="skel-block" style="width: 30px;"></span>
      </div>
      <div class="card-metrics">
        <span class="skel-block" style="width: 80px; height: 16px;"></span>
        <span class="skel-block" style="width: 80px; height: 16px;"></span>
      </div>
    `;
    cardFragment.appendChild(card);
  }

  tbody.appendChild(rowFragment);
  cardFlow.appendChild(cardFragment);
}

function createStarSvg(isFilled) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', isFilled 
    ? 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z'
    : 'M12 4.24l2.11 4.28 4.73.69-3.42 3.33.81 4.71-4.23-2.22-4.23 2.22.81-4.71-3.42-3.33 4.73-.69L12 4.24M12 2L8.91 8.26 2 9.27l5 4.87-1.18 6.88L12 17.77l6.18 3.25L17 14.14l5-4.87-6.91-1.01L12 2z'
  );
  svg.appendChild(path);
  return svg;
}

export function renderMarketData(items, prevPricesMap = new Map(), currency = 'usd', currentView = 'all', onCoinClick = null, onFavToggle = null) {
  tbody.textContent = '';
  cardFlow.textContent = '';
  colPriceLabel.textContent = `FİYAT (${currency.toUpperCase()})`;

  if (items.length === 0) {
    emptyState.hidden = false;
    if (currentView === 'fav') {
      emptyTitle.textContent = 'FAVORİ İZLEME LİSTESİ BOŞ';
      emptySub.textContent = 'Takip ettiğiniz varlık yok. Tablodaki yıldız simgelerini kullanarak varlık ekleyin.';
    } else {
      emptyTitle.textContent = 'KAYIT BULUNAMADI';
      emptySub.textContent = 'Filtre kriterine uyan kripto varlık yok.';
    }
    return;
  }
  emptyState.hidden = true;

  const fmt = createFormatters(currency);
  const rowFragment = document.createDocumentFragment();
  const cardFragment = document.createDocumentFragment();

  items.forEach(coin => {
    const prevPrice = prevPricesMap.get(coin.id);
    let flashClass = '';
    if (prevPrice !== undefined && prevPrice !== coin.current_price) {
      flashClass = coin.current_price > prevPrice ? 'flash-up' : 'flash-down';
    }

    const priceText = fmt.price.format(coin.current_price || 0);
    const mcapText = fmt.compact.format(coin.market_cap || 0);
    const changeVal = (coin.price_change_percentage_24h || 0) / 100;
    const changeText = fmt.percent.format(changeVal);
    const isPositive = (coin.price_change_percentage_24h || 0) >= 0;
    const favActive = isFavorite(coin.id);

    // Tablo Satırı
    const tr = document.createElement('tr');
    tr.dataset.id = coin.id;

    const tdFav = document.createElement('td');
    tdFav.className = 'col-fav';
    const favBtn = document.createElement('button');
    favBtn.className = `fav-btn ${favActive ? 'active' : ''}`;
    favBtn.setAttribute('aria-label', favActive ? `${coin.name} favorilerden çıkar` : `${coin.name} favorilere ekle`);
    favBtn.appendChild(createStarSvg(favActive));
    favBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (onFavToggle) onFavToggle(coin.id);
    });
    tdFav.appendChild(favBtn);

    const tdRank = document.createElement('td');
    tdRank.className = 'col-rank';
    tdRank.textContent = String(coin.market_cap_rank || '-');

    const tdAsset = document.createElement('td');
    tdAsset.className = 'col-asset';
    const assetBox = document.createElement('div');
    assetBox.className = 'asset-cell';

    const img = document.createElement('img');
    img.className = 'asset-icon';
    img.src = coin.image;
    img.alt = '';
    img.loading = 'lazy';
    img.width = 20;
    img.height = 20;
    img.onerror = () => {
      img.onerror = null;
      img.src = 'assets/coin-placeholder.svg';
    };

    const nameSpan = document.createElement('span');
    nameSpan.className = 'asset-name';
    nameSpan.textContent = coin.name;

    const symSpan = document.createElement('span');
    symSpan.className = 'asset-symbol';
    symSpan.textContent = (coin.symbol || '').toUpperCase();

    assetBox.append(img, nameSpan, symSpan);
    tdAsset.appendChild(assetBox);

    const tdPrice = document.createElement('td');
    tdPrice.className = `col-num ${flashClass}`;
    tdPrice.textContent = priceText;

    const tdChange = document.createElement('td');
    tdChange.className = `col-num ${isPositive ? 'num-positive' : 'num-negative'}`;
    tdChange.textContent = changeText;

    const tdCap = document.createElement('td');
    tdCap.className = 'col-num';
    tdCap.textContent = mcapText;

    tr.append(tdFav, tdRank, tdAsset, tdPrice, tdChange, tdCap);
    tr.addEventListener('click', () => {
      if (onCoinClick) onCoinClick(coin);
    });
    rowFragment.appendChild(tr);

    // Mobil Kart
    const card = document.createElement('div');
    card.className = 'asset-card';
    card.dataset.id = coin.id;

    const cardHead = document.createElement('div');
    cardHead.className = 'card-head';

    const headLeft = document.createElement('div');
    headLeft.className = 'card-head-left';
    const mobileFavBtn = favBtn.cloneNode(true);
    mobileFavBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (onFavToggle) onFavToggle(coin.id);
    });
    const mobileAssetBox = assetBox.cloneNode(true);
    const mobileImg = mobileAssetBox.querySelector('img');
    if (mobileImg) mobileImg.onerror = () => {
      mobileImg.onerror = null;
      mobileImg.src = 'assets/coin-placeholder.svg';
    };
    headLeft.append(mobileFavBtn, mobileAssetBox);

    const cardRank = document.createElement('span');
    cardRank.className = 'col-rank';
    cardRank.textContent = `#${coin.market_cap_rank || '-'}`;

    cardHead.append(headLeft, cardRank);

    const cardMetrics = document.createElement('div');
    cardMetrics.className = 'card-metrics';
    cardMetrics.innerHTML = `
      <div class="metric-field">
        <span class="metric-label">FİYAT</span>
        <span class="metric-val ${flashClass}">${priceText}</span>
      </div>
      <div class="metric-field">
        <span class="metric-label">24S DEĞİŞİM</span>
        <span class="metric-val ${isPositive ? 'num-positive' : 'num-negative'}">${changeText}</span>
      </div>
      <div class="metric-field">
        <span class="metric-label">PİYASA DEĞERİ</span>
        <span class="metric-val">${mcapText}</span>
      </div>
      <div class="metric-field">
        <span class="metric-label">24S HACİM</span>
        <span class="metric-val">${fmt.compact.format(coin.total_volume || 0)}</span>
      </div>
    `;

    card.append(cardHead, cardMetrics);
    card.addEventListener('click', () => {
      if (onCoinClick) onCoinClick(coin);
    });
    cardFragment.appendChild(card);
  });

  tbody.appendChild(rowFragment);
  cardFlow.appendChild(cardFragment);
}

function sanitizeHtmlToText(htmlStr) {
  if (!htmlStr) return 'Detaylı varlık açıklaması bulunmuyor.';
  const doc = new DOMParser().parseFromString(htmlStr, 'text/html');
  const clean = doc.body.textContent || '';
  return clean.length > 320 ? clean.slice(0, 320) + '...' : clean;
}

export function openDetailModal(coin, currency = 'usd') {
  previousFocusedElement = document.activeElement;
  const fmt = createFormatters(currency);

  setChartLoading(true, false);

  modalCoinImg.onerror = () => {
    modalCoinImg.onerror = null;
    modalCoinImg.src = 'assets/coin-placeholder.svg';
  };
  modalCoinImg.src = coin.image || 'assets/coin-placeholder.svg';
  modalTitle.textContent = coin.name;
  modalSymbol.textContent = (coin.symbol || '').toUpperCase();
  modalPrice.textContent = fmt.price.format(coin.current_price || 0);
  modalHighLow.textContent = `${fmt.price.format(coin.high_24h || 0)} / ${fmt.price.format(coin.low_24h || 0)}`;
  modalMcap.textContent = fmt.compact.format(coin.market_cap || 0);

  const supply = coin.circulating_supply ? fmt.number.format(coin.circulating_supply) : 'Bilinmiyor';
  modalSupply.textContent = `${supply} ${(coin.symbol || '').toUpperCase()}`;
  modalDesc.textContent = 'Açıklama getiriliyor...';

  alertCurSymbol.textContent = currency.toUpperCase();
  const alertInput = document.getElementById('alert-target-price');
  alertInput.value = coin.current_price || '';

  detailModal.hidden = false;
  detailModal.setAttribute('aria-hidden', 'false');
  modalCloseBtn.focus();

  document.addEventListener('keydown', handleModalFocusTrap);
}

export function updateModalDescription(htmlDescription) {
  modalDesc.textContent = sanitizeHtmlToText(htmlDescription);
}

export function setChartLoading(isLoading, hasError = false) {
  chartLoader.hidden = !isLoading;
  chartError.hidden = !hasError;
}

export function closeDetailModal() {
  detailModal.hidden = true;
  detailModal.setAttribute('aria-hidden', 'true');
  document.removeEventListener('keydown', handleModalFocusTrap);

  if (previousFocusedElement && typeof previousFocusedElement.focus === 'function') {
    previousFocusedElement.focus();
  }
}

export function openAlertsModal(alerts, onDeleteAlert = null) {
  previousFocusedElement = document.activeElement;
  renderAlertsList(alerts, onDeleteAlert);

  alertsModal.hidden = false;
  alertsModal.setAttribute('aria-hidden', 'false');
  alertsModalCloseBtn.focus();

  document.addEventListener('keydown', handleModalFocusTrap);
}

export function closeAlertsModal() {
  alertsModal.hidden = true;
  alertsModal.setAttribute('aria-hidden', 'true');
  document.removeEventListener('keydown', handleModalFocusTrap);

  if (previousFocusedElement && typeof previousFocusedElement.focus === 'function') {
    previousFocusedElement.focus();
  }
}

export function renderAlertsList(alerts, onDeleteAlert = null) {
  alertsListContainer.textContent = '';
  alertsCountBadge.textContent = String(alerts.length);

  if (alerts.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <p class="empty-title">KAYITLI ALARM YOK</p>
      <p class="empty-sub">Detay penceresini açarak istediğiniz kripto varlığa fiyat hedefi tanımlayın.</p>
    `;
    alertsListContainer.appendChild(empty);
    return;
  }

  alerts.forEach(item => {
    const row = document.createElement('div');
    row.className = `alert-row ${item.triggered ? 'triggered' : ''}`;

    const info = document.createElement('div');
    info.className = 'alert-info-col';

    const title = document.createElement('span');
    title.className = 'alert-asset-tag';
    title.textContent = item.coinSymbol;

    const conditionText = item.condition === 'above' ? '≥ Hedef:' : '≤ Hedef:';
    const detail = document.createElement('span');
    detail.className = 'alert-condition-tag';
    detail.textContent = `${conditionText} ${item.targetPrice.toLocaleString('tr-TR')} ${item.currency.toUpperCase()}`;

    info.append(title, detail);

    const rightSide = document.createElement('div');
    rightSide.style.display = 'flex';
    rightSide.style.alignItems = 'center';
    rightSide.style.gap = '8px';

    const badge = document.createElement('span');
    badge.className = `alert-status-badge ${item.triggered ? 'fired' : 'pending'}`;
    badge.textContent = item.triggered ? 'TETİKLENDİ' : 'BEKLİYOR';

    const delBtn = document.createElement('button');
    delBtn.className = 'ctrl-btn icon-only';
    delBtn.setAttribute('aria-label', `${item.coinSymbol} alarmını sil`);
    delBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;
    delBtn.addEventListener('click', () => {
      if (onDeleteAlert) onDeleteAlert(item.id);
    });

    rightSide.append(badge, delBtn);
    row.append(info, rightSide);
    alertsListContainer.appendChild(row);
  });
}

export function showToast(title, message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'alert');

  const body = document.createElement('div');
  body.className = 'toast-body';

  const tTitle = document.createElement('span');
  tTitle.className = 'toast-title';
  tTitle.textContent = title;

  const tMsg = document.createElement('span');
  tMsg.textContent = message;

  body.append(tTitle, tMsg);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'toast-close';
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', 'Bildirimi kapat');
  closeBtn.addEventListener('click', () => toast.remove());

  toast.append(body, closeBtn);
  toastContainer.appendChild(toast);

  setTimeout(() => {
    if (toast.isConnected) toast.remove();
  }, 6000);
}

function handleModalFocusTrap(e) {
  const activeModal = !detailModal.hidden ? detailModal : (!alertsModal.hidden ? alertsModal : null);
  if (!activeModal) return;

  if (e.key === 'Escape') {
    if (!detailModal.hidden) closeDetailModal();
    if (!alertsModal.hidden) closeAlertsModal();
    return;
  }

  if (e.key === 'Tab') {
    const focusable = activeModal.querySelectorAll('button, select, input, [tabindex="0"]');
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.getElementById('meta-theme-color');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#E4E8EC' : '#090B0E');
  themeText.textContent = theme === 'light' ? 'GÜNDÜZ' : 'GECE';
}

export function updateMetaStatus({ timestamp, isCache, isError, totalShown, totalAll, favCount, alertsCount }) {
  if (timestamp) {
    const d = new Date(timestamp);
    lastUpdateEl.textContent = d.toTimeString().split(' ')[0];
  }

  filterCountEl.textContent = `${totalShown}/${totalAll}`;
  const favEl = document.getElementById('fav-count');
  if (favEl && favCount !== undefined) favEl.textContent = String(favCount);
  if (alertsCountBadge && alertsCount !== undefined) alertsCountBadge.textContent = String(alertsCount);

  if (isError) {
    pulseDotEl.className = 'pulse-dot error';
    statusTextEl.textContent = 'KOPUK';
  } else if (isCache) {
    pulseDotEl.className = 'pulse-dot stale';
    statusTextEl.textContent = 'ÖNBELLEK';
  } else {
    pulseDotEl.className = 'pulse-dot';
    statusTextEl.textContent = 'CANLI';
  }
}

export function renderBanner(message, type = 'danger', onRetry = null) {
  bannerRegion.textContent = '';
  if (!message) return;

  const banner = document.createElement('div');
  banner.className = `banner banner-${type}`;

  const content = document.createElement('div');
  content.className = 'banner-content';

  const code = document.createElement('span');
  code.className = 'banner-code';
  code.textContent = type === 'warning' ? 'UYARI // SINIR' : 'HATA // BAĞLANTI';

  const msg = document.createElement('span');
  msg.className = 'banner-text';
  msg.textContent = message;

  content.append(code, msg);
  banner.appendChild(content);

  if (onRetry) {
    const btn = document.createElement('button');
    btn.className = 'ctrl-btn';
    btn.textContent = 'TEKRAR DENE';
    btn.setAttribute('aria-label', 'Bağlantıyı yeniden dene');
    btn.addEventListener('click', onRetry);
    banner.appendChild(btn);
  }

  bannerRegion.appendChild(banner);
}

export function clearBanner() {
  bannerRegion.textContent = '';
}
