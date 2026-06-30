const { degreesToCardinal, knotsToKmh, isInRisingTide } = require('./scraper');
const { risingWindowsFromTides, formatTides: formatRealTides, coefQuality } = require('./tides');

const SPOT_ORIENTATIONS = {
  'Surtainville': 270,
  'Sciotot': 280,
  'Le Rozel': 285,
  'Siouville': 270,
};

// Température de l'eau estimée par mois (climatologie côte Ouest Cotentin, °C).
// Plus fiable que les modèles marins libres qui déraillent près de la côte.
const WATER_TEMP_BY_MONTH = [9, 8, 8, 10, 12, 15, 16, 17, 17, 15, 13, 10];

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

  // Courants liés au coefficient de marée (marnage énorme du Cotentin, Raz Blanchard).
  // Plus le coef est fort, plus les courants sont violents — aggravé par la houle.
  const coef = slot.coef;
  if (coef != null) {
    if (coef >= 100) danger += 2;
    else if (coef >= 85) danger += 1;
    if (coef >= 90 && wh != null && wh > 1.0) danger += 1; // houle + gros coef = baïnes
  }

  if (danger >= 6) return { level: 'ÉLEVÉ', emoji: '🔴', score: danger };
  if (danger >= 3) return { level: 'MODÉRÉ', emoji: '🟠', score: danger };
  if (danger >= 1) return { level: 'FAIBLE', emoji: '🟡', score: danger };
  return { level: 'OK', emoji: '🟢', score: danger };
}

