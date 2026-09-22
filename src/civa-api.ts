import { CIVA_API_BASE_URL } from './constants';

export interface CivaPlayer {
  id: string;
  name: string;
}

export interface CivaPydtMirrorLookup {
  pydtGameId: string;
  mirrored: boolean;
  gameId?: string;
}

function sessionCookie(sessionToken: string): string {
  return `session=${sessionToken.trim()}`;
}

async function civaFetch(
  sessionToken: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Cookie', sessionCookie(sessionToken));
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(`${CIVA_API_BASE_URL}${path}`, { ...init, headers });
}

export async function validateCivaSession(sessionToken: string): Promise<CivaPlayer | null> {
  const response = await civaFetch(sessionToken, '/player');
  if (!response.ok) {
    return null;
  }
  const data = (await response.json()) as { player?: CivaPlayer | null };
  return data.player ?? null;
}

export async function lookupCivaMirror(
  sessionToken: string,
  pydtGameId: string,
): Promise<CivaPydtMirrorLookup | null> {
  const response = await civaFetch(
    sessionToken,
    `/civ6-import/mirror?pydtGameId=${encodeURIComponent(pydtGameId)}`,
  );
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as CivaPydtMirrorLookup;
}

export async function uploadCivaTurnFromPydt(
  sessionToken: string,
  pydtGameId: string,
  saveBuffer: Buffer,
  fileName: string,
): Promise<{ ok: true; turn: number; gameId: string } | { ok: false; status: number; message: string }> {
  const response = await civaFetch(sessionToken, '/civ6-import/turn', {
    method: 'POST',
    body: JSON.stringify({
      pydtGameId,
      fileName,
      save: saveBuffer.toString('base64'),
    }),
  });
  const body = await response.json().catch(() => ({})) as { message?: string; turn?: number; gameId?: string };
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: body.message ?? response.statusText,
    };
  }
  return {
    ok: true,
    turn: body.turn ?? 0,
    gameId: body.gameId ?? '',
  };
}
