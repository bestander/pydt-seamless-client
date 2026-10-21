import * as fs from 'fs';
import * as path from 'path';
import { CivaApiError, CivaAuthError, fetchPinnedSchema, inspectEnvelope, lookupMirror, postTurn, whoami } from './civa-api';
import type { CivaPin, Inspection, MirrorLookup } from './civa-types';
import { buildEnvelope, parseSave, pydtGameIdFromFileName, validateEnvelope, type BuildResult } from './importer';

/** A failure worth showing the user: the red badge, a notification and a menu line. */
export class CivaSyncError extends Error {}

export type SyncOutcome =
  | { kind: 'not-mirrored' }
  | { kind: 'uploaded'; gameId: string; turn: number };

/** The ruleset pin a mirrored game runs under, read off its view. */
export function pinOfMirror(view: { ruleset?: { hash?: string; builtin?: string } }): CivaPin | undefined {
  if (view.ruleset?.hash) return { hash: view.ruleset.hash };
  if (view.ruleset?.builtin === 'blitz' || view.ruleset?.builtin === 'epic') return { builtin: view.ruleset.builtin };
  return undefined;
}

/** Say what is wrong in words: inspect's issues (with JSON paths), or the server's message. */
export function describeProblem(error: unknown): string {
  if (error instanceof CivaAuthError) return error.message;
  if (error instanceof CivaApiError) return error.describe();
  return error instanceof Error ? error.message : String(error);
}

/**
 * Convert a save, check it with civa's `inspect`, and add it to the PYDT game's mirror.
 *
 * A game that is not mirrored is not an error here (`not-mirrored`): creating it is the user's choice, from
 * the "Create in Civa" action. Any other failure throws; a revoked token throws CivaAuthError.
 */
export async function syncTurnToCiva(token: string, pydtGameId: string, saveBuffer: Buffer, gameName?: string, replace = false): Promise<SyncOutcome> {
  const lookup = await civaMirrorView(token, pydtGameId);
  if (!lookup) return { kind: 'not-mirrored' };
  const pin = pinOfMirror(lookup.view);
  if (!pin) throw new CivaSyncError('Civa did not say which ruleset this game runs under.');
  const built = await convertSave(token, saveBuffer, pydtGameId, pin, gameName);
  const inspection = await inspectOrThrow(token, built);
  if (!inspection.rulesets.some(r => r.ok)) {
    throw new CivaSyncError(`Civa cannot load this turn under any ruleset: ${inspection.rulesets.map(r => `${r.label}: ${r.error ?? 'no'}`).join('; ')}`);
  }
  const posted = await postTurn(token, pydtGameId, built.envelope, replace);
  return { kind: 'uploaded', gameId: posted.gameId, turn: posted.sourceTurn };
}

type MirrorView = NonNullable<MirrorLookup['view']>;

/** The mirror's view, or undefined when no game mirrors this PYDT game. */
async function civaMirrorView(token: string, pydtGameId: string): Promise<{ view: MirrorView } | undefined> {
  const found = await lookupMirror(token, pydtGameId);
  if (!found.mirrored) return undefined;
  return { view: found.view ?? { gameId: found.gameId ?? '' } };
}

/** Parse a save, fetch the ruleset's vocabulary (cached per hash) and build the envelope. */
export async function convertSave(token: string, saveBuffer: Buffer, pydtGameId: string, pin: CivaPin, gameName?: string): Promise<BuildResult> {
  const save = parseSave(saveBuffer);
  const schema = await fetchPinnedSchema(token, pin);
  const built = buildEnvelope(save, { schema, pin, pydtGameId, gameName });
  const local = validateEnvelope(schema, built.envelope);
  if (local.length > 0) {
    throw new CivaSyncError(`The converted save does not match civa's schema:\n${local.slice(0, 15).map(i => `  - ${i.path}: ${i.message}`).join('\n')}`);
  }
  return built;
}

/** civa's inspect: stops on a refused envelope or on any issue, with the JSON paths in the message. */
export async function inspectOrThrow(token: string, built: BuildResult): Promise<Inspection> {
  const inspection = await inspectEnvelope(token, built.envelope);
  if (inspection.issues.length > 0) {
    const lines = inspection.issues.slice(0, 15).map(i => `  - ${i.path}: ${i.message}`);
    throw new CivaSyncError(`Civa rejected the converted save:\n${lines.join('\n')}${inspection.issues.length > 15 ? `\n  … and ${inspection.issues.length - 15} more` : ''}`);
  }
  return inspection;
}

/** Read a save file and its PYDT id (the id comes from the caller when the file name has none). */
export function readSaveFile(filePath: string, fallbackGameId?: string): { buffer: Buffer; pydtGameId: string } {
  const pydtGameId = pydtGameIdFromFileName(path.basename(filePath)) ?? fallbackGameId;
  if (!pydtGameId) throw new CivaSyncError(`Cannot tell which PYDT game ${path.basename(filePath)} belongs to.`);
  return { buffer: fs.readFileSync(filePath), pydtGameId };
}

export { whoami };
