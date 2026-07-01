// Vérifie les messages Telegram reçus depuis le dernier passage.
// Si un message récent vient de toi → génère et envoie les prévisions.
// Lancé toutes les ~5 min par GitHub Actions (responder.yml).
require('dotenv/config');
const { SPOTS } = require('./src/config');
const { scrapeAllSpots } = require('./src/scraper');
const { analyzeForecasts } = require('./src/analyzer');
const { sendReport } = require('./src/telegram');
const { fetchTides } = require('./src/tides');
const { fetchAirByHour, fetchWaterTemp } = require('./src/weather');
const { parseTargetDay } = require('./src/dayparse');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ALLOWED_CHAT = String(process.env.TELEGRAM_CHAT_ID);
const API = `https://api.telegram.org/bot${TOKEN}`;

// On ne répond qu'aux messages de moins de 10 min (évite de répondre à un vieux backlog)
const MAX_AGE_SECONDS = 600;

async function tg(method, params) {
  const url = `${API}/${method}${params ? '?' + new URLSearchParams(params) : ''}`;
  const res = await fetch(url);
  const json = await res.json();
  if (!json.ok) throw new Error(`${method}: ${json.description}`);
  return json.result;
}

(async () => {
  try {
    // 1. Récupérer les messages non confirmés
    const updates = await tg('getUpdates', { timeout: '0' });

    if (updates.length === 0) {
      console.log('Aucun nouveau message.');
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const maxUpdateId = Math.max(...updates.map(u => u.update_id));

    // Dernier message récent venant de toi (avec son texte)
    const freshMsgs = updates
      .map(u => u.message)
      .filter(m => m && String(m.chat.id) === ALLOWED_CHAT && (now - m.date) <= MAX_AGE_SECONDS);
    const lastMsg = freshMsgs[freshMsgs.length - 1];

    // 2. Confirmer TOUS les updates pour ne pas les retraiter au prochain passage
    await tg('getUpdates', { offset: String(maxUpdateId + 1), timeout: '0' });

    if (!lastMsg) {
      console.log(`${updates.length} update(s) confirmé(s), aucun message récent à traiter.`);
      return;
    }

    // Jour visé selon le texte ("jeudi", "demain"…) ; sinon aujourd'hui
    const target = parseTargetDay(lastMsg.text || '');
    const offset = target ? target.offset : 0;
    console.log(`📩 Message: "${lastMsg.text}" → ${target ? 'jour J+' + offset : "aujourd'hui"}`);

    // 3. Générer et envoyer les prévisions
    const data = await scrapeAllSpots(SPOTS);
    if (data.filter(s => s.data).length === 0) {
      console.error('Scraping échoué.');
      return;
    }
    let tides = null, air = null, water = null;
    try { tides = await fetchTides(); } catch (e) { console.warn('Marées indispo, repli Windguru:', e.message); }
    try { air = await fetchAirByHour(offset); } catch (e) { console.warn('Air indispo, repli Windguru:', e.message); }
    try { water = await fetchWaterTemp(); } catch (e) { console.warn('Eau indispo, repli climatologie:', e.message); }
    const report = analyzeForecasts(data, tides, air, water, target);
    await sendReport(report);
    console.log('✓ Prévisions envoyées !');
  } catch (e) {
    console.error('ERREUR:', e.message);
    process.exit(1);
  }
})();
