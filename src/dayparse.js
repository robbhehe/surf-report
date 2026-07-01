// Analyse un message texte pour en extraire un jour cible.
// Renvoie { offset, dateObj, dayNum } pour un jour futur (1-7),
// ou null si le message vise aujourd'hui / ne mentionne pas de jour.

const WEEKDAYS = {
  dimanche: 0, lundi: 1, mardi: 2, mercredi: 3,
  jeudi: 4, vendredi: 5, samedi: 6,
};

function normalize(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // enlève les accents
    .trim();
}

function parseTargetDay(text, now = new Date()) {
  const t = normalize(text);

  let offset = null;

  if (/(apres[-\s]?demain)/.test(t)) {
    offset = 2;
  } else if (/\bdemain\b/.test(t)) {
    offset = 1;
  } else if (/(aujourd|\bauj\b|ce soir|ce matin)/.test(t)) {
    offset = 0;
  } else {
    for (const [name, dow] of Object.entries(WEEKDAYS)) {
      if (t.includes(name)) {
        offset = (dow - now.getDay() + 7) % 7; // prochaine occurrence (0 = aujourd'hui)
        break;
      }
    }
  }

  if (offset == null || offset === 0) return null; // aujourd'hui → rapport normal

  const dateObj = new Date(now.getTime() + offset * 86400000);
  return { offset, dateObj, dayNum: dateObj.getDate() };
}

module.exports = { parseTargetDay };
