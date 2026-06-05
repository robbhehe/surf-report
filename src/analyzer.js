const { degreesToCardinal, knotsToKmh } = require('./scraper');

const SPOT_ORIENTATIONS = {
  'Surtainville': 270,
  'Sciotot': 280,
  'Le Rozel': 285,
  'Siouville': 270,
};

// Température de l'eau estimée par mois (Cotentin ouest, °C)
const WATER_TEMP_BY_MONTH = [9, 9, 9, 10, 12, 14, 16, 17, 17, 15, 13, 11];

const DAWN = 7;
const DUSK = 21;

function isDaylight(hour) {
  return hour >= DAWN && hour < DUSK;
}

function filterDaySlots(slots) {
  return slots.filter(s => isDaylight(s.hour));
}

function windType(windDirDeg, spotOrientation) {
  if (windDirDeg == null) return { label: 'inconnu', score: 0 };
  const offshoreDir = (spotOrientation + 180) % 360;
  const diff = Math.abs(((windDirDeg - offshoreDir + 540) % 360) - 180);
  if (diff <= 30) return { label: 'offshore', score: 3 };
  if (diff <= 60) return { label: 'side-off', score: 2 };
  if (diff >= 150) return { label: 'onshore', score: -2 };
  if (diff >= 120) return { label: 'side-on', score: -1 };
  return { label: 'side', score: 0 };
}

function dangerLevel(slot) {
  let danger = 0;
  const wh = slot.waveHeight;
  const wp = slot.wavePeriod;
  const ws = slot.windSpeed;
  const wg = slot.windGust;

  // Grosses vagues
  if (wh != null) {
    if (wh > 3.0) danger += 3;
    else if (wh > 2.5) danger += 2;
    else if (wh > 2.0) danger += 1;
  }

  // Shore break : grosses vagues + courte période = dangereux
  if (wh != null && wp != null && wh > 1.5 && wp < 7) danger += 2;

  // Courants de baïne : grosse houle + vent fort = forts courants
  if (wh != null && ws != null && wh > 1.5 && ws > 20) danger += 2;
  if (wh != null && ws != null && wh > 2.0 && ws > 15) danger += 1;

  // Rafales violentes
  if (wg != null && wg > 40) danger += 2;
  else if (wg != null && wg > 30) danger += 1;

  // Vent très fort
  if (ws != null && ws > 30) danger += 1;

  if (danger >= 6) return { level: 'ÉLEVÉ', emoji: '🔴', score: danger };
  if (danger >= 3) return { level: 'MODÉRÉ', emoji: '🟠', score: danger };
  if (danger >= 1) return { level: 'FAIBLE', emoji: '🟡', score: danger };
  return { level: 'OK', emoji: '🟢', score: danger };
}

function scoreSlot(slot, spotOrientation) {
  let score = 5;
  const wh = slot.waveHeight;
  const wp = slot.wavePeriod;
  const ws = slot.windSpeed;
  const wd = slot.windDir;
  const hour = slot.hour;

  // === HOULE (facteur principal) ===
  if (wh == null) return { score: 0 };
  if (wh >= 0.8 && wh <= 2.0) score += 3;       // idéal bodyboard
  else if (wh >= 0.5 && wh < 0.8) score += 1;    // petit mais surfable
  else if (wh > 2.0 && wh <= 2.5) score += 2;    // costaud mais jouable
  else if (wh < 0.3) score -= 4;                  // flat, pas la peine
  else if (wh > 3.0) score -= 1;                  // gros, dangereux

  // Période
  if (wp != null) {
    if (wp >= 10) score += 2;
    else if (wp >= 8) score += 1;
    else if (wp < 6) score -= 2;                  // clapot, mauvaise qualité
  }

  // === VENT ===
  if (ws != null) {
    const wt = windType(wd, spotOrientation);
    if (ws <= 8) {
      // Vent faible — bonus seulement si il y a de la houle
      if (wh >= 0.6) score += 2;
      else score += 0;
    } else if (wt.label === 'offshore' && ws <= 25) score += 2;
    else if (wt.label === 'side-off' && ws <= 20) score += 1;
    else if (wt.label === 'onshore') score -= 3;
    else if (wt.label === 'side-on' && ws > 15) score -= 2;
    else if (wt.label === 'side-on') score -= 1;
    if (ws > 30) score -= 2;
  }

  // === BONUS HORAIRE — matin = meilleur créneau surf ===
  if (hour != null) {
    if (hour >= 7 && hour <= 11) score += 1;       // bonus matin
    else if (hour >= 19) score -= 1;               // malus soirée (lumière, fatigue)
  }

  // Malus danger
  const d = dangerLevel(slot);
  if (d.score >= 6) score -= 2;
  else if (d.score >= 3) score -= 1;

  return { score: Math.max(0, Math.min(10, score)) };
}

