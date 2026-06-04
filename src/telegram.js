const TelegramBot = require('node-telegram-bot-api');

let bot;

function getBot() {
  if (!bot) {
    bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
  }
  return bot;
}

async function sendReport(message) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) throw new Error('TELEGRAM_CHAT_ID manquant dans .env');

  const MAX_LENGTH = 4096;
  const chunks = [];
  let remaining = message;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_LENGTH) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf('\n', MAX_LENGTH);
    if (splitAt === -1) splitAt = MAX_LENGTH;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt + 1);
  }

  for (const chunk of chunks) {
    await getBot().sendMessage(chatId, chunk, { parse_mode: 'Markdown' });
  }

  console.log(`✓ Message envoyé sur Telegram (${chunks.length} partie(s))`);
}

module.exports = { sendReport };