// Système par composantes pondérées. Total max ~10, atteint UNIQUEMENT si tous
// les curseurs sont au vert (taille idéale + groundswell + offshore léger + bonne marée).
// Une condition "correcte mais pas parfaite" plafonne naturellement autour de 5-7.
function scoreSlot(slot, spotOrientation) {
  const wh = slot.waveHeight;
  const wp = slot.wavePeriod;
  const ws = slot.windSpeed;
  const wd = slot.windDir;

  if (wh == null) return { score: 0 };

  // Flat = inutile, peu importe le reste
  if (wh < 0.3) return { score: 0 };

  // === 1. TAILLE DE HOULE (0 à 3.5) ===
  let sizePts;
  if (wh >= 1.0 && wh <= 1.8) sizePts = 3.5;        // idéal : creux, puissant, gérable
  else if (wh >= 0.8 && wh < 1.0) sizePts = 2.8;    // joli petit
  else if (wh > 1.8 && wh <= 2.2) sizePts = 2.8;    // costaud mais bon
  else if (wh >= 0.5 && wh < 0.8) sizePts = 1.5;    // petit
  else if (wh > 2.2 && wh <= 2.8) sizePts = 1.5;    // gros, engagé
  else if (wh > 2.8 && wh <= 3.3) sizePts = 0.6;    // très gros
  else sizePts = 0.3;                                // énorme/dangereux

  // === 2. PÉRIODE (0 à 2.5) — qualité/puissance de la houle ===
  let periodPts;
  if (wp == null) periodPts = 1.0;
  else if (wp >= 12) periodPts = 2.5;               // vrai groundswell, organisé
  else if (wp >= 10) periodPts = 2.0;
  else if (wp >= 8) periodPts = 1.3;
  else if (wp >= 6) periodPts = 0.6;
  else periodPts = 0;                                // clapot, vagues molles/désordonnées

  // === 3. VENT (−3 à 3) — LE facteur différenciant ===
  // Offshore léger = face lisse et tenue. Onshore = vague hachée/molle.
  let windPts;
  const wt = windType(wd, spotOrientation);
  if (ws == null) {
    windPts = 0.5;
  } else if (ws <= 5) {
    windPts = 2.2;                                   // quasi nul = glassy, très bon
  } else if (wt.label === 'offshore') {
    if (ws <= 10) windPts = 3.0;                     // offshore léger = PARFAIT
    else if (ws <= 18) windPts = 2.0;                // offshore modéré, encore très bon
    else if (ws <= 25) windPts = 0.8;               // offshore fort, ça tient mais ça pince
    else windPts = -0.5;                             // offshore trop fort
  } else if (wt.label === 'side-off') {
    if (ws <= 12) windPts = 1.5;
    else if (ws <= 20) windPts = 0.8;
    else windPts = -0.5;
  } else if (wt.label === 'side') {
    if (ws <= 10) windPts = 0.5;
    else if (ws <= 18) windPts = -0.5;
    else windPts = -1.5;
  } else if (wt.label === 'side-on') {
    if (ws <= 10) windPts = -0.8;                    // side-on même léger = pénalité
    else if (ws <= 18) windPts = -1.8;
    else windPts = -3.0;
  } else { // onshore
    if (ws <= 8) windPts = -1.5;                     // onshore léger = déjà mauvais
    else if (ws <= 15) windPts = -2.5;
    else windPts = -3.0;                             // blown out
  }

  // === 4. MARÉE (0 à 1) ===
  const tidePts = slot.risingTide ? 1.0 : 0.3;

  // === 5. COEFFICIENT (−0.6 à +0.8) — sweet spot 50-70 pour ces beach breaks ===
  let coefPts = 0;
  const coef = slot.coef;
  if (coef != null) {
    if (coef >= 50 && coef <= 70) coefPts = 0.8;        // idéal (bancs actifs, courants gérables)
    else if (coef >= 40 && coef <= 80) coefPts = 0.4;   // bon
    else if (coef > 95) coefPts = -0.6;                  // courants forts + marée trop rapide
    else if (coef > 80) coefPts = -0.2;                  // ça pousse mais ça tire
    else if (coef < 35) coefPts = -0.3;                  // morte-eau, peu de mouvement, bancs mous
  }

  let score = sizePts + periodPts + windPts + tidePts + coefPts;

  // === Malus danger ===
  const d = dangerLevel(slot);
  if (d.score >= 6) score -= 2;
  else if (d.score >= 3) score -= 1;

  // === Plafond selon la taille, MODULÉ par la propreté ===
  // La taille reste la fondation, MAIS une petite houle propre (offshore/glassy,
  // bonne période, marée favorable) peut donner une vraie session fun : on remonte
  // alors le plafond. Une petite houle onshore/désordonnée reste plafonnée bas.
  const clean = windPts >= 2 && (wp == null || wp >= 9); // offshore léger/nul + période correcte
  const glassy = clean && slot.risingTide;               // en prime : marée montante

  let cap = 10;
  if (wh < 0.4) cap = glassy ? 5 : clean ? 4 : 3;
  else if (wh < 0.6) cap = glassy ? 7 : clean ? 6 : 5;
  else if (wh < 0.8) cap = glassy ? 8 : clean ? 7 : 6;
  else if (wh < 1.0) cap = clean ? 9 : 8;
  score = Math.min(score, cap);

  return { score: Math.max(0, Math.min(10, Math.round(score))) };
}

// Une session est "parfaite" (🪟) seulement si TOUS les curseurs sont au vert.
function isPerfectSlot(slot, spotOrientation) {
  const wh = slot.waveHeight, wp = slot.wavePeriod, ws = slot.windSpeed;
  if (wh == null || wp == null || ws == null) return false;
  const wt = windType(slot.windDir, spotOrientation);
  const offshoreOrCalm = ws <= 5 || (wt.label === 'offshore' && ws <= 12);
  return (
    wh >= 1.0 && wh <= 1.9 &&     // taille idéale
    wp >= 11 &&                    // groundswell
    offshoreOrCalm &&              // vent parfait
    slot.risingTide               // bonne marée
  );
}

