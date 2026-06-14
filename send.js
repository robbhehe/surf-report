require('dotenv/config');
const { SPOTS } = require('./src/config');
const { scrapeAllSpots } = require('./src/scraper');
const { analyzeForecasts } = require('./src/analyzer');
const { sendReport } = require('./src/telegram');

// Heure actuelle à Paris (le runner GitHub est en UTC)
function parisHour() {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    hour: 'numeric',
    hour12: false,
  });
  return parseInt(fmt.format(new Date()), 10);
}

// Garde-fou : sur un déclenchement automatique (cron), n'envoyer que le matin.
// Les déclenchements manuels (workflow_dispatch ou lancement local) passent toujours.
const isScheduled = process.env.GITHUB_EVENT_NAME === 'schedule';
if (isScheduled) {
  const h = parisHour();
  if (h < 6 || h >= 10) {
    console.log(`⏭️  Déclenchement à ${h}h Paris — hors de la fenêtre 6h-10h. Envoi annulé (anti-spam).`);
    process.exit(0);
  }
  console.log(`✓ Déclenchement à ${h}h Paris — dans la fenêtre matinale, on continue.`);
}

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