function findBestWindow(slots, spotOrientation) {
  const daySlots = filterDaySlots(slots);
  if (daySlots.length === 0) return null;

  const scored = daySlots.map(s => ({
    ...s,
    score: scoreSlot(s, spotOrientation).score,
  }));

  let bestStart = 0, bestEnd = 0, bestAvg = 0;
  for (let i = 0; i < scored.length; i++) {
    let sum = 0;
    for (let j = i; j < scored.length; j++) {
      sum += scored[j].score;
      const count = j - i + 1;
      const avg = sum / count;
      if (avg > bestAvg && count >= 1) {
        bestAvg = avg;
        bestStart = i;
        bestEnd = j;
      }
    }
  }

  const windowSlots = scored.slice(bestStart, bestEnd + 1);
  const startHour = windowSlots[0].hour;
  const endHour = windowSlots[windowSlots.length - 1].hour;
  const interval = daySlots.length > 1 ? daySlots[1].hour - daySlots[0].hour : 2;
  const endDisplay = Math.min(endHour + interval, DUSK);

  return {
    start: startHour,
    end: endDisplay,
    avgScore: Math.round(bestAvg),
    label: formatWindow(startHour, endDisplay),
  };
}

function formatWindow(start, end) {
  const period = start < 12 ? 'matin' : start < 17 ? 'après-midi' : 'soirée';
  return `${start}h-${end}h (${period})`;
}

function analyzeSpotDay(slots, orientation) {
  const daySlots = filterDaySlots(slots);
  if (daySlots.length === 0) return null;

  const scored = daySlots.map(sl => ({
    ...sl,
    score: scoreSlot(sl, orientation).score,
    wt: windType(sl.windDir, orientation),
    danger: dangerLevel(sl),
  }));

  const avgScore = Math.round(scored.reduce((a, s) => a + s.score, 0) / scored.length);
  const bestSlot = scored.reduce((best, sl) => sl.score > best.score ? sl : best, scored[0]);
  const bestWindow = findBestWindow(slots, orientation);

  // Danger max de la journée
  const maxDanger = scored.reduce((worst, sl) => sl.danger.score > worst.score ? sl.danger : worst, scored[0].danger);

  // Température pendant la meilleure fenêtre
  let windowTemp = null;
  if (bestWindow) {
    const windowSlots = daySlots.filter(s => s.hour >= bestWindow.start && s.hour < bestWindow.end && s.temperature != null);
    if (windowSlots.length) {
      windowTemp = Math.round(windowSlots.reduce((a, s) => a + s.temperature, 0) / windowSlots.length);
    }
  }
  if (windowTemp == null) {
    // Fallback : température du meilleur créneau
    windowTemp = bestSlot.temperature ?? null;
  }

  return { avgScore, bestSlot, bestWindow, maxDanger, windowTemp, daySlots: scored };
}

