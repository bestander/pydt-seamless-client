/**
 * External save vocabulary → civa vocabulary.
 *
 * Every table is a best-effort name match: the save parser resolves hashes to the game's own type strings
 * (`TERRAIN_GRASS_HILLS`, `UNIT_WARRIOR`, `CIVILIZATION_GREECE`) and this file says what each one is in
 * civa. The tables live here, in pydt-mini; the *set of ids civa accepts* does not: it comes from civa's
 * `/api/mirror-games/schema` for the ruleset being targeted (the `vocabulary`). A candidate that the
 * vocabulary does not list is not used, and is counted as unmapped so the gap is visible, never guessed.
 */
import type { RulesetVocabulary } from '../civa-types';
import unitReplacesJson from './data/civ6-unit-replaces.json';

/** Tallies of every external name the tables had no answer for. */
export type Unmapped = Record<string, Record<string, number>>;

export function count(unmapped: Unmapped, bucket: string, name: string): void {
  const b = (unmapped[bucket] ??= {});
  b[name] = (b[name] ?? 0) + 1;
}

const TERRAIN_FAMILY: Readonly<Record<string, string>> = {
  GRASS: 'GRASS', GRASSLAND: 'GRASS', PLAINS: 'PLAINS', DESERT: 'DESERT', TUNDRA: 'TUNDRA',
  SNOW: 'SNOW', COAST: 'COAST', OCEAN: 'OCEAN', LAKE: 'LAKE',
};

/** Display names an older parser emitted, next to the `TERRAIN_*` ids. */
const TERRAIN_BY_NAME: Readonly<Record<string, string>> = {
  Grassland: 'GRASS', Plains: 'PLAINS', Desert: 'DESERT', Tundra: 'TUNDRA', Snow: 'SNOW', Coast: 'COAST', Ocean: 'OCEAN', Lake: 'LAKE',
};

const FEATURE_BY_TYPE: Readonly<Record<string, string>> = {
  FEATURE_FOREST: 'WOODS', FEATURE_BURNT_FOREST: 'WOODS', FEATURE_JUNGLE: 'RAINFOREST', FEATURE_BURNT_JUNGLE: 'RAINFOREST',
  FEATURE_MARSH: 'MARSH', FEATURE_FLOODPLAINS: 'FLOODPLAINS', FEATURE_FLOODPLAINS_GRASSLAND: 'FLOODPLAINS',
  FEATURE_FLOODPLAINS_PLAINS: 'FLOODPLAINS', FEATURE_OASIS: 'OASIS', FEATURE_ICE: 'ICE', FEATURE_REEF: 'REEF',
  FEATURE_VOLCANO: 'VOLCANO', FEATURE_VOLCANIC_SOIL: 'VOLCANIC_SOIL', FEATURE_ULURU: 'ULURU',
  FEATURE_KILIMANJARO: 'KILIMANJARO', FEATURE_CRATER_LAKE: 'CRATER_LAKE', FEATURE_MATTERHORN: 'MATTERHORN',
  FEATURE_VESUVIUS: 'VESUVIUS', FEATURE_EYJAFJALLAJOKULL: 'EYJAFJALLAJOKULL', FEATURE_FOUNTAIN_OF_YOUTH: 'FOUNTAIN_OF_YOUTH',
  FEATURE_EYE_OF_THE_SAHARA: 'EYE_OF_THE_SAHARA', FEATURE_BARRIER_REEF: 'GREAT_BARRIER_REEF',
  FEATURE_GALAPAGOS: 'GALAPAGOS', FEATURE_IKKIL: 'IK_KIL',
};

const FEATURE_BY_NAME: Readonly<Record<string, string>> = {
  Woods: 'WOODS', 'Burning Woods': 'WOODS', 'Burnt Woods': 'WOODS', Rainforest: 'RAINFOREST', 'Burning Rainforest': 'RAINFOREST',
  'Burnt Rainforest': 'RAINFOREST', Marsh: 'MARSH', 'Desert Floodplains': 'FLOODPLAINS', 'Grassland Floodplains': 'FLOODPLAINS',
  'Plains Floodplains': 'FLOODPLAINS', Oasis: 'OASIS', Ice: 'ICE', Reef: 'REEF', Volcano: 'VOLCANO', Uluru: 'ULURU',
  'Mount Kilimanjaro': 'KILIMANJARO', 'Crater Lake': 'CRATER_LAKE', Matterhorn: 'MATTERHORN', 'Mount Vesuvius': 'VESUVIUS',
  'Eyjafjallajökull': 'EYJAFJALLAJOKULL', 'Fountain of Youth': 'FOUNTAIN_OF_YOUTH', 'Eye of the Sahara': 'EYE_OF_THE_SAHARA',
  'Great Barrier Reef': 'GREAT_BARRIER_REEF', 'Galápagos Islands': 'GALAPAGOS', 'Ik-Kil': 'IK_KIL',
};

