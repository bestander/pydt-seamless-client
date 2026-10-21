/**
 * A parsed external save → a civa-state envelope.
 *
 * The snapshot (`state`) is built directly as JSON against the schema civa serves
 * (`GET /api/mirror-games/schema`): the tile, unit, city and player shapes are the schema's, the ids are
 * the targeted ruleset's `vocabulary`, and a unit starts as civa's own `templates.units[type]` so no stat
 * table lives here. Nothing in this folder imports civa's source.
 *
 * What it carries: the map (terrain, hills, features, resources, rivers, lakes), cities with their
 * buildings, districts, wonders, territory and worked tiles, roads and improvements, units (health,
 * movement, level), each player's researched technologies and gold, and the seats. What it does not carry
 * yet (civics, governments, policies, religion, governors, great people, production queues, trade routes,
 * diplomacy, fog of war) is listed in `warnings` rather than dropped silently.
 */
import type { Civ6City, Civ6Plot, Civ6Player, Civ6Save, Civ6Unit } from 'civ6-savegame-parser';
import type { CivaPin, PinnedSchema } from '../civa-types';
import { axialMapSize, hexDistance, neighbours, toAxial, type MapDims, type Position } from './coords';
import { count, displayName, Mapper, riverMask, slug, type Unmapped } from './mapping';

export const ENVELOPE_FORMAT = 'civa-state';

/** One seat of the save, as the create window shows it. */
export interface SaveSeat {
  index: number;
  /** The save's own player slot. */
  slot: number;
  civilization: string;
  leader: string;
  civilizationName: string;
  leaderName: string;
  playerName?: string;
  isHuman: boolean;
  isCurrent: boolean;
}

export interface BuildOptions {
  schema: PinnedSchema;
  /** Omit to leave the ruleset out of the envelope (a later turn keeps the game's pin). */
  pin?: CivaPin;
  pydtGameId: string;
  gameName?: string;
}

export interface BuildResult {
  envelope: Record<string, unknown>;
  seats: SaveSeat[];
  unmapped: Unmapped;
  warnings: string[];
}

const civilizations = (save: Civ6Save): Civ6Player[] => save.players.filter(p => p.kind === 'civilization');

/** The full-civilization seats of a save, in slot order. Needs no civa. */
export function describeSeats(save: Civ6Save): SaveSeat[] {
  const current = new Set(save.metadata.currentPlayers);
  return civilizations(save).map((p, index) => ({
    index,
    slot: p.playerId,
    civilization: p.civilization,
    leader: p.leader,
    civilizationName: displayName(p.civilization, 'CIVILIZATION'),
    leaderName: displayName(p.leader, 'LEADER'),
    ...(p.name ? { playerName: p.name } : {}),
    isHuman: p.human,
    isCurrent: current.has(p.playerId),
  }));
}

export function seatFingerprint(seats: SaveSeat[]): string[] {
  return seats.map(s => `${s.civilization}/${s.leader}`);
}

const tileKey = (p: Position): string => `${p.x},${p.y}`;
const clonePlain = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

interface MapTileOut {
  type: string;
  variation: number;
  isHills?: boolean;
  feature?: string;
  resource?: string;
  riverEdges?: number;
  continentId?: number;
  yieldChanges?: Record<string, number>;
}

/** The deterministic 0-10 decoration number civa gives a tile. */
function variationFor(x: number, y: number, type: string): number {
  const hash = Math.abs(x * 7 + y * 13);
  if (type === 'GRASS') {
    if (hash % 100 >= 20) return 0;
    return (Math.abs(x * 31 + y * 17) % 10) + 1;
  }
  return hash % 11;
}

function convertTile(mapper: Mapper, tile: Civ6Plot, axial: Position, unmapped: Unmapped): MapTileOut {
  const resolved = mapper.terrain(tile.terrain);
  let type = resolved.type;
  if (!type) {
    count(unmapped, 'terrain', tile.terrain ?? 'unknown');
    type = 'OCEAN';
  }
  const form = tile.form ?? resolved.form;
  if (form === 'Mountain' && mapper.has('terrain', 'MOUNTAIN')) type = 'MOUNTAIN';
  const out: MapTileOut = { type, variation: variationFor(axial.x, axial.y, type) };
  if (form === 'Hill') out.isHills = true;
  const river = riverMask(tile.riverMap);
  if (river !== undefined) out.riverEdges = river;
  if (tile.feature) {
    const feature = mapper.feature(tile.feature);
    if (feature) out.feature = feature;
    else count(unmapped, 'features', tile.feature);
  }
  if (tile.resource) {
    const resource = mapper.resource(tile.resource);
    if (resource) out.resource = resource;
    else count(unmapped, 'resources', tile.resource);
  }
  if (tile.yieldChanges) {
    const changes: Record<string, number> = {};
    for (const [key, amount] of Object.entries(tile.yieldChanges)) {
      const name = key.replace(/^YIELD_/, '').toLowerCase();
      if (amount && ['food', 'production', 'gold', 'science', 'culture', 'faith'].includes(name)) changes[name] = amount;
    }
    if (Object.keys(changes).length > 0) out.yieldChanges = changes;
  }
  return out;
}

