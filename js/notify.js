// Tarayıcı bildirimleri, sesli uyarı ve sekme başlığı rozeti (alarm tetiklenince)
const BASE_TITLE = document.title;
let audioCtx = null;
let unseenCount = 0;

export function notifySupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotifyPermission() {
  return notifySupported() ? Notification.permission : 'unsupported';
}

export async function requestNotifyPermission() {
  if (!notifySupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function sendNotification(title, body) {
  if (getNotifyPermission() !== 'granted') return false;
  try {
    const n = new Notification(title, { body, icon: 'favicon.svg', tag: `kriptoskop-${title}` });
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return true;
  } catch {
    // Bazı mobil tarayıcılar yalnızca service worker üzerinden bildirim gösterir.
    return false;
  }
}

// Kısa iki tonlu uyarı sesi. Ses bağlamı kullanıcı etkileşiminden sonra çalışır.
export function playAlertSound() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx || new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    [880, 1175].forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const start = audioCtx.currentTime + i * 0.18;
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.15, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(start);
      osc.stop(start + 0.18);
    });
  } catch {
    // Ses çalınamazsa sessizce devam et.
  }
}

export function addTitleBadge(count = 1) {
  if (!document.hidden) return;
  unseenCount += count;
  document.title = `(${unseenCount}) ALARM — ${BASE_TITLE}`;
}

export function clearTitleBadge() {
  unseenCount = 0;
  document.title = BASE_TITLE;
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) clearTitleBadge();
});