function analyzeForecasts(scrapedData) {
  const today = new Date();
  const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const dateStr = `${dayNames[today.getDay()]} ${today.getDate()} ${months[today.getMonth()]}`;
  const waterTemp = WATER_TEMP_BY_MONTH[today.getMonth()];

  // Analyse de chaque spot pour aujourd'hui
  const spotResults = scrapedData
    .filter(s => s.data)
    .map(s => {
      const orientation = SPOT_ORIENTATIONS[s.name] || 270;
      const todayForecast = s.data.forecasts[0];
      if (!todayForecast) return null;

      const analysis = analyzeSpotDay(todayForecast.slots, orientation);
      if (!analysis) return null;

      const { bestSlot, bestWindow, maxDanger, windowTemp } = analysis;
      const wt = windType(bestSlot.windDir, orientation);

      return {
        name: s.name,
        score: analysis.avgScore,
        waveHeight: bestSlot.waveHeight,
        wavePeriod: bestSlot.wavePeriod,
        waveDir: degreesToCardinal(bestSlot.waveDir),
        windSpeed: knotsToKmh(bestSlot.windSpeed),
        windDir: degreesToCardinal(bestSlot.windDir),
        windType: wt.label,
        bestWindow,
        maxDanger,
        windowTemp,
        allForecasts: s.data.forecasts,
        orientation,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  // Section 1 — Rapport du jour
  const medals = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'];
  const bestTemp = spotResults[0]?.windowTemp ?? '?';
  let report = `🏄 Surf Report Cotentin — ${dateStr}\n`;
  report += `🌡️ Air ${bestTemp}°C | Eau ~${waterTemp}°C\n\n`;

  spotResults.forEach((spot, i) => {
    report += `${medals[i]} ${spot.name} — ${spot.score}/10\n`;
    report += `   🌊 ${spot.waveHeight ?? '?'}m / ${spot.wavePeriod ?? '?'}s / ${spot.waveDir}\n`;
    report += `   💨 ${spot.windDir} ${spot.windSpeed} km/h (${spot.windType})\n`;
    report += `   ${spot.maxDanger.emoji} Danger : ${spot.maxDanger.level}`;
    if (spot.maxDanger.score >= 3) {
      const reasons = [];
      if (spot.waveHeight > 2.0) reasons.push('grosse houle');
      if (spot.windSpeed > 55) reasons.push('vent fort');
      if (spot.waveHeight > 1.5 && spot.wavePeriod < 7) reasons.push('shore break');
      if (reasons.length) report += ` (${reasons.join(', ')})`;
    }
    report += '\n';
    if (spot.bestWindow) {
      report += `   ⏰ Meilleure fenêtre : ${spot.bestWindow.label}\n`;
    } else {
      report += `   ⏰ Aucun créneau exploitable en journée\n`;
    }
    report += '\n';
  });

  // Conseil
  const best = spotResults[0];
  const worst = spotResults[spotResults.length - 1];

  // Alerte danger global
  const dangerousSpots = spotResults.filter(s => s.maxDanger.score >= 6);
  if (dangerousSpots.length === spotResults.length) {
    report += `⚠️ DANGER — Conditions dangereuses sur tous les spots. Courants forts et grosse houle, à éviter.\n`;
  } else if (dangerousSpots.length > 0) {
    report += `⚠️ Danger élevé sur ${dangerousSpots.map(s => s.name).join(', ')}. Courants forts, à éviter.\n`;
  }

  if (best && best.score >= 7) {
    const period = best.bestWindow && best.bestWindow.start < 12 ? 'ce matin' : 'cet après-midi';
    report += `💡 Go ${best.name} ${period} ! Belles conditions.`;
  } else if (best && best.score >= 5) {
    report += `💡 ${best.name} est jouable${best.bestWindow ? ' vers ' + best.bestWindow.start + 'h-' + best.bestWindow.end + 'h' : ''}.`;
  } else if (best && best.score >= 3) {
    report += `💡 ${best.name} est le moins pire aujourd'hui, conditions moyennes.`;
  } else {
    report += `💡 Journée à skipper, conditions mauvaises partout.`;
  }
  if (worst && worst.score <= 3 && worst.name !== best?.name) {
    report += ` Évite ${worst.name} (${worst.windType}).`;
  }

  // Conseil combi
  if (waterTemp <= 12) report += '\n🧊 Eau froide — combi 5/4 + cagoule + chaussons.';
  else if (waterTemp <= 15) report += '\n🥶 Eau fraîche — combi 4/3 recommandée.';
  else if (waterTemp <= 17) report += '\n👌 Eau correcte — combi 3/2 suffit.';
  else report += '\n☀️ Eau agréable — shorty ou combi 2/2.';

  report += '\n';

  // Section 2 — Aperçu semaine
  report += `\n📅 La semaine à venir :\n\n`;

  const allDayKeys = spotResults[0]?.allForecasts?.slice(1, 8) || [];

  allDayKeys.forEach(day => {
    let bestSpotForDay = null;
    let bestScoreForDay = -1;
    let dayMaxDanger = { score: 0, level: 'OK', emoji: '🟢' };

    scrapedData.filter(s => s.data).forEach(s => {
      const orientation = SPOT_ORIENTATIONS[s.name] || 270;
      const matchDay = s.data.forecasts.find(f => f.date === day.date);
      if (!matchDay) return;

      const analysis = analyzeSpotDay(matchDay.slots, orientation);
      if (!analysis) return;

      if (analysis.avgScore > bestScoreForDay) {
        bestScoreForDay = analysis.avgScore;
        bestSpotForDay = { name: s.name, score: analysis.avgScore, window: analysis.bestWindow, day: matchDay, danger: analysis.maxDanger };
      }
      if (analysis.maxDanger.score > dayMaxDanger.score) {
        dayMaxDanger = analysis.maxDanger;
      }
    });

    if (!bestSpotForDay) return;

    const d = bestSpotForDay.day;
    const daySlots = filterDaySlots(d.slots);
    const maxWave = Math.max(...daySlots.filter(s => s.waveHeight != null).map(s => s.waveHeight), 0);
    const maxPeriod = Math.max(...daySlots.filter(s => s.wavePeriod != null).map(s => s.wavePeriod), 0);
    const maxWind = Math.max(...daySlots.filter(s => s.windSpeed != null).map(s => s.windSpeed), 0);

    let icon, extra = '';
    if (dayMaxDanger.score >= 6) {
      icon = '🌀';
      extra = ' DANGER — mer forte, courants, à éviter';
    } else if (maxWave > 3.5 && maxWind > 30) {
      icon = '🌀';
      extra = ' TEMPÊTE — à éviter';
    } else if (maxWave > 2 && maxPeriod > 12) {
      icon = '⭐';
      extra = ` GROSSE HOULE — ${maxWave}m / ${maxPeriod}s`;
    } else if (bestSpotForDay.score >= 7) {
      icon = '🟢';
    } else if (bestSpotForDay.score >= 4) {
      icon = '🟡';
    } else {
      icon = '🔴';
    }

    const windowLabel = bestSpotForDay.window ? bestSpotForDay.window.label : 'aucun créneau';

    if (bestSpotForDay.score <= 2 && !extra) {
      report += `${day.date} — ${icon} Aucun spot — conditions défavorables\n`;
    } else {
      report += `${day.date} — ${icon} ${bestSpotForDay.name}, ${windowLabel}${extra}\n`;
    }
  });

  report += `\n⚠️ Prévisions à 5-7 jours indicatives, à confirmer la veille.\n`;
  report += `📍 Horaires de marée : maree.info`;

  return report;
}

module.exports = { analyzeForecasts };