/**
 * The save stores a lake as Coast. A lake is up to nine water tiles completely surrounded by land, so a
 * Coast body of at most nine tiles with no Ocean in it becomes a LAKE.
 */
export function markLakes(map: MapTileOut[][], hasLake: boolean): void {
  if (!hasLake) return;
  const seen = new Set<string>();
  const at = (p: Position) => map[p.y]?.[p.x];
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y]!.length; x++) {
      if (map[y]![x]!.type !== 'COAST' || seen.has(`${x},${y}`)) continue;
      const body: Position[] = [];
      let open = false;
      const stack: Position[] = [{ x, y }];
      seen.add(`${x},${y}`);
      while (stack.length > 0) {
        const p = stack.pop()!;
        body.push(p);
        for (const n of neighbours(p)) {
          const tile = at(n);
          if (!tile) { open = true; continue; }
          if (tile.type === 'OCEAN') open = true;
          if (tile.type !== 'COAST' || seen.has(`${n.x},${n.y}`)) continue;
          seen.add(`${n.x},${n.y}`);
          stack.push(n);
        }
      }
      if (open || body.length > 9) continue;
      for (const p of body) map[p.y]![p.x]!.type = 'LAKE';
    }
  }
}

function playerConfig(id: string, civ: { civilizationId: string; country: string; leader: string }, gold: number, human: boolean) {
  return {
    id,
    type: human ? 'human' : 'ai',
    gold: Math.round(gold),
    goldBook: { inflows: {}, outflows: {} },
    country: civ.country,
    leader: civ.leader,
    civilizationId: civ.civilizationId,
    acceptPostImports: true,
    patronageEnabled: false,
  };
}

/** `ai_pydt_seat_0`: a stable AI id per seat. Civa swaps it for the account when a seat is claimed. */
export const seatPlayerId = (seatIndex: number): string => `ai_pydt_seat_${seatIndex}`;

