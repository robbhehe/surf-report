const puppeteer = require('puppeteer');

async function findSpots(query) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    const url = `https://www.windguru.cz/archive?q=${encodeURIComponent(query)}`;
    console.log(`Recherche "${query}" sur Windguru...`);
    await page.goto('https://www.windguru.cz/', { waitUntil: 'networkidle2', timeout: 30000 });

    // Fermer cookies
    try {
      const cookieBtn = await page.$('.fc-cta-consent');
      if (cookieBtn) await cookieBtn.click();
      await new Promise(r => setTimeout(r, 1000));
    } catch (_) {}

    // Chercher via le champ de recherche
    const searchInput = await page.$('#search_spot, input[name="q"], #wg_search_input');
    if (searchInput) {
      await searchInput.type(query, { delay: 100 });
      await new Promise(r => setTimeout(r, 2000));

      const results = await page.evaluate(() => {
        const items = document.querySelectorAll('.search-result, .wg_search_result, [class*="search"] a');
        return Array.from(items).map(el => ({
          text: el.textContent.trim(),
          href: el.getAttribute('href') || '',
        }));
      });

      if (results.length > 0) {
        console.log('\nRésultats :');
        results.forEach(r => {
          const idMatch = r.href.match(/\/(\d+)/);
          console.log(`  ${r.text} — ID: ${idMatch ? idMatch[1] : '?'} — ${r.href}`);
        });
      } else {
        console.log('Aucun résultat trouvé via la recherche.');
      }
    }

    // Afficher les IDs actuellement configurés
    const { SPOTS } = require('./src/config');
    console.log('\nIDs actuellement configurés :');
    SPOTS.forEach(s => {
      console.log(`  ${s.name}: https://www.windguru.cz/${s.windguruId}`);
    });
    console.log('\nVérifie ces URLs dans ton navigateur pour confirmer que ce sont les bons spots.');
  } finally {
    await browser.close();
  }
}

const query = process.argv[2] || 'Cotentin';
findSpots(query);
