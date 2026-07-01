// Température de l'air réelle depuis Open-Meteo (modèle météo précis au point GPS).
// Le point Windguru sous-estimait souvent la température à terre.
// Coordonnées centrales de la côte Ouest du Cotentin (Le Rozel).
const LAT = 49.48;
const LON = -1.83;

// Renvoie un tableau de 24 températures (index = heure locale) pour le jour visé.
// dayOffset = 0 (aujourd'hui), 1 (demain), ... Null en cas d'échec (repli).
async function fetchAirByHour(dayOffset = 0) {
  const days = Math.max(1, dayOffset + 1);
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
    `&hourly=temperature_2m&timezone=Europe%2FParis&forecast_days=${days}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`open-meteo HTTP ${res.status}`);
  const j = await res.json();
  const temps = j.hourly && j.hourly.temperature_2m;
  if (!Array.isArray(temps)) throw new Error('open-meteo: données air manquantes');
  const start = dayOffset * 24;
  const slice = temps.slice(start, start + 24);
  if (slice.length < 24) throw new Error('open-meteo: jour visé indisponible');
  return slice.map(t => (t == null ? null : Math.round(t)));
}

// Rétro-compat : aujourd'hui
async function fetchTodayAirByHour() {
  return fetchAirByHour(0);
}

// Température de l'eau MESURÉE du jour à Barneville-Carteret (point côtier),
// depuis eautemp.com. Renvoie un entier °C, ou null en cas d'échec (repli climatologie).
async function fetchWaterTemp() {
  const url = 'https://eautemp.com/current/france/barneville-plage-basse-normandie-france';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'fr-FR,fr;q=0.9',
    },
  });
  if (!res.ok) throw new Error(`eautemp HTTP ${res.status}`);
  const html = await res.text();

  // La valeur du jour suit la phrase "… est aujourd'hui XX°C"
  const idx = html.indexOf("est aujourd");
  if (idx === -1) throw new Error('eautemp: marqueur introuvable');
  const after = html.slice(idx, idx + 300)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&deg;|&#176;/gi, '°');
  const m = after.match(/(\d{1,2})(?:[.,]\d)?\s*°\s*C/);
  if (!m) throw new Error('eautemp: température introuvable');
  return parseInt(m[1], 10);
}

module.exports = { fetchTodayAirByHour, fetchAirByHour, fetchWaterTemp };
