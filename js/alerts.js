// Fiyat takip alarmlarının durumu, doğrulaması ve kontrol mekanizması
import { getAlerts, saveAlerts } from './storage.js';

export function createAlert({ coinId, coinSymbol, targetPrice, condition, currency }) {
  const target = parseFloat(targetPrice);
  if (!coinId || isNaN(target) || target <= 0) {
    return { success: false, error: 'Geçersiz fiyat hedefi' };
  }

  const alerts = getAlerts();
  const newAlert = {
    id: `${coinId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    coinId,
    coinSymbol: coinSymbol.toUpperCase(),
    targetPrice: target,
    condition, // 'above' veya 'below'
    currency: currency.toLowerCase(),
    triggered: false,
    triggeredAt: null,
    createdAt: Date.now()
  };

  alerts.push(newAlert);
  saveAlerts(alerts);
  return { success: true, alert: newAlert };
}

export function deleteAlert(alertId) {
  const alerts = getAlerts().filter(a => a.id !== alertId);
  saveAlerts(alerts);
  return alerts;
}

export function checkAlerts(currentCoins, currentCurrency) {
  const alerts = getAlerts();
  if (alerts.length === 0) return [];

  const coinMap = new Map();
  currentCoins.forEach(c => coinMap.set(c.id, c.current_price));

  const newlyTriggered = [];
  let stateModified = false;

  alerts.forEach(alert => {
    if (alert.triggered || alert.currency !== currentCurrency.toLowerCase()) {
      return;
    }

    const currentPrice = coinMap.get(alert.coinId);
    if (currentPrice === undefined || currentPrice === null) return;

    let isHit = false;
    if (alert.condition === 'above' && currentPrice >= alert.targetPrice) {
      isHit = true;
    } else if (alert.condition === 'below' && currentPrice <= alert.targetPrice) {
      isHit = true;
    }

    if (isHit) {
      alert.triggered = true;
      alert.triggeredAt = Date.now();
      stateModified = true;
      newlyTriggered.push({
        alert,
        currentPrice
      });
    }
  });

  if (stateModified) {
    saveAlerts(alerts);
  }

  return newlyTriggered;
}
