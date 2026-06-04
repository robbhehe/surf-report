require('dotenv/config');
const { SPOTS } = require('./src/config');
const { scrapeAllSpots } = require('./src/scraper');
const { analyzeForecasts } = require('./src/analyzer');
const { sendReport } = require('./src/telegram');

(async () => {
  try {
    console.log('1. Scraping Windguru...');
    const data = await scrapeAllSpots(SPOTS);
    const valid = data.filter(s => s.data).length;
    console.log(`   ${valid}/${SPOTS.length} spots OK`);

    if (valid === 0) {
      console.error('Aucun spot scrapé. Abandon.');
      process.exit(1);
    }

    console.log('2. Analyse...');
    const report = analyzeForecasts(data);

    console.log('3. Envoi Telegram...');
    await sendReport(report);

    console.log('✓ Rapport envoyé !');
  } catch (e) {
    console.error('ERREUR:', e.message);
    process.exit(1);
  }
})();
