require('dotenv/config');
const cron = require('node-cron');
const { SPOTS } = require('./config');
const { scrapeAllSpots } = require('./scraper');
const { analyzeForecasts } = require('./analyzer');
const { sendReport } = require('./telegram');

async function generateAndSendReport() {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Surf Report — ${new Date().toLocaleString('fr-FR')}`);
  console.log('='.repeat(50));

  try {
    console.log('\n1. Scraping Windguru...');
    const scrapedData = await scrapeAllSpots(SPOTS);

    const validSpots = scrapedData.filter(s => s.data);
    if (validSpots.length === 0) {
      console.error('Aucun spot n\'a pu être scrapé. Abandon.');
      return;
    }
    console.log(`   ${validSpots.length}/${SPOTS.length} spots récupérés`);

    console.log('\n2. Analyse Claude...');
    const report = await analyzeForecasts(scrapedData);
    console.log('   ✓ Rapport généré');

    console.log('\n3. Envoi Telegram...');
    await sendReport(report);

    console.log('\n✓ Terminé !');
  } catch (err) {
    console.error('Erreur:', err.message);
  }
}

// Cron : tous les jours à 7h00
cron.schedule('0 7 * * *', () => {
  console.log('Déclenchement du cron à 7h00...');
  generateAndSendReport();
}, { timezone: 'Europe/Paris' });

console.log('Surf Report Cotentin — Cron actif (7h00 tous les jours)');
console.log('Pour envoyer maintenant : npm run send-now');

module.exports = { sendReport: generateAndSendReport };
