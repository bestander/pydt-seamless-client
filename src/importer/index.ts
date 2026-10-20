import { parseCiv6Save, type Civ6Save } from 'civ6-savegame-parser';

export { buildEnvelope, describeSeats, seatFingerprint, seatPlayerId, type BuildOptions, type BuildResult, type SaveSeat } from './build';
export { validateEnvelope } from './validate';
export { Mapper, type Unmapped } from './mapping';
export { axialMapSize, toAxial } from './coords';

/** Parse a `.Civ6Save` file's bytes. */
export function parseSave(buffer: Buffer): Civ6Save {
  return parseCiv6Save(buffer);
}

/** The PYDT game id from a file name like `<uuid>_158.Civ6Save`, when it has one. */
export function pydtGameIdFromFileName(fileName: string): string | undefined {
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.Civ6Save$/i, '');
  const match = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:_\d+)?$/i.exec(base);
  return match?.[1]?.toLowerCase();
}