const RESOURCE_ALIASES: Readonly<Record<string, string>> = { Turtles: 'SEA_TURTLES', TURTLES: 'SEA_TURTLES', RESOURCE_TURTLES: 'SEA_TURTLES' };

const UNIT_ALIASES: Readonly<Record<string, string>> = {
  UNIT_TRADER: 'CARAVAN', UNIT_MAN_AT_ARMS: 'SWORDSMAN', UNIT_LINE_INFANTRY: 'MUSKETMAN', UNIT_CUIRASSIER: 'CAVALRY',
  UNIT_GREAT_ADMIRAL: 'GREAT_ADMIRAL', UNIT_GREAT_GENERAL: 'GREAT_GENERAL', UNIT_GIANT_DEATH_ROBOT: 'HEAVY_MECH',
};

/** `UNIT_GREEK_HOPLITE` → `UNIT_SPEARMAN`, from the game data. */
const UNIT_REPLACES = unitReplacesJson as Record<string, string>;

const TECH_ALIASES: Readonly<Record<string, string>> = {
  TECH_THE_WHEEL: 'WHEEL', TECH_REPLACEABLE_PARTS: 'INTERCHANGEABLE_PARTS', TECH_SMART_MATERIALS: 'ADAPTIVE_MATERIALS',
  TECH_PREDICTIVE_SYSTEMS: 'FORECASTING_SYSTEMS', TECH_OFFWORLD_MISSION: 'INTERPLANETARY_MISSION', TECH_SEASTEADS: 'OCEAN_HABITATS',
};

const BUILDING_ALIASES: Readonly<Record<string, string>> = {
  BUILDING_WALLS: 'CITY_WALLS', BUILDING_CASTLE: 'MEDIEVAL_WALLS', BUILDING_STAR_FORT: 'RENAISSANCE_WALLS', BUILDING_TEMPLE: 'HOLY_TEMPLE',
  BUILDING_MARKET: 'MARKETPLACE', BUILDING_MUSEUM_ART: 'ART_MUSEUM', BUILDING_MUSEUM_ARTIFACT: 'ARCHAEOLOGICAL_MUSEUM',
};

/**
 * Current district id, then the name a moduleApi 1 ruleset still lists. The first one the vocabulary
 * contains is used.
 */
const DISTRICT_ALIASES: Readonly<Record<string, readonly string[]>> = {
  DISTRICT_ENTERTAINMENT_COMPLEX: ['ENTERTAINMENT'], DISTRICT_THEATER: ['ARTS_QUARTER', 'THEATER_SQUARE'],
  DISTRICT_GOVERNMENT: ['ADMIN_QUARTER', 'GOVERNMENT_PLAZA'],
  DISTRICT_COTHON: ['HARBOR'], DISTRICT_ROYAL_NAVY_DOCKYARD: ['HARBOR'],
  DISTRICT_HANSA: ['WORKS_QUARTER', 'INDUSTRIAL_ZONE'], DISTRICT_OPPIDUM: ['WORKS_QUARTER', 'INDUSTRIAL_ZONE'],
  DISTRICT_LAVRA: ['FAITH_QUARTER', 'HOLY_SITE'], DISTRICT_SEOWON: ['LEARNING_QUARTER', 'CAMPUS'],
  DISTRICT_OBSERVATORY: ['LEARNING_QUARTER', 'CAMPUS'], DISTRICT_ACROPOLIS: ['ARTS_QUARTER', 'THEATER_SQUARE'],
  DISTRICT_IKANDA: ['MILITARY_QUARTER', 'ENCAMPMENT'], DISTRICT_THANH: ['MILITARY_QUARTER', 'ENCAMPMENT'],
  DISTRICT_SUGUBA: ['TRADE_QUARTER', 'COMMERCIAL_HUB'], DISTRICT_STREET_CARNIVAL: ['ENTERTAINMENT'],
  DISTRICT_HIPPODROME: ['ENTERTAINMENT'],
};

