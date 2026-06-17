// Vérifie les messages Telegram reçus depuis le dernier passage.
// Si un message récent vient de toi → génère et envoie les prévisions.
// Lancé toutes les ~5 min par GitHub Actions (responder.yml).
require('dotenv/config');
const { SPOTS } = require('./src/config');
const { scrapeAllSpots } = require('./src/scraper');
const { analyzeForecasts } = require('./src/analyzer');
const { sendReport } = require('./src/telegram');
const { fetchTides } = require('./src/tides');

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

    // Y a-t-il un message récent venant de toi ?
    const hasFreshMessage = updates.some(u => {
      const msg = u.message;
      if (!msg) return false;
      if (String(msg.chat.id) !== ALLOWED_CHAT) return false;
      return (now - msg.date) <= MAX_AGE_SECONDS;
    });

    // 2. Confirmer TOUS les updates pour ne pas les retraiter au prochain passage
    await tg('getUpdates', { offset: String(maxUpdateId + 1), timeout: '0' });

    if (!hasFreshMessage) {
      console.log(`${updates.length} update(s) confirmé(s), aucun message récent à traiter.`);
      return;
    }

    // 3. Générer et envoyer les prévisions
    console.log('📩 Message récent détecté → génération des prévisions...');
    const data = await scrapeAllSpots(SPOTS);
    if (data.filter(s => s.data).length === 0) {
      console.error('Scraping échoué.');
      return;
    }
    let tides = null;
    try { tides = await fetchTides(); } catch (e) { console.warn('Marées indispo, repli Windguru:', e.message); }
    const report = analyzeForecasts(data, tides);
    await sendReport(report);
    console.log('✓ Prévisions envoyées !');
  } catch (e) {
    console.error('ERREUR:', e.message);
    process.exit(1);
  }
})();
