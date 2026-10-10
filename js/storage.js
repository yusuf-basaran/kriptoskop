// localStorage üzerinde favoriler, para birimi, temalar ve alarmların yönetimi
const FAVORITES_KEY = 'kriptoskop_favorites';
const CURRENCY_KEY = 'kriptoskop_currency';
const THEME_KEY = 'kriptoskop_theme';
const ALERTS_KEY = 'kriptoskop_alerts';

const VALID_CURRENCIES = ['usd', 'eur', 'try'];

export function getFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function toggleFavorite(coinId) {
  const current = new Set(getFavorites());
  if (current.has(coinId)) {
    current.delete(coinId);
  } else {
    current.add(coinId);
  }
  const next = Array.from(current);
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  } catch {
    // Depolama limitinde koru
  }
  return next;
}

export function isFavorite(coinId) {
  return getFavorites().includes(coinId);
}

export function getCurrency() {
  try {
    const saved = (localStorage.getItem(CURRENCY_KEY) || 'usd').toLowerCase();
    return VALID_CURRENCIES.includes(saved) ? saved : 'usd';
  } catch {
    return 'usd';
  }
}

export function setCurrency(currency) {
  const normalized = currency.toLowerCase();
  if (!VALID_CURRENCIES.includes(normalized)) return;
  try {
    localStorage.setItem(CURRENCY_KEY, normalized);
  } catch {
    // Depolama hatasında sessizce geç
  }
}

export function getSavedTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

export function saveTheme(theme) {
  try {
    if (theme) {
      localStorage.setItem(THEME_KEY, theme);
    } else {
      localStorage.removeItem(THEME_KEY);
    }
  } catch {
    // Korumalı ortamlarda sessiz kal
  }
}

export function getAlerts() {
  try {
    const raw = localStorage.getItem(ALERTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAlerts(alerts) {
  try {
    localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
  } catch {
    // Kota aşımında koru
  }
}
