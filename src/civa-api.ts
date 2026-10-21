import { CIVA_API_BASE_URL, CIVA_WEB_BASE_URL } from './constants';
import type {
  CivaPin, CivaPlayer, CivaSchemaReply, CreateRequest, Inspection, MirrorLookup, PinnedSchema, SchemaIssue,
} from './civa-types';

/** 401: the token is revoked, expired or wrong. The app shows a "token revoked or expired" state. */
export class CivaAuthError extends Error {
  constructor(message = 'Your Civa API token was revoked or has expired. Paste a new one from your Civa account page.') {
    super(message);
    this.name = 'CivaAuthError';
  }
}

export class CivaApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly errors: string[] = [],
    readonly issues: SchemaIssue[] = [],
  ) {
    super(message);
    this.name = 'CivaApiError';
  }

  /** One readable block: the message, then each error or issue with its JSON path. */
  describe(): string {
    const lines = [this.message];
    for (const e of this.errors) lines.push(`  - ${e}`);
    for (const i of this.issues.slice(0, 20)) lines.push(`  - ${i.path}: ${i.message}`);
    if (this.issues.length > 20) lines.push(`  … and ${this.issues.length - 20} more`);
    return lines.join('\n');
  }
}

interface CivaResponse<T> {
  status: number;
  body: T;
}

/**
 * Converting a save blocks the event loop for a couple of seconds, long enough for the server to drop an idle
 * keep-alive socket; the next request then fails with a connection reset before anything was sent. Try again once.
 */
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    const code = (error as { cause?: { code?: string } }).cause?.code;
    if (code === 'ECONNRESET' || code === 'UND_ERR_SOCKET' || code === 'EPIPE') return fetch(url, init);
    throw error;
  }
}

/** One call to civa. The token only ever leaves in the Authorization header; nothing here logs it. */
async function civaRequest<T>(token: string, method: string, path: string, body?: unknown, okStatuses: number[] = []): Promise<CivaResponse<T>> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token.trim()}`, Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetchWithRetry(`${CIVA_API_BASE_URL}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const parsed = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (response.status === 401) throw new CivaAuthError();
  if (!response.ok && !okStatuses.includes(response.status)) {
    throw new CivaApiError(
      response.status,
      typeof parsed.message === 'string' ? parsed.message : `${response.status} ${response.statusText}`,
      typeof parsed.code === 'string' ? parsed.code : undefined,
      Array.isArray(parsed.errors) ? parsed.errors.map(String) : [],
      Array.isArray(parsed.issues) ? parsed.issues as SchemaIssue[] : [],
    );
  }
  return { status: response.status, body: parsed as T };
}

/** The account behind the token. Throws CivaAuthError when the token is not valid. */
export async function whoami(token: string): Promise<CivaPlayer> {
  return (await civaRequest<CivaPlayer>(token, 'GET', '/mirror-games/whoami')).body;
}

const pinQuery = (pin: CivaPin): string => {
  const [key, value] = Object.entries(pin)[0]!;
  return `${key}=${encodeURIComponent(String(value))}`;
};

const FEATURED_TTL_MS = 10 * 60 * 1000;
/** Schema replies by ruleset hash never change; a featured id resolves to a hash that can move, so it is re-asked after a while. */
const byHash = new Map<string, PinnedSchema>();
const byFeatured = new Map<string, { at: number; reply: PinnedSchema }>();

export function clearSchemaCache(): void {
  byHash.clear();
  byFeatured.clear();
}

/** The schema, vocabulary and unit templates for a ruleset pin, cached per ruleset hash. */
export async function fetchPinnedSchema(token: string, pin: CivaPin, now: () => number = Date.now): Promise<PinnedSchema> {
  if ('hash' in pin && byHash.has(pin.hash)) return byHash.get(pin.hash)!;
  if ('featured' in pin) {
    const hit = byFeatured.get(pin.featured);
    if (hit && now() - hit.at < FEATURED_TTL_MS) return hit.reply;
  }
  const { body } = await civaRequest<CivaSchemaReply>(token, 'GET', `/mirror-games/schema?${pinQuery(pin)}`);
  if (!body.ruleset || !body.vocabulary || !body.templates) throw new CivaApiError(502, 'Civa did not return a vocabulary for that ruleset');
  const reply = body as PinnedSchema;
  if (reply.ruleset.hash) byHash.set(reply.ruleset.hash, reply);
  if ('featured' in pin) byFeatured.set(pin.featured, { at: now(), reply });
  return reply;
}

export async function inspectEnvelope(token: string, envelope: unknown): Promise<Inspection> {
  return (await civaRequest<Inspection>(token, 'POST', '/mirror-games/inspect', envelope)).body;
}

export async function lookupMirror(token: string, pydtGameId: string): Promise<MirrorLookup> {
  const { status, body } = await civaRequest<NonNullable<MirrorLookup['view']>>(token, 'GET', `/mirror-games/by-source/${encodeURIComponent(pydtGameId)}`, undefined, [404]);
  return status === 404 ? { mirrored: false } : { mirrored: true, gameId: body.gameId, view: body };
}

/** Add a turn to the existing mirror of a PYDT game. No `create`: a game that is not mirrored answers 404. */
export async function postTurn(token: string, pydtGameId: string, envelope: unknown, replace = false): Promise<{ gameId: string; sourceTurn: number }> {
  const query = replace ? '?replace=1' : '';
  const { body } = await civaRequest<{ gameId: string; sourceTurn: number }>(token, 'POST', `/mirror-games/by-source/${encodeURIComponent(pydtGameId)}/turns${query}`, envelope);
  return body;
}

export async function createGame(token: string, request: CreateRequest): Promise<{ gameId: string; mode: string }> {
  const { body } = await civaRequest<{ gameId: string; mode?: string }>(token, 'POST', '/mirror-games', request);
  return { gameId: body.gameId, mode: body.mode ?? request.mode };
}

export async function searchPlayers(token: string, query: string, limit = 8): Promise<CivaPlayer[]> {
  const { body } = await civaRequest<{ players: CivaPlayer[] }>(token, 'GET', `/players/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  return body.players;
}

export function gameUrl(gameId: string): string {
  return `${CIVA_WEB_BASE_URL}/game.html?gameId=${encodeURIComponent(gameId)}`;
}
