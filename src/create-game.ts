import { BrowserWindow, ipcMain, Notification, shell } from 'electron';
import * as https from 'https';
import * as zlib from 'zlib';
import { pydtApi, PYDTGame } from './api';
import { CivaAuthError, createGame, gameUrl, lookupMirror, searchPlayers, whoami } from './civa-api';
import { getCivaApiToken } from './civa-account';
import { convertSave, describeProblem, inspectOrThrow } from './civa-sync';
import type { CivaPin, CivaPlayer } from './civa-types';
import { windowHtml } from './create-window-html';
import { defaultPinOf, prematchSeats, toCreateRequest, validateChoice, type CreateChoice, type CreateDraft } from './create-logic';

/** Download the PYDT game's latest save into memory (PYDT serves it gzipped). */
async function downloadLatestSave(pydtToken: string, gameId: string): Promise<Buffer> {
  const { downloadUrl } = await pydtApi.getTurnUrl(pydtToken, gameId);
  return new Promise<Buffer>((resolve, reject) => {
    https.get(downloadUrl, response => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download the save: ${response.statusCode} ${response.statusMessage}`));
        return;
      }
      const chunks: Buffer[] = [];
      response.pipe(zlib.createGunzip())
        .on('data', (c: Buffer) => chunks.push(c))
        .on('end', () => resolve(Buffer.concat(chunks)))
        .on('error', reject);
    }).on('error', reject);
  });
}

let counter = 0;

/**
 * "Create in Civa" for a PYDT game with no civa mirror: download its latest save, convert and inspect it,
 * pre-match the seats, and open the window. Resolves when the window closes. Errors are shown, not thrown.
 */
export async function createInCiva(game: PYDTGame, pydtToken: string, onAuthError: () => void): Promise<void> {
  const token = getCivaApiToken();
  const notify = (title: string, body: string) => new Notification({ title, body: body.slice(0, 400) }).show();
  if (!token) {
    notify('Civa', 'Paste your Civa API token first (Login / Accounts).');
    return;
  }
  try {
    const existing = await lookupMirror(token, game.gameId);
    if (existing.mirrored) {
      notify('Already in Civa', `${game.displayName} is already mirrored; opening it.`);
      if (existing.gameId) shell.openExternal(gameUrl(existing.gameId));
      return;
    }
    const owner = await whoami(token);
    const save = await downloadLatestSave(pydtToken, game.gameId);
    const pin: CivaPin = { featured: 'classic' };
    const built = await convertSave(token, save, game.gameId, pin, game.displayName);
    const inspection = await inspectOrThrow(token, built);
    const seats = await prematchSeats(inspection, built.seats, name => searchPlayers(token, name, 5));
    const draft: CreateDraft = {
      gameName: game.displayName, owner, seats, rulesets: inspection.rulesets, defaultPin: defaultPinOf(inspection.rulesets), warnings: built.warnings,
    };
    await openWindow(game, token, owner, save, draft, onAuthError);
  } catch (error) {
    if (error instanceof CivaAuthError) onAuthError();
    console.error('Create in Civa failed:', describeProblem(error));
    notify('Create in Civa failed', describeProblem(error));
  }
}

function openWindow(game: PYDTGame, token: string, owner: CivaPlayer, save: Buffer, draft: CreateDraft, onAuthError: () => void): Promise<void> {
  const channel = `civa-create-${++counter}`;
  return new Promise(resolve => {
    const win = new BrowserWindow({
      width: 760, height: 640, frame: true, resizable: true,
      webPreferences: { nodeIntegration: true, contextIsolation: false },
    });
    ipcMain.handle(`${channel}:search`, async (_e, q: string) => {
      try { return await searchPlayers(token, String(q), 6); } catch (error) {
        if (error instanceof CivaAuthError) onAuthError();
        return [];
      }
    });
    ipcMain.handle(`${channel}:create`, async (_e, choice: CreateChoice) => {
      const problem = validateChoice(choice, owner);
      if (problem) return { ok: false, error: problem };
      try {
        // The ruleset the user picked decides the ids; rebuild the state under it unless it is the one already built.
        const built = await convertSave(token, save, game.gameId, choice.pin, game.displayName);
        await inspectOrThrow(token, built);
        const created = await createGame(token, toCreateRequest(choice, built.envelope, game.displayName));
        return { ok: true, url: gameUrl(created.gameId) };
      } catch (error) {
        if (error instanceof CivaAuthError) onAuthError();
        return { ok: false, error: describeProblem(error) };
      }
    });
    ipcMain.on(`${channel}:open`, (_e, url: string) => { if (typeof url === 'string' && /^https?:\/\//.test(url)) shell.openExternal(url); });
    win.on('closed', () => {
      ipcMain.removeHandler(`${channel}:search`);
      ipcMain.removeHandler(`${channel}:create`);
      ipcMain.removeAllListeners(`${channel}:open`);
      resolve();
    });
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(windowHtml(draft, channel))}`);
  });
}

