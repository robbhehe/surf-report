const puppeteer = require('puppeteer');

async function scrapeSpot(spotId, spotName) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    const url = `https://www.windguru.cz/${spotId}`;
    console.log(`  Chargement ${spotName} (${url})...`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

    // Fermer la bannière cookies si présente
    try {
      const cookieBtn = await page.$('.fc-cta-consent');
      if (cookieBtn) await cookieBtn.click();
      await new Promise(r => setTimeout(r, 1000));
    } catch (_) {}

    await page.waitForSelector('#tabid_0_0_WINDSPD', { timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));

    const data = await page.evaluate(() => {
      function getTextValues(rowId) {
        const row = document.getElementById(rowId);
        if (!row) return [];
        return Array.from(row.querySelectorAll('td')).map(td => {
          const text = td.textContent.trim();
          const num = parseFloat(text);
          return isNaN(num) ? null : num;
        });
      }

      function getDirectionValues(rowId) {
        const row = document.getElementById(rowId);
        if (!row) return [];
        return Array.from(row.querySelectorAll('td')).map(td => {
          const span = td.querySelector('span[title]');
          if (!span) return null;
          const title = span.getAttribute('title') || '';
          const match = title.match(/\((\d+)°\)/);
          return match ? parseInt(match[1]) : null;
        });
      }

      function parseDates(rowId) {
        const row = document.getElementById(rowId);
        if (!row) return [];
        return Array.from(row.querySelectorAll('td')).map(td => {
          const text = td.textContent.trim();
          // Format: "Je4.08h" → day abbrev + day number + "." + hour + "h"
          const match = text.match(/^([A-Za-zÀ-ÿ]+)(\d+)\.(\d+)h$/);
          if (match) {
            return {
              dayName: match[1],
              dayNum: parseInt(match[2]),
              hour: parseInt(match[3]),
              raw: text,
            };
          }
          return { raw: text, dayName: '', dayNum: 0, hour: 0 };
        });
      }

      const dates = parseDates('tabid_0_0_dates');

      return {
        dates,
        windSpeed: getTextValues('tabid_0_0_WINDSPD'),
        windGust: getTextValues('tabid_0_0_GUST'),
        windDir: getDirectionValues('tabid_0_0_SMER'),
        waveHeight: getTextValues('tabid_0_0_HTSGW'),
        wavePeriod: getTextValues('tabid_0_0_PERPW'),
        waveDir: getDirectionValues('tabid_0_0_DIRPW'),
        temperature: getTextValues('tabid_0_0_TMPE'),
      };
    });

    console.log(`  ✓ ${spotName}: ${data.dates.length} créneaux récupérés`);
    return { spot: spotName, spotId, raw: data, forecasts: buildForecasts(data) };
  } finally {
    await browser.close();
  }
}

function buildForecasts(raw) {
  const { dates, windSpeed, windGust, windDir, waveHeight, wavePeriod, waveDir, temperature } = raw;
  const len = dates.length;

  const byDay = {};
  for (let i = 0; i < len; i++) {
    const d = dates[i];
    const dayKey = `${d.dayName}${d.dayNum}`;
    if (!byDay[dayKey]) byDay[dayKey] = { label: dayKey, slots: [] };
    byDay[dayKey].slots.push({
      hour: d.hour,
      windSpeed: windSpeed[i] ?? null,
      windGust: windGust[i] ?? null,
      windDir: windDir[i] ?? null,
      waveHeight: waveHeight[i] ?? null,
      wavePeriod: wavePeriod[i] ?? null,
      waveDir: waveDir[i] ?? null,
      temperature: temperature[i] ?? null,
    });
  }

  return Object.values(byDay).map(day => ({
    date: day.label,
    slots: day.slots,
    summary: summarizeDay(day.slots),
  }));
}

function degreesToCardinal(deg) {
  if (deg == null) return '?';
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

function knotsToKmh(knots) {
  return Math.round((knots || 0) * 1.852);
}

function summarizeDay(slots) {
  const validWave = slots.filter(s => s.waveHeight != null);
  const validWind = slots.filter(s => s.windSpeed != null);

  return {
    maxWaveHeight: validWave.length ? Math.max(...validWave.map(s => s.waveHeight)) : null,
    avgWaveHeight: validWave.length ? +(validWave.reduce((a, s) => a + s.waveHeight, 0) / validWave.length).toFixed(1) : null,
    maxWavePeriod: validWave.length ? Math.max(...validWave.filter(s => s.wavePeriod != null).map(s => s.wavePeriod)) : null,
    avgWindSpeed: validWind.length ? +(validWind.reduce((a, s) => a + s.windSpeed, 0) / validWind.length).toFixed(0) : null,
    dominantWindDir: validWind.length ? degreesToCardinal(validWind[Math.floor(validWind.length / 2)].windDir) : '?',
  };
}

async function scrapeAllSpots(spots) {
  const results = [];
  for (const spot of spots) {
    try {
      const data = await scrapeSpot(spot.windguruId, spot.name);
      results.push({ ...spot, data });
    } catch (err) {
      console.error(`  ✗ Erreur ${spot.name}:`, err.message);
      results.push({ ...spot, data: null, error: err.message });
    }
  }
  return results;
}

module.exports = { scrapeSpot, scrapeAllSpots, degreesToCardinal, knotsToKmh };
