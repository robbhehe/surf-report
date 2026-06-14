require('dotenv/config');
const TelegramBot = require('node-telegram-bot-api');
const { SPOTS } = require('./src/config');
const { scrapeAllSpots } = require('./src/scraper');
const { analyzeForecasts } = require('./src/analyzer');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const ALLOWED_CHAT = String(process.env.TELEGRAM_CHAT_ID);

const MAX_LENGTH = 4096;

async function sendLong(chatId, message) {
  let remaining = message;
  while (remaining.length > 0) {
    let chunk;
    if (remaining.length <= MAX_LENGTH) {
      chunk = remaining;
      remaining = '';
    } else {
      let splitAt = remaining.lastIndexOf('\n', MAX_LENGTH);
      if (splitAt === -1) splitAt = MAX_LENGTH;
      chunk = remaining.slice(0, splitAt);
      remaining = remaining.slice(splitAt + 1);
    }
    await bot.sendMessage(chatId, chunk, { parse_mode: 'Markdown' });
  }
}

let busy = false;

async function generateAndReply(chatId) {
  if (busy) {
    await bot.sendMessage(chatId, '⏳ Un rapport est déjà en cours de génération, patiente...');
    return;
  }
  busy = true;
  try {
    await bot.sendMessage(chatId, '🌊 Je récupère les prévisions, ça prend ~30s...');
    const data = await scrapeAllSpots(SPOTS);
    const valid = data.filter(s => s.data).length;
    if (valid === 0) {
      await bot.sendMessage(chatId, '❌ Impossible de récupérer les données Windguru, réessaie plus tard.');
      return;
    }
    const report = analyzeForecasts(data);
    await sendLong(chatId, report);
    console.log(`✓ Rapport envoyé à ${chatId} (${new Date().toLocaleTimeString('fr-FR')})`);
  } catch (e) {
    console.error('Erreur:', e.message);
    await bot.sendMessage(chatId, '❌ Erreur lors de la génération du rapport.');
  } finally {
    busy = false;
  }
}

// Répondre à n'importe quel message
bot.on('message', (msg) => {
  const chatId = String(msg.chat.id);
  // Sécurité : ne répondre qu'à ton propre chat
  if (chatId !== ALLOWED_CHAT) {
    console.log(`Message ignoré d'un chat non autorisé : ${chatId}`);
    return;
  }
  console.log(`📩 Message reçu : "${msg.text || '(non-texte)'}" → génération du rapport`);
  generateAndReply(msg.chat.id);
});

bot.on('polling_error', (err) => {
  console.error('Erreur polling:', err.message);
});

console.log('🤖 Listener actif — envoie n\'importe quel message à ton bot pour recevoir le surf report.');
console.log('   (Garde cette fenêtre ouverte. Ctrl+C pour arrêter.)');
