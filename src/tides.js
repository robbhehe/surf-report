// Récupère les vraies marées (PM/BM) depuis maree.info pour Carteret (port 38),
// le port de référence des spots de la côte Ouest du Cotentin.
// maree.info marque les pleines mers en gras (<b>), ce qui les distingue des basses mers.

const PORT_ID = 38; // Carteret

function timeToDecimal(hhmm) {
  const m = hhmm.match(/(\d{2})h(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) + parseInt(m[2], 10) / 60;
}

// Parse le tableau récapitulatif : une ligne par jour.
// Renvoie une Map : numéro du jour (1-31) -> [{ hour, type:'PM'|'BM' }]
async function fetchTides() {
  const res = await fetch(`https://maree.info/${PORT_ID}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SurfReport/1.0)' },
  });
  if (!res.ok) throw new Error(`maree.info HTTP ${res.status}`);
  const html = await res.text();

  const byDay = new Map();
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];

  for (const row of rows) {
    // Une ligne de marée contient des heures HHhMM et des hauteurs (X,XXm)
    if (!/\d{2}h\d{2}/.test(row) || !/\d+,\d+m/.test(row)) continue;

    // Numéro du jour : premier nombre en gras (le jour du mois)
    const dayMatch = row.match(/<b>(\d{1,2})<\/b>/);
    if (!dayMatch) continue;
    const dayNum = parseInt(dayMatch[1], 10);
    if (dayNum < 1 || dayNum > 31) continue;

    // Extraire les créneaux de marée dans l'ordre. Une PM est en gras
    // (<b>10h03</b>), une BM ne l'est pas (16h52).
    const tides = [];
    const re = /<b>(\d{2}h\d{2})<\/b>|(\d{2}h\d{2})/g;
    let m;
    while ((m = re.exec(row)) !== null) {
      const isPM = m[1] != null;
      const hour = timeToDecimal(m[1] || m[2]);
      if (hour != null) tides.push({ hour, type: isPM ? 'PM' : 'BM' });
    }

    if (tides.length) byDay.set(dayNum, tides);
  }

  if (byDay.size === 0) throw new Error('Aucune maree parsee depuis maree.info');
  return byDay;
}

// Fenêtres de marée montante : de chaque BM vers la PM suivante.
function risingWindowsFromTides(tides) {
  if (!tides || tides.length === 0) return [];
  const sorted = [...tides].sort((a, b) => a.hour - b.hour);
  const windows = [];

  // Journée qui commence par une PM : montée venue de la nuit
  if (sorted[0].type === 'PM') {
    windows.push({ start: 0, end: sorted[0].hour });
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].type === 'BM' && sorted[i + 1].type === 'PM') {
      windows.push({ start: sorted[i].hour, end: sorted[i + 1].hour });
    }
  }

  // Journée qui finit par une BM : montée vers la PM du lendemain
  const last = sorted[sorted.length - 1];
  if (last.type === 'BM') {
    windows.push({ start: last.hour, end: 24 });
  }

  return windows;
}

function formatTides(tides) {
  if (!tides || tides.length === 0) return null;
  return [...tides]
    .sort((a, b) => a.hour - b.hour)
    .map(t => {
      const h = Math.floor(t.hour);
      const min = Math.round((t.hour - h) * 60);
      const label = t.type === 'PM' ? 'HM' : 'BM'; // HM = Haute Mer, BM = Basse Mer
      return `${label} ${h}h${String(min).padStart(2, '0')}`;
    })
    .join(' · ');
}

module.exports = { fetchTides, risingWindowsFromTides, formatTides };
