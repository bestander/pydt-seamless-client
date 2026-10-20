// Refresh test-fixtures/classic-schema.json from a running civa:
//   CIVA_API_BASE_URL=http://localhost:3000/api CIVA_TOKEN=civa_user_… node scripts/capture-schema.mjs
import { writeFileSync } from 'node:fs';

const base = (process.env.CIVA_API_BASE_URL ?? 'https://civa.us/api').replace(/\/+$/, '');
const token = process.env.CIVA_TOKEN;
if (!token) throw new Error('Set CIVA_TOKEN to a civa_user_… API token');
const res = await fetch(`${base}/mirror-games/schema?featured=${process.env.CIVA_FEATURED ?? 'classic'}`, { headers: { Authorization: `Bearer ${token}` } });
if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
writeFileSync(new URL('../test-fixtures/classic-schema.json', import.meta.url), JSON.stringify(await res.json()));
console.log('wrote test-fixtures/classic-schema.json');
