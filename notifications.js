// ── NOTIFIKACE ────────────────────────────────────────────────
// Stav pro detekci změn — notifikuj jen při přechodu
const NOTIF_STATE_KEY = 'notif_state';
const NOTIF_COOLDOWN  = {
  selling:    60 * 60 * 1000,   // 1 hodina
  buying:     60 * 60 * 1000,
  negative:   60 * 60 * 1000,
  ev_charging:30 * 60 * 1000,   // 30 minut
  bat_low:    2  * 60 * 60 * 1000,
  price_alert:60 * 60 * 1000,
};

let _notifState = JSON.parse(localStorage.getItem(NOTIF_STATE_KEY) || '{}');
let _swRegistration = null;

// Registrace Service Workeru
async function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    _swRegistration = await navigator.serviceWorker.register('/sw.js');
    console.log('✅ Service Worker registrován');
  } catch(e) {
    console.warn('SW registrace selhala:', e.message);
  }
}

// Vyžádat povolení notifikací
async function requestNotifPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

// Odeslat notifikaci přes SW
function sendNotification(title, body, tag, icon = '⚡') {
  if (Notification.permission !== 'granted') return;
  try {
    if (_swRegistration) {
      navigator.serviceWorker.controller?.postMessage({
        type: 'NOTIFY', title, body, tag,
        icon: '/icons/icon-192.png'
      });
    } else {
      new Notification(title, { body, tag, icon: '/icons/icon-192.png' });
    }
  } catch(e) {
    console.warn('Notifikace selhala:', e.message);
  }
}

// Zkontroluj zda je notifikace v cooldownu
function canNotify(key) {
  const last = _notifState[key] || 0;
  const cooldown = NOTIF_COOLDOWN[key] || 60 * 60 * 1000;
  return Date.now() - last > cooldown;
}

function markNotified(key) {
  _notifState[key] = Date.now();
  localStorage.setItem(NOTIF_STATE_KEY, JSON.stringify(_notifState));
}

// ── HLAVNÍ NOTIFIKAČNÍ LOGIKA ─────────────────────────────────
function checkNotifications(priceData, fveData, rules) {
  if (Notification.permission !== 'granted') return;
  if (!priceData) return;

  const today   = priceData.hoursToday || [];
  if (!today.length) return;

  let idx = today.findIndex(s => {
    const now = new Date();
    return s.hour === now.getHours() && s.minute <= now.getMinutes();
  });
  if (idx < 0) idx = 0;
  const cur     = today[idx];
  const spot    = cur?.priceCZK ?? 0;
  const r       = rules || loadRules();
  const sellAbove = r.sellAbove ?? 3500;
  const buyBelow  = r.buyBelow  ?? r.feedAbove ?? 1500;

  // Stav FVE
  const diagRecs = fveData?.records || [];
  const getVal   = code => diagRecs.find(r => r.code === code)?.rawValue ?? null;
  const soc      = getVal('bs') ?? getVal('SOC') ?? 100;
  const evStatus = diagRecs.find(r => r.code === 'evs')?.rawValue;
  const prevEv   = _notifState._prevEvStatus;

  // 1. Záporná cena
  if (spot < 0 && canNotify('negative')) {
    sendNotification(
      '⚡ Záporná cena elektřiny!',
      `Spot: ${spot} Kč/MWh — ideální čas nabíjet baterii a auto`,
      'negative'
    );
    markNotified('negative');
  }

  // 2. Začínám prodávat (přechod pod → nad práh)
  const wasSelling = _notifState._prevSelling || false;
  const isSelling  = spot > sellAbove;
  if (isSelling && !wasSelling && canNotify('selling')) {
    sendNotification(
      '🔴 Aktivní prodej do sítě',
      `Spot ${spot} Kč/MWh — prodávám přes grid setpoint`,
      'selling'
    );
    markNotified('selling');
  }
  _notifState._prevSelling = isSelling;

  // 3. Začínám nakupovat
  const wasBuying = _notifState._prevBuying || false;
  const isBuying  = spot < buyBelow && spot >= 0;
  if (isBuying && !wasBuying && canNotify('buying')) {
    sendNotification(
      '🟢 Levná elektřina — nabíjím baterii',
      `Spot ${spot} Kč/MWh — nabíjím baterii naplno`,
      'buying'
    );
    markNotified('buying');
  }
  _notifState._prevBuying = isBuying;

  // 4. EV nabíjení začalo
  if (evStatus === 1 && prevEv !== 1 && canNotify('ev_charging')) {
    sendNotification(
      '🚗 Nabíjení auta zahájeno',
      `EV nabíječka začala nabíjet`,
      'ev_charging'
    );
    markNotified('ev_charging');
  }
  _notifState._prevEvStatus = evStatus;

  // 5. Baterie nízká
  if (soc < 20 && canNotify('bat_low')) {
    sendNotification(
      '🔋 Baterie je nízká',
      `SOC: ${Math.round(soc)}% — zvažte omezení spotřeby`,
      'bat_low'
    );
    markNotified('bat_low');
  }

  // 6. Upozornění na blížící se drahou hodinu (za 15 minut)
  const next = today[idx + 1];
  if (next && next.priceCZK > 5000 && canNotify('price_alert')) {
    sendNotification(
      '⚠️ Za 15 min drahá elektřina',
      `Příští slot: ${next.priceCZK} Kč/MWh — připravuji prodej`,
      'price_alert'
    );
    markNotified('price_alert');
  }

  localStorage.setItem(NOTIF_STATE_KEY, JSON.stringify(_notifState));
}

// ── NOTIFIKACE UI ─────────────────────────────────────────────
async function enableNotifications() {
  const banner = document.getElementById('notif-banner');
  const granted = await requestNotifPermission();
  if (banner) banner.style.display = 'none';
  updateNotifStatus();
  if (granted) {
    sendNotification(
      '✅ Notifikace povoleny',
      'Budeš dostávat upozornění na prodej, nákup a záporné ceny',
      'test'
    );
  }
}

function updateNotifStatus() {
  const el = document.getElementById('notif-status');
  if (!el) return;
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  const map = {
    granted:     { text: '🔔 Notifikace povoleny', color: 'var(--accent)' },
    denied:      { text: '🔕 Notifikace zakázány (povolte v nastavení prohlížeče)', color: 'var(--red)' },
    default:     { text: '⏸️ Notifikace nepovoleny', color: 'var(--muted)' },
    unsupported: { text: '❌ Prohlížeč nepodporuje notifikace', color: 'var(--muted)' },
  };
  const s = map[perm] || map.unsupported;
  el.textContent = s.text;
  el.style.color  = s.color;
}

function testNotification() {
  if (Notification.permission !== 'granted') {
    enableNotifications();
    return;
  }
  sendNotification(
    '🧪 Testovací notifikace',
    `Spot: ${priceData?.hoursToday?.[0]?.priceCZK ?? '—'} Kč/MWh · Baterie: ${fveData?.records?.find(r=>r.code==='bs')?.rawValue ?? '—'}%`,
    'test'
  );
}



