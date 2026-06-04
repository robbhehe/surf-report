const { SPOTS } = require('./src/config');
const { scrapeSpot, degreesToCardinal, knotsToKmh } = require('./src/scraper');

async function main() {
  const spotArg = process.argv[2];
  const spotsToTest = spotArg
    ? SPOTS.filter(s => s.name.toLowerCase().includes(spotArg.toLowerCase()))
    : [SPOTS[0]];

  if (spotsToTest.length === 0) {
    console.log(`Spot "${spotArg}" non trouvé. Disponibles : ${SPOTS.map(s => s.name).join(', ')}`);
    process.exit(1);
  }

  for (const spot of spotsToTest) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`TEST SCRAPER — ${spot.name} (Windguru #${spot.windguruId})`);
    console.log('='.repeat(60));

    try {
      const result = await scrapeSpot(spot.windguruId, spot.name);

      console.log(`\nDonnées brutes — ${result.raw.dates.length} créneaux`);
      console.log(`Jours couverts : ${result.forecasts.map(f => f.date).join(', ')}`);

      console.log('\n--- Prévisions par jour ---');
      for (const day of result.forecasts.slice(0, 5)) {
        const s = day.summary;
        console.log(`\n📅 ${day.date}`);
        console.log(`   Résumé: houle max ${s.maxWaveHeight}m, période max ${s.maxWavePeriod}s, vent moy ${s.avgWindSpeed}kts ${s.dominantWindDir}`);

        for (const slot of day.slots) {
          const windCard = degreesToCardinal(slot.windDir);
          const waveCard = degreesToCardinal(slot.waveDir);
          const windKmh = knotsToKmh(slot.windSpeed);
          console.log(
            `   ${String(slot.hour).padStart(2, '0')}h | vent: ${String(slot.windSpeed ?? '-').padStart(3)}kts (${String(windKmh).padStart(3)} km/h) ${windCard.padEnd(3)} ${slot.windDir != null ? slot.windDir + '°' : ''} | houle: ${slot.waveHeight ?? '-'}m / ${slot.wavePeriod ?? '-'}s ${waveCard} ${slot.waveDir != null ? slot.waveDir + '°' : ''}`
          );
        }
      }

      console.log('\n✓ Scraping OK');
    } catch (err) {
      console.error(`\n✗ ERREUR: ${err.message}`);
      console.error(err.stack);
    }
  }
}

main().then(() => process.exit(0));
