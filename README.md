# Surf Report Cotentin

Rapport quotidien bodyboard/surf pour les spots de la côte Ouest du Cotentin :
**Surtainville** · **Sciotot** · **Le Rozel** · **Siouville**

Scraping Windguru + analyse Claude + envoi Telegram à 7h00 chaque matin.

## Installation

```bash
npm install
cp .env.example .env
# Remplir les 3 variables dans .env (voir ci-dessous)
```

## Configuration `.env`

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Clé API Anthropic — [console.anthropic.com](https://console.anthropic.com/) |
| `TELEGRAM_BOT_TOKEN` | Token du bot Telegram (voir section ci-dessous) |
| `TELEGRAM_CHAT_ID` | ID du chat où envoyer le rapport |

### Créer le bot Telegram

1. Ouvrir Telegram et chercher **@BotFather**
2. Envoyer `/newbot`
3. Choisir un nom (ex: "Surf Report Cotentin") puis un username (ex: `cotentin_surf_bot`)
4. BotFather renvoie le **token** → copier dans `.env` comme `TELEGRAM_BOT_TOKEN`

### Récupérer le Chat ID

**Option A — Message direct :**
1. Envoyer n'importe quel message à ton bot
2. Ouvrir dans un navigateur : `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Chercher `"chat":{"id": 123456789}` → c'est ton `TELEGRAM_CHAT_ID`

**Option B — Groupe :**
1. Ajouter le bot dans un groupe
2. Envoyer un message dans le groupe
3. Même URL `getUpdates` → l'ID du groupe est négatif (ex: `-100123456789`)

## Utilisation

### Tester le scraper (sans Claude ni Telegram)

```bash
# Tester un seul spot (Surtainville par défaut)
npm run test-scraper

# Tester un spot spécifique
node test-scraper.js "Le Rozel"
node test-scraper.js Siouville
```

### Vérifier les IDs Windguru

```bash
npm run find-spots
```

Ou vérifier manuellement :
- Surtainville/Hatainville : https://www.windguru.cz/48400
- Sciotot : https://www.windguru.cz/48399
- Le Rozel : https://www.windguru.cz/500902
- Siouville : https://www.windguru.cz/186

### Envoyer un rapport maintenant

```bash
npm run send-now
```

### Lancer le cron (7h00 tous les jours)

```bash
npm start
```

## Structure

```
src/
  config.js     — Spots et configuration
  scraper.js    — Scraping Windguru via Puppeteer
  analyzer.js   — Analyse Claude (claude-sonnet-4-20250514)
  telegram.js   — Envoi Telegram
  index.js      — Point d'entrée + cron
test-scraper.js — Test du scraper en local
find-spots.js   — Recherche d'IDs Windguru
```

## Notes

- Les données de marée ne sont pas scrapées (Windguru ne les fournit pas). Le rapport conseille de vérifier les horaires de marée séparément.
- Les prévisions au-delà de 3-4 jours sont indicatives.
- Un seul navigateur Puppeteer est lancé par spot pour limiter la charge mémoire.
