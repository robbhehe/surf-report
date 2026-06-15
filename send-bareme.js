require('dotenv/config');
const { sendReport } = require('./src/telegram');

const bareme = [
  '📊 BARÈME DE NOTATION — Surf Report Cotentin',
  '',
  'La note /10 = somme de 4 composantes. Un 10 = tous les curseurs au vert, c\'est rare.',
  '',
  '🌊 TAILLE DE HOULE (max 3.5)',
  '   1.0–1.8m → 3.5 (idéal : creux, puissant, gérable)',
  '   0.8–1.0m ou 1.8–2.2m → 2.8',
  '   0.5–0.8m ou 2.2–2.8m → 1.5',
  '   2.8–3.3m → 0.6  |  >3.3m → 0.3  |  <0.3m → 0 (flat)',
  '',
  '⏱️ PÉRIODE (max 2.5) — qualité/puissance',
  '   ≥12s → 2.5 (vrai groundswell)',
  '   10–12s → 2.0  |  8–10s → 1.3',
  '   6–8s → 0.6  |  <6s → 0 (clapot)',
  '',
  '💨 VENT (−3 à +3) — LE facteur clé',
  '   Offshore <10kt ou nul → +3 (face lisse, PARFAIT)',
  '   Offshore 10–18kt → +2',
  '   Side-off léger → +1.5',
  '   Side-on léger → −0.8',
  '   Onshore léger → −1.5',
  '   Onshore fort → −3 (blown out)',
  '   ⚠️ Vent offshore non négociable pour un 10.',
  '',
  '🌊 MARÉE (max 1)',
  '   Marée montante → +1  |  sinon → +0.3',
  '',
  '🚫 PLAFOND SELON LA TAILLE',
  '   <0.5m → note max 4',
  '   <0.8m → note max 6',
  '   <1.0m → note max 8',
  '   (sans vagues, pas de bonne session, même tout propre)',
  '',
  '⚠️ MALUS DANGER : −1 à −2 selon courants / shore break.',
  '',
  '🎯 LECTURE RAPIDE',
  '   8–10  🟢 Très belles conditions, fonce',
  '   5–7   🟡 Correct à jouable',
  '   <4    🔴 Pas intéressant',
  '   🪟 conditions parfaites (taille idéale + ≥11s + offshore + marée montante)',
].join('\n');

sendReport(bareme)
  .then(() => console.log('✓ Barème envoyé !'))
  .catch(e => { console.error('Erreur:', e.message); process.exit(1); });