function findBestWindow(slots, spotOrientation, risingWindows, coef) {
  const daySlots = filterDaySlots(slots);
  if (daySlots.length === 0) return null;

  const scored = daySlots.map(s => {
    const annotated = { ...s, risingTide: isInRisingTide(s.hour, risingWindows), coef: coef ?? null };
    return { ...annotated, score: scoreSlot(annotated, spotOrientation).score };
  });

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

function formatTides(tideTimes) {
  if (!tideTimes || tideTimes.length === 0) return null;
  // tideTimes = heures décimales triées
  // Alterner PM (pleine mer) / BM (basse mer)
  const firstIsLow = tideTimes[0] < 5;
  return tideTimes.map((t, i) => {
    const isHigh = firstIsLow ? (i % 2 === 1) : (i % 2 === 0);
    const h = Math.floor(t);
    const m = Math.round((t - h) * 60);
    return `${isHigh ? 'PM' : 'BM'} ${h}h${String(m).padStart(2, '0')}`;
  }).join(' · ');
}

function analyzeSpotDay(slots, orientation, risingWindows, coef) {
  const daySlots = filterDaySlots(slots);
  if (daySlots.length === 0) return null;

  // Annoter chaque slot avec l'info marée montante + coefficient du jour
  const annotated = daySlots.map(sl => ({
    ...sl,
    risingTide: isInRisingTide(sl.hour, risingWindows),
    coef: coef ?? null,
  }));

  const scored = annotated.map(sl => ({
    ...sl,
    score: scoreSlot(sl, orientation).score,
    wt: windType(sl.windDir, orientation),
    danger: dangerLevel(sl),
  }));

  const avgScore = Math.round(scored.reduce((a, s) => a + s.score, 0) / scored.length);
  const bestWindow = findBestWindow(slots, orientation, risingWindows, coef);

  // Le créneau représentatif = le meilleur DANS la fenêtre recommandée (cohérence
  // entre la note affichée et les données de vague/vent montrées).
  let windowScored = scored;
  if (bestWindow) {
    const inWindow = scored.filter(s => s.hour >= bestWindow.start && s.hour < bestWindow.end);
    if (inWindow.length) windowScored = inWindow;
  }
  const bestSlot = windowScored.reduce((best, sl) => sl.score > best.score ? sl : best, windowScored[0]);
  // Note affichée = score de la meilleure fenêtre (ce que tu obtiens si tu y vas)
  const windowScore = bestWindow ? bestWindow.avgScore : avgScore;

  // Danger max de la journée
  const maxDanger = scored.reduce((worst, sl) => sl.danger.score > worst.score ? sl.danger : worst, scored[0].danger);

  // Conditions parfaites : au moins un créneau coche TOUTES les cases
  const isPerfect = scored.some(sl => isPerfectSlot(sl, orientation));

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

  return { avgScore, windowScore, bestSlot, bestWindow, maxDanger, windowTemp, isPerfect, daySlots: scored };
}

// Évalue, sur une plage horaire donnée, le meilleur spot et ses conditions.
// Utilisé pour comparer les deux marées montantes du jour (matin / soir).
function evalWindowAcrossSpots(scrapedData, wStart, wEnd, coef) {
  let best = null;
  for (const s of scrapedData.filter(x => x.data)) {
    const orient = SPOT_ORIENTATIONS[s.name] || 270;
    const today = s.data.forecasts[0];
    if (!today) continue;
    const slots = today.slots.filter(sl => sl.hour >= wStart && sl.hour < wEnd && isDaylight(sl.hour));
    if (!slots.length) continue;
    const scored = slots.map(sl => {
      const a = { ...sl, risingTide: true, coef: coef ?? null };
      return { ...a, score: scoreSlot(a, orient).score };
    });
    // Meilleur moment de la fenêtre (cohérent avec la note des spots)
    const bestSlot = scored.reduce((b, sl) => (sl.score > b.score ? sl : b), scored[0]);
    if (!best || bestSlot.score > best.score) {
      best = { spotName: s.name, score: bestSlot.score, bestSlot, wt: windType(bestSlot.windDir, orient) };
    }
  }
  return best;
}

// Récupère les marées d'un jour depuis maree.info si dispo, sinon repli sur Windguru.
// `tidesByDay` = Map(jour -> {tides:[{hour,type}], coef}) fournie par tides.fetchTides().
function tidesForDay(forecastDay, tidesByDay) {
  const dayNumMatch = forecastDay.date.match(/(\d+)/);
  const dayNum = dayNumMatch ? parseInt(dayNumMatch[1], 10) : null;
  const entry = tidesByDay && dayNum != null ? tidesByDay.get(dayNum) : null;

  if (entry && entry.tides && entry.tides.length) {
    return {
      risingWindows: risingWindowsFromTides(entry.tides),
      display: formatRealTides(entry.tides),
      coef: entry.coef ?? null,
    };
  }
  // Repli : données Windguru (moins fiables sur PM/BM, pas de coefficient)
  return { risingWindows: forecastDay.risingWindows || [], display: formatTides(forecastDay.tideTimes), coef: null };
}

function analyzeForecasts(scrapedData, tidesByDay, airByHour, waterTempReal) {
  const today = new Date();
  const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  const months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const dateStr = `${dayNames[today.getDay()]} ${today.getDate()} ${months[today.getMonth()]}`;
  // Eau : valeur mesurée du jour (eautemp.com) si dispo, sinon climatologie mensuelle
  const waterTemp = (typeof waterTempReal === 'number') ? waterTempReal : WATER_TEMP_BY_MONTH[today.getMonth()];

  // Analyse de chaque spot pour aujourd'hui
  const spotResults = scrapedData
    .filter(s => s.data)
    .map(s => {
      const orientation = SPOT_ORIENTATIONS[s.name] || 270;
      const todayForecast = s.data.forecasts[0];
      if (!todayForecast) return null;

      const dayTides = tidesForDay(todayForecast, tidesByDay);
      const analysis = analyzeSpotDay(todayForecast.slots, orientation, dayTides.risingWindows, dayTides.coef);
      if (!analysis) return null;

      const { bestSlot, bestWindow, maxDanger, windowTemp, windowScore, isPerfect } = analysis;
      const tideInfo = dayTides.display;
      const wt = windType(bestSlot.windDir, orientation);

      return {
        name: s.name,
        score: windowScore,
        isPerfect,
        waveHeight: bestSlot.waveHeight,
        wavePeriod: bestSlot.wavePeriod,
        waveDir: degreesToCardinal(bestSlot.waveDir),
        windSpeed: knotsToKmh(bestSlot.windSpeed),
        windDir: degreesToCardinal(bestSlot.windDir),
        windType: wt.label,
        bestWindow,
        maxDanger,
        windowTemp,
        tideInfo,
        coef: dayTides.coef,
        allForecasts: s.data.forecasts,
        orientation,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  // Section 1 — Rapport du jour
  const medals = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'];

  // Température de l'air : PIC de la journée (Open-Meteo), sinon repli Windguru
  let bestTemp = spotResults[0]?.windowTemp ?? '?';
  if (Array.isArray(airByHour)) {
    const daytime = airByHour.slice(7, 22).filter(t => t != null); // 7h-21h
    if (daytime.length) bestTemp = Math.max(...daytime);
  }
  const tideDisplay = spotResults[0]?.tideInfo;
  const coef = spotResults[0]?.coef;
  const cq = coefQuality(coef);
  let report = `🏄 Surf Report Cotentin — ${dateStr}\n`;
  report += `🌡️ Air ${bestTemp}°C (pic) | Eau ~${waterTemp}°C\n`;
  if (tideDisplay) report += `🌊 Marées : ${tideDisplay}\n`;
  if (coef != null) report += `📈 Coefficient : ${coef} (${cq.label})\n`;
  report += '\n';

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

  // Comparaison des DEUX marées montantes du jour (matin / soir) — pour choisir
  // son créneau selon ses dispos, sans avoir à deviner comment le vent aura tourné.
  const todaySample = scrapedData.find(s => s.data)?.data.forecasts[0];
  if (todaySample) {
    const todayTides = tidesForDay(todaySample, tidesByDay);
    const dayRising = (todayTides.risingWindows || [])
      .map(w => ({ start: Math.max(Math.round(w.start), DAWN), end: Math.min(Math.round(w.end), DUSK) }))
      .filter(w => w.end - w.start >= 1);

    if (dayRising.length) {
      report += `🌊 Tes fenêtres de marée montante aujourd'hui :\n`;
      for (const w of dayRising) {
        const ev = evalWindowAcrossSpots(scrapedData, w.start, w.end, todayTides.coef);
        if (!ev) continue;
        const icon = w.start < 12 ? '🌅' : w.start < 17 ? '🏖️' : '🌇';
        const periode = w.start < 12 ? 'Matin' : w.start < 17 ? 'Aprèm' : 'Soir';
        const b = ev.bestSlot;
        report += `   ${icon} ${periode} (${w.start}h-${w.end}h) → ${ev.spotName} ${b.waveHeight ?? '?'}m/${b.wavePeriod ?? '?'}s, ${degreesToCardinal(b.windDir)} ${knotsToKmh(b.windSpeed)}km/h (${ev.wt.label}) — ${ev.score}/10\n`;
      }
      report += '\n';
    }
  }

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

  // Alerte courants liée au coefficient (Raz Blanchard, marnage Cotentin)
  if (coef != null && coef >= 90) {
    report += `🌀 Gros coefficient (${coef}) — courants forts et marée rapide. Prudence (Raz Blanchard à proximité), évite la marée basse.\n`;
  } else if (coef != null && coef >= 80) {
    report += `↪️ Coefficient ${coef} — courants marqués, reste vigilant près des bancs.\n`;
  }

  const moment = (w) => {
    if (!w) return "aujourd'hui";
    if (w.start < 12) return 'ce matin';
    if (w.start < 17) return 'cet après-midi';
    return 'ce soir';
  };

  if (best && best.isPerfect) {
    report += `🪟 CONDITIONS PARFAITES sur ${best.name} ${moment(best.bestWindow)} — session rare, fonce !`;
  } else if (best && best.score >= 8) {
    report += `💡 Go ${best.name} ${moment(best.bestWindow)} ! Très belles conditions.`;
  } else if (best && best.score >= 6) {
    report += `💡 ${best.name} ${moment(best.bestWindow)}, conditions correctes${best.bestWindow ? ' (' + best.bestWindow.start + 'h-' + best.bestWindow.end + 'h)' : ''}.`;
  } else if (best && best.score >= 4) {
    report += `💡 ${best.name} est jouable mais sans plus, conditions moyennes.`;
  } else if (best && best.score >= 2) {
    report += `💡 ${best.name} est le moins pire, mais c'est faible. Patiente plutôt.`;
  } else {
    report += `💡 Journée à skipper, rien d'intéressant.`;
  }
  if (worst && worst.score <= 2 && worst.name !== best?.name) {
    report += ` Évite ${worst.name} (${worst.windType}).`;
  }

  // Conseil combi
  if (waterTemp <= 12) report += '\n🧊 Eau froide — combi 5/4 + cagoule + chaussons.';
  else if (waterTemp <= 15) report += '\n🥶 Eau fraîche — combi 4/3 recommandée.';
  else if (waterTemp <= 18) report += '\n👌 Eau correcte — combi 3/2 suffit.';
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

      const dayTides = tidesForDay(matchDay, tidesByDay);
      const analysis = analyzeSpotDay(matchDay.slots, orientation, dayTides.risingWindows, dayTides.coef);
      if (!analysis) return;

      if (analysis.windowScore > bestScoreForDay) {
        bestScoreForDay = analysis.windowScore;
        bestSpotForDay = { name: s.name, score: analysis.windowScore, window: analysis.bestWindow, day: matchDay, danger: analysis.maxDanger, isPerfect: analysis.isPerfect };
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
    } else if (bestSpotForDay.isPerfect) {
      icon = '🪟';
      extra = ' CONDITIONS PARFAITES';
    } else if (maxWave > 2 && maxPeriod > 12) {
      icon = '⭐';
      extra = ` GROSSE HOULE — ${maxWave}m / ${maxPeriod}s`;
    } else if (bestSpotForDay.score >= 8) {
      icon = '🟢';
    } else if (bestSpotForDay.score >= 5) {
      icon = '🟡';
    } else {
      icon = '🔴';
    }

    const windowLabel = bestSpotForDay.window ? bestSpotForDay.window.label : 'aucun créneau';

    // Sous 4/10, aucun spot ne vaut le coup ce jour-là
    if (bestSpotForDay.score < 4 && !extra) {
      report += `${day.date} — 🔴 Aucun spot intéressant\n`;
    } else {
      report += `${day.date} — ${icon} ${bestSpotForDay.name}, ${windowLabel}${extra}\n`;
    }
  });

  report += `\n⚠️ Prévisions à 5-7 jours indicatives, à confirmer la veille.\n`;
  report += `📍 Horaires de marée : maree.info`;

  return report;
}

module.exports = { analyzeForecasts };
