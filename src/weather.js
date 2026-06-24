// Température de l'air réelle depuis Open-Meteo (modèle météo précis au point GPS).
// Le point Windguru sous-estimait souvent la température à terre.
// Coordonnées centrales de la côte Ouest du Cotentin (Le Rozel).
const LAT = 49.48;
const LON = -1.83;

// Renvoie un tableau de 24 températures (index = heure locale) pour aujourd'hui,
// ou null en cas d'échec (l'appelant fait alors un repli).
async function fetchTodayAirByHour() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
    `&hourly=temperature_2m&timezone=Europe%2FParis&forecast_days=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`open-meteo HTTP ${res.status}`);
  const j = await res.json();
  const temps = j.hourly && j.hourly.temperature_2m;
  if (!Array.isArray(temps) || temps.length < 24) throw new Error('open-meteo: données air manquantes');
  return temps.slice(0, 24).map(t => (t == null ? null : Math.round(t)));
}

module.exports = { fetchTodayAirByHour };