export function buildEnvelope(save: Civ6Save, options: BuildOptions): BuildResult {
  const mapper = new Mapper(options.schema.vocabulary);
  const unmapped: Unmapped = {};
  const warnings: string[] = [...save.warnings];
  const seats = describeSeats(save);
  if (seats.length === 0) throw new Error('The save has no full-civilization seats');
  const templates = options.schema.templates.units;
  const dims: MapDims = { width: save.map.width, height: save.map.height };

  // ---- map ----------------------------------------------------------------------------------
  const size = axialMapSize(dims);
  const hasLake = mapper.has('terrain', 'LAKE');
  const map: MapTileOut[][] = Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => ({ type: 'OCEAN', variation: variationFor(x, y, 'OCEAN') })));
  for (const plot of save.map.plots) {
    const axial = toAxial(plot.x, plot.y, dims);
    map[axial.y]![axial.x] = convertTile(mapper, plot, axial, unmapped);
  }
  markLakes(map, hasLake);

  // ---- players: seats, then city-states -------------------------------------------------------
  const civs = civilizations(save);
  const taken = new Set<string>();
  const seatCivIds = civs.map(p => {
    const id = mapper.civilization(p.civilization);
    if (id && !taken.has(id)) { taken.add(id); return id; }
    return undefined;
  });
  const spare = options.schema.vocabulary.civilizations.filter(id => !taken.has(id));
  const players: Array<Record<string, unknown>> = [];
  const slotToPlayerId = new Map<number, string>();
  const playerNames: Record<string, string> = {};
  civs.forEach((p, i) => {
    let civId = seatCivIds[i];
    if (!civId) {
      civId = spare.shift();
      if (!civId) throw new Error('The ruleset has too few civilizations for every seat in the save');
      warnings.push(`${seats[i]!.civilizationName} (${seats[i]!.leaderName}) has no civilization in this ruleset; it plays as ${civId}`);
    }
    const id = seatPlayerId(i);
    slotToPlayerId.set(p.playerId, id);
    playerNames[id] = p.name ?? seats[i]!.leaderName;
    players.push(playerConfig(id, { civilizationId: civId, country: seats[i]!.civilizationName, leader: seats[i]!.leaderName }, p.gold, false));
  });
  const knownCityStates = new Set<string>();
  for (const cs of save.players.filter(p => p.kind === 'city_state')) {
    const csSlug = slug(cs.civilization, 'CIVILIZATION');
    const csId = mapper.cityState(cs.civilization) ?? `ext-${csSlug}`;
    const id = `CITY_STATE:${csId}`;
    slotToPlayerId.set(cs.playerId, id);
    if (knownCityStates.has(id)) continue;
    knownCityStates.add(id);
    const name = displayName(cs.civilization, 'CIVILIZATION');
    playerNames[id] = name;
    players.push(playerConfig(id, { civilizationId: csId, country: name, leader: name }, 0, false));
  }

  // ---- cities and territory ---------------------------------------------------------------------
  const territory = new Map<string, Position[]>();
  for (const plot of save.map.plots) {
    if (!plot.owner) continue;
    const key = `${plot.owner.playerId}:${plot.owner.citySlot}`;
    const list = territory.get(key) ?? [];
    list.push(toAxial(plot.x, plot.y, dims));
    territory.set(key, list);
  }
  const cities: Array<Record<string, unknown>> = [];
  const tileOwnership: Record<string, string> = {};
  const cityOwners: Array<{ position: Position; playerId: string }> = [];
  let skippedCities = 0;
  save.cities.forEach((city: Civ6City) => {
    const playerId = slotToPlayerId.get(city.playerId);
    if (!playerId) { skippedCities++; return; }
    const center = toAxial(city.center.x, city.center.y, dims);
    const cityId = `city-${city.playerId}-${city.slot}`;
    cityOwners.push({ position: center, playerId });
    for (const p of territory.get(`${city.playerId}:${city.slot}`) ?? []) tileOwnership[tileKey(p)] = cityId;
    tileOwnership[tileKey(center)] = cityId;

    const buildings: string[] = [];
    const wonders: Array<{ wonderId: string; position: Position }> = [];
    for (const b of city.buildings) {
      if (b.type === 'BUILDING_PALACE') continue;
      const building = mapper.building(b.type);
      if (building) { buildings.push(building); continue; }
      const wonder = mapper.wonder(b.type);
      if (wonder) wonders.push({ wonderId: wonder, position: toAxial(b.x, b.y, dims) });
      else count(unmapped, 'buildings', b.type);
    }
    const districts: Array<{ type: string; position: Position; completed: boolean }> = [];
    for (const d of city.districts) {
      if (d.type === 'DISTRICT_CITY_CENTER' || d.type === 'DISTRICT_WONDER') continue;
      const type = mapper.district(d.type);
      if (type) districts.push({ type, position: toAxial(d.x, d.y, dims), completed: d.complete });
      else count(unmapped, 'districts', d.type);
    }
    const damage = city.districts.find(d => d.type === 'DISTRICT_CITY_CENTER')?.damage ?? 0;
    const worked = (city.workedPlots ?? [])
      .filter(w => w.workers > 0)
      .map(w => toAxial(w.x, w.y, dims))
      .filter(p => p.x !== center.x || p.y !== center.y);
    cities.push({
      id: cityId,
      playerId,
      position: center,
      visionRange: 2,
      name: city.name ? displayName(`X_${city.name}`, 'X') : `City ${city.slot + 1}`,
      population: Math.max(1, city.population),
      nextGrowthTurn: 0,
      foodBox: city.food ?? 0,
      resources: { food: 0, production: 0, science: 0, gold: 0 },
      accumulatedResources: { food: 0, production: 0, science: 0, gold: 0 },
      buildings,
      ...(districts.length > 0 ? { districts } : {}),
      ...(wonders.length > 0 ? { wonders } : {}),
      tradeRoutes: [],
      hp: { current: Math.max(1, 200 - damage), max: 200 },
      ...(worked.length > 0 ? { workedTilePositions: worked } : {}),
      isCapital: city.capital || city.buildings.some(b => b.type === 'BUILDING_PALACE'),
    });
  });
  if (skippedCities > 0) warnings.push(`${skippedCities} cities skipped (barbarian or free-city owner)`);

  // ---- roads and improvements -------------------------------------------------------------------
  const ownerAt = (plot: Civ6Plot, axial: Position): string | undefined => {
    const owned = plot.owner ? slotToPlayerId.get(plot.owner.playerId) : undefined;
    if (owned) return owned;
    let best: { d: number; id: string } | undefined;
    for (const c of cityOwners) {
      const d = hexDistance(c.position, axial);
      if (!best || d < best.d) best = { d, id: c.playerId };
    }
    return best?.id;
  };
  const tileImprovements: Array<Record<string, unknown>> = [];
  for (const plot of save.map.plots) {
    const road = mapper.route(plot.routeIndex);
    const improvement = plot.improvement ? mapper.improvement(plot.improvement) : undefined;
    if (plot.improvement && !improvement) count(unmapped, 'improvements', plot.improvement);
    if (!road && !improvement) continue;
    const axial = toAxial(plot.x, plot.y, dims);
    const playerId = ownerAt(plot, axial);
    if (!playerId) continue;
    for (const type of [road, improvement]) {
      if (type) tileImprovements.push({ type, position: axial, playerId, turnsRemaining: 0, ...(plot.pillaged ? { pillaged: true } : {}) });
    }
  }

  // ---- units -----------------------------------------------------------------------------------
  const units: Array<Record<string, unknown>> = [];
  const usedIds = new Set<string>();
  let foreign = 0;
  save.units.forEach((u: Civ6Unit, index) => {
    const playerId = slotToPlayerId.get(u.playerId);
    if (!playerId) { foreign++; return; }
    const type = mapper.unit(u.type);
    const template = type ? templates[type] : undefined;
    if (!type || !template) { count(unmapped, 'units', u.type); return; }
    let id = u.id !== null ? `civ6-${u.playerId}-${u.id}` : `civ6-${u.playerId}-n${index}`;
    while (usedIds.has(id)) id += '_';
    usedIds.add(id);
    const unit = clonePlain(template) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const position = toAxial(u.x, u.y, dims);
    unit.id = id;
    unit.playerId = playerId;
    unit.position = position;
    if (unit.hp && Number.isFinite(u.hp)) unit.hp.current = Math.max(1, Math.min(unit.hp.max, Math.round(unit.hp.max * u.hp / 100)));
    if (unit.mp && Number.isFinite(u.movesRemaining)) unit.mp.current = Math.max(0, Math.min(unit.mp.max, u.movesRemaining));
    if (u.level >= 1) unit.level = Math.floor(u.level);
    if (Number.isFinite(u.xp)) unit.currentExp = Math.max(0, Math.floor(u.xp));
    const tile = map[position.y]?.[position.x];
    const naval = new Set(options.schema.templates.navalUnits ?? []);
    if (tile && !['GRASS', 'PLAINS', 'DESERT', 'TUNDRA', 'SNOW', 'MOUNTAIN'].includes(tile.type) && !naval.has(type)) unit.embarked = true;
    units.push(unit);
  });
  if (foreign > 0) warnings.push(`${foreign} barbarian or free-city units skipped`);

  // ---- research ----------------------------------------------------------------------------------
  const playerTechnologies: Record<string, string[]> = {};
  const currentResearch: Record<string, string> = {};
  const researchProgress: Record<string, Record<string, number>> = {};
  civs.forEach((p, i) => {
    const id = seatPlayerId(i);
    const techs = new Set<string>();
    for (const t of p.techsResearched) {
      const tech = mapper.tech(t);
      if (tech) techs.add(tech);
      else count(unmapped, 'techs', t);
    }
    playerTechnologies[id] = [...techs];
    researchProgress[id] = {};
    for (const [name, points] of Object.entries(p.techProgress)) {
      const tech = mapper.tech(name);
      if (tech && !techs.has(tech)) researchProgress[id]![tech] = points;
    }
    const current = p.currentResearch ? mapper.tech(p.currentResearch) : undefined;
    if (current) currentResearch[id] = current;
  });

  // ---- assemble ----------------------------------------------------------------------------------
  const currentSeat = Math.max(0, seats.findIndex(s => s.isCurrent));
  const state: Record<string, unknown> = {
    map,
    mapSize: size,
    players,
    units,
    cities,
    currentPlayerIndex: currentSeat,
    turnNumber: save.metadata.turn,
    tileImprovements,
    tileOwnership,
    playerNames,
    playerTechnologies,
    currentResearch,
    researchProgress,
  };
  const notCarried = 'civics, governments, policy cards, religion, governors, great people, production, trade routes, diplomacy and fog of war are not carried yet';
  warnings.push(notCarried);
  for (const [bucket, names] of Object.entries(unmapped)) {
    const entries = Object.entries(names);
    if (entries.length > 0) warnings.push(`${bucket} without a civa counterpart: ${entries.map(([k, n]) => `${k} ×${n}`).join(', ')}`);
  }

  const envelope: Record<string, unknown> = {
    format: ENVELOPE_FORMAT,
    formatVersion: options.schema.formatVersion,
    ...(options.pin ? { ruleset: options.pin } : {}),
    sourceTurn: save.metadata.turn,
    // The source grid, not the axial square. Mirrors created by the server importer stored width×height
    // (74×46 for this map) and a later turn must name the same map.
    fingerprint: { mapWidth: dims.width, mapHeight: dims.height, seats: seatFingerprint(seats), pydtGameId: options.pydtGameId },
    seats: seats.map(s => ({
      index: s.index,
      civilizationName: s.civilizationName,
      leaderName: s.leaderName,
      ...(s.playerName ? { playerName: s.playerName } : {}),
    })),
    state,
    warnings: warnings.slice(0, 200).map(w => w.slice(0, 1000)),
    ...(options.gameName ? { gameName: options.gameName.slice(0, 80) } : {}),
  };
  return { envelope, seats, unmapped, warnings };
}