/** Bare district id after `DISTRICT_` is stripped, when the current name differs. */
const DISTRICT_CURRENT: Readonly<Record<string, string>> = {
  THEATER: 'ARTS_QUARTER', THEATER_SQUARE: 'ARTS_QUARTER', GOVERNMENT: 'ADMIN_QUARTER', GOVERNMENT_PLAZA: 'ADMIN_QUARTER',
  INDUSTRIAL_ZONE: 'WORKS_QUARTER', HOLY_SITE: 'FAITH_QUARTER', CAMPUS: 'LEARNING_QUARTER',
  ENCAMPMENT: 'MILITARY_QUARTER', COMMERCIAL_HUB: 'TRADE_QUARTER', PRESERVE: 'NATURE_RESERVE',
};

/** Wonders whose building name is not the civa id with `BUILDING_` stripped. */
const WONDER_ALIASES: Readonly<Record<string, string>> = {
  BUILDING_TEMPLE_ARTEMIS: 'temple_of_artemis', BUILDING_MAUSOLEUM_HALICARNASSUS: 'mausoleum_at_halicarnassus',
};

const IMPROVEMENT_BY_NAME: Readonly<Record<string, string>> = {
  Farm: 'FARM', IMPROVEMENT_FARM: 'FARM', Mine: 'MINE', IMPROVEMENT_MINE: 'MINE', Quarry: 'QUARRY', IMPROVEMENT_QUARRY: 'QUARRY',
  'Lumber Mill': 'LUMBER_MILL', IMPROVEMENT_LUMBER_MILL: 'LUMBER_MILL', Pasture: 'PASTURE', IMPROVEMENT_PASTURE: 'PASTURE',
  Plantation: 'PLANTATION', IMPROVEMENT_PLANTATION: 'PLANTATION', Camp: 'CAMP', IMPROVEMENT_CAMP: 'CAMP',
  'Fishing Boats': 'FISHING_BOATS', IMPROVEMENT_FISHING_BOATS: 'FISHING_BOATS', Fort: 'FORT', IMPROVEMENT_FORT: 'FORT',
  'Oil Well': 'WELL', IMPROVEMENT_OIL_WELL: 'WELL', 'Offshore Platform': 'WELL', IMPROVEMENT_OFFSHORE_OIL_RIG: 'WELL',
  Airstrip: 'AIRSTRIP', IMPROVEMENT_AIRSTRIP: 'AIRSTRIP', 'Missile Silo': 'MISSILE_SILO', IMPROVEMENT_MISSILE_SILO: 'MISSILE_SILO',
  'Mountain Tunnel': 'MOUNTAIN_TUNNEL', IMPROVEMENT_MOUNTAIN_TUNNEL: 'MOUNTAIN_TUNNEL', Seastead: 'OCEAN_HABITAT', IMPROVEMENT_SEASTEAD: 'OCEAN_HABITAT',
};

/** Terrain family after `TERRAIN_` and a `_HILLS` / `_MOUNTAIN` suffix. */
export function terrainOf(name: string | null): { type: string | undefined; form: string | null } {
  if (!name) return { type: undefined, form: null };
  if (TERRAIN_BY_NAME[name]) return { type: TERRAIN_BY_NAME[name], form: null };
  const raw = name.replace(/^TERRAIN_/, '');
  let form: string | null = null;
  let family = raw;
  if (raw.endsWith('_MOUNTAIN')) { form = 'Mountain'; family = raw.slice(0, -'_MOUNTAIN'.length); }
  else if (raw.endsWith('_HILLS')) { form = 'Hill'; family = raw.slice(0, -'_HILLS'.length); }
  return { type: TERRAIN_FAMILY[family], form };
}

/**
 * The external river mask → civa's `riverEdges`. Bit i of the save's byte is direction i (NE, E, SE, SW, W, NW),
 * found by mirror consistency over a real save; with both axes flipped by `toAxial` civa's side is (7 - dir) mod 6.
 */
export function riverMask(riverMap: number): number | undefined {
  if (riverMap <= 0) return undefined;
  let mask = 0;
  for (let dir = 0; dir < 6; dir++) if (riverMap & (1 << dir)) mask |= 1 << ((7 - dir) % 6);
  return mask;
}

/** `CIVILIZATION_MOHENJO_DARO` → `mohenjo_daro`. */
export function slug(id: string, prefix: string): string {
  return id.replace(new RegExp(`^${prefix}_`), '').toLowerCase();
}

