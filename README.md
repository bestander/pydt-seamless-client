# PYDT Super Client

A desktop application for managing PYDT (Play Your Damn Turn) integration with Civilization VI on Steam.

## Features

- Support for multiple PYDT users
- System tray application for easy access
- Automatic turn detection for Civilization VI (Steam version)
- Cross-platform support (macOS and Windows)
- Optional [Civa](https://civa.us) sync: mirror a PYDT game in Civa, add each new turn to it, or create the Civa game from a PYDT game

## Installation

### Quick Install (macOS)

The easiest way to install is using NPX:

```bash
npx pydt-mini-installer
```

This will:
1. Download the latest version
2. Install it to your Applications folder
3. Open the Applications folder
4. Guide you through first-time launch

### Manual Setup

1. Install dependencies:
```bash
npm install
```

2. Start the application:
```bash
npm run dev
```

3. Build for production:
```bash
npm run build
```

## Civa (optional)

Mini-PYDT can follow a PYDT game in [Civa](https://civa.us): every turn you submit is converted to Civa's state format on your computer and added to the game's mirror, and "Create game in Civa" starts a Civa game from a PYDT game.

### Set up the Civa API token

1. Sign in to Civa, open **Your account** and create a token under **API tokens**. Copy it (it is shown once; it looks like `civa_user_…`).
2. In Mini-PYDT choose **Login / Accounts**, paste the token under **Civa (optional)** and press **Save Civa token**.
3. Tick **Sync turns to Civa** in the tray menu.

The token is stored on your computer (electron-store) and sent only to Civa as an `Authorization: Bearer` header; it is never written to the log. If Civa answers 401 (the token was revoked or has expired) the tray icon shows a red `!` and the menu says so; paste a new token to continue. The old "paste your session cookie" login was removed in 1.5.

### Create a game in Civa

Tray menu → **Create game in Civa** → pick a PYDT game that has no Civa mirror yet. A window lists the save's seats (civilization, leader, PYDT player), each pre-matched to a Civa account by name; change a match with the search box, set a seat to **Open** or **AI**, pick the ruleset (the featured `classic` by default) and the mode (a read-only mirror by default, or playable). You must hold one seat. **Create** shows the link to the new Civa game.

### What is converted

The save is read with [civ6-savegame-parser](https://github.com/bestander/civ6-savegame-parser) (credit to its author; pinned at v0.4.0) and turned into a Civa snapshot built against the schema and id vocabulary that Civa serves (`GET /api/mirror-games/schema`; cached per ruleset), then checked with Civa's `inspect` before it is posted. Carried: the map (terrain, features, resources, rivers, lakes), cities (buildings, districts, wonders, territory, worked tiles), roads and improvements, units, researched technologies, gold and the seats. Not carried yet (the sync says so in its warnings): civics, governments and policies, religion, governors, great people, production queues, trade routes, diplomacy and fog of war.

### Testing against a local Civa

Point the app at a local Civa with `CIVA_API_BASE_URL` (for example `CIVA_API_BASE_URL=http://localhost:3000/api npm run dev`; the older `CIVA_API_URL` also works).

```bash
npm test                      # unit tests; the real-save tests use a save from ~/Downloads and skip without one
CIVA_API_BASE_URL=http://localhost:3911/api CIVA_TEST_TOKEN=civa_user_… npm test   # adds the end-to-end test against a local Civa
node scripts/capture-schema.mjs   # refresh test-fixtures/classic-schema.json from a running Civa (needs CIVA_TOKEN)
```

## License

MIT
