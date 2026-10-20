import { afterEach, describe, expect, it, vi } from 'vitest';
import { CivaApiError, CivaAuthError, clearSchemaCache, fetchPinnedSchema, lookupMirror, postTurn, whoami } from './civa-api';

const TOKEN = 'civa_user_SECRET-token-value';
const reply = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

afterEach(() => { vi.restoreAllMocks(); clearSchemaCache(); });

describe('civa requests', () => {
  it('send the token as a Bearer header, never in the URL or the body', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => reply(200, { id: 'a', name: 'A' }));
    await whoami(TOKEN);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/mirror-games\/whoami$/);
    expect((init!.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(String(url)).not.toContain('SECRET');
    expect(init!.body).toBeUndefined();
  });

  it('turn a 401 into the revoked-or-expired state, and keep the token out of the message', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => reply(401, { message: 'Not authenticated' }));
    const error = await whoami(TOKEN).catch(e => e);
    expect(error).toBeInstanceOf(CivaAuthError);
    expect(error.message).toMatch(/revoked or has expired/);
    expect(error.message).not.toContain('SECRET');
  });

  it('carry inspect-style issues with their JSON paths on a refusal', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => reply(400, { message: 'The envelope was rejected', code: 'invalid_envelope', errors: ['x'], issues: [{ path: '$.state.units[1].hp', message: 'is required' }] }));
    const error = await postTurn(TOKEN, 'g1', {}).catch(e => e) as CivaApiError;
    expect(error).toBeInstanceOf(CivaApiError);
    expect(error.status).toBe(400);
    expect(error.describe()).toContain('$.state.units[1].hp: is required');
  });

  it('read a 404 from by-source as "not mirrored"', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => reply(404, { code: 'not_found' }));
    expect(await lookupMirror(TOKEN, 'abc')).toEqual({ mirrored: false });
  });

  it('cache a ruleset\'s schema per hash', async () => {
    const schema = { formatVersion: 1, moduleApi: 1, envelopeSchema: {}, snapshotSchema: {}, ruleset: { id: 'classic', version: 1, hash: 'h1' }, vocabulary: {}, templates: { units: {} } };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => reply(200, schema));
    await fetchPinnedSchema(TOKEN, { featured: 'classic' });
    await fetchPinnedSchema(TOKEN, { hash: 'h1' });
    await fetchPinnedSchema(TOKEN, { featured: 'classic' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