export function displayName(id: string, prefix: string): string {
  return slug(id, prefix).replace(/_alt$/, '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/** Resolves external names to ids the targeted ruleset lists. Each method returns undefined when there is no match. */
export class Mapper {
  readonly vocabulary: RulesetVocabulary;
  private readonly sets: { [K in keyof RulesetVocabulary]: Set<string> };

  constructor(vocabulary: RulesetVocabulary) {
    const regents = vocabulary.regents ?? vocabulary.governors ?? [];
    const regentPromotions = vocabulary.regentPromotions ?? vocabulary.governorPromotions ?? [];
    this.vocabulary = {
      ...vocabulary,
      regents,
      regentPromotions,
      governors: vocabulary.governors ?? regents,
      governorPromotions: vocabulary.governorPromotions ?? regentPromotions,
    };
    this.sets = Object.fromEntries(Object.entries(this.vocabulary).map(([k, v]) => [k, new Set((v ?? []) as string[])])) as typeof this.sets;
  }

  /** The first candidate the targeted ruleset lists. */
  private listed(group: keyof RulesetVocabulary, ids: readonly string[]): string | undefined {
    return ids.find(id => this.has(group, id));
  }

  has(group: keyof RulesetVocabulary, id: string): boolean {
    return this.sets[group].has(id);
  }

  terrain(name: string | null): { type: string | undefined; form: string | null } {
    const t = terrainOf(name);
    return { type: t.type && this.has('terrain', t.type) ? t.type : undefined, form: t.form };
  }

  feature(name: string): string | undefined {
    const id = FEATURE_BY_TYPE[name] ?? FEATURE_BY_NAME[name];
    return id && this.has('features', id) ? id : undefined;
  }

  resource(name: string): string | undefined {
    const id = RESOURCE_ALIASES[name] ?? name.replace(/^RESOURCE_/, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    return this.has('resources', id) ? id : undefined;
  }

  unit(type: string | null): string | undefined {
    if (!type) return undefined;
    const alias = UNIT_ALIASES[type];
    if (alias && this.has('units', alias)) return alias;
    const id = type.replace(/^UNIT_/, '');
    if (this.has('units', id)) return id;
    // A unique unit is its base unit here (a Hoplite is a Spearman that Greece builds).
    const base = UNIT_REPLACES[type];
    return base && base !== type ? this.unit(base) : undefined;
  }

  tech(name: string): string | undefined {
    const id = TECH_ALIASES[name] ?? name.replace(/^TECH_/, '');
    return this.has('techs', id) ? id : undefined;
  }

  building(name: string): string | undefined {
    const id = BUILDING_ALIASES[name] ?? name.replace(/^BUILDING_/, '');
    return this.has('buildings', id) ? id : undefined;
  }

  district(name: string): string | undefined {
    const aliases = DISTRICT_ALIASES[name];
    if (aliases) {
      const hit = this.listed('districts', aliases);
      if (hit) return hit;
    }
    const bare = name.replace(/^DISTRICT_/, '');
    const current = DISTRICT_CURRENT[bare];
    return this.listed('districts', current ? [current, bare] : [bare]);
  }

  /** A wonder id: the ruleset's own `classic_*` variant when it lists one, otherwise the plain slug. */
  wonder(buildingName: string): string | undefined {
    const base = WONDER_ALIASES[buildingName] ?? slug(buildingName, 'BUILDING');
    return [`classic_${base}`, base].find(id => this.has('wonders', id));
  }

  improvement(name: string): string | undefined {
    const id = IMPROVEMENT_BY_NAME[name];
    return id && this.has('improvements', id) ? id : undefined;
  }

  /** Route index on a plot: 0-3 are the ancient…modern roads, 4 the railroad. */
  route(routeIndex: number | null): string | undefined {
    if (routeIndex === null || routeIndex < 0) return undefined;
    const id = routeIndex >= 4 ? 'RAILROAD' : 'ROAD';
    return this.has('improvements', id) ? id : undefined;
  }

  /**
   * The civa civilization pack for an external civ, when the ruleset carries it under the same slug
   * (`CIVILIZATION_GREECE` → `greece`).
   */
  civilization(external: string): string | undefined {
    const id = slug(external, 'CIVILIZATION');
    return this.has('civilizations', id) ? id : undefined;
  }

  cityState(external: string): string | undefined {
    const id = slug(external, 'CIVILIZATION');
    return this.has('cityStates', id) ? id : undefined;
  }
}
