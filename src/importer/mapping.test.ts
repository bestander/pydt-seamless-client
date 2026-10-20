import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CivaSchemaReply, PinnedSchema } from '../civa-types';
import { Mapper, displayName, riverMask, terrainOf } from './mapping';

export const classicSchema = JSON.parse(readFileSync(new URL('../../test-fixtures/classic-schema.json', import.meta.url), 'utf8')) as CivaSchemaReply as PinnedSchema;

describe('external names → ids the ruleset lists', () => {
  const mapper = new Mapper(classicSchema.vocabulary);

  it('maps resources, units and civilizations by name and says no when it cannot', () => {
    expect(mapper.resource('RESOURCE_WHEAT')).toBe('WHEAT');
    expect(mapper.resource('Turtles')).toBe('SEA_TURTLES');
    expect(mapper.resource('RESOURCE_NOPE')).toBeUndefined();
    expect(mapper.unit('UNIT_WARRIOR')).toBe('WARRIOR');
    expect(mapper.unit('UNIT_TRADER')).toBe('CARAVAN');
    expect(mapper.unit('UNIT_GREEK_HOPLITE')).toBe('SPEARMAN');
    expect(mapper.unit('UNIT_NOPE')).toBeUndefined();
    expect(mapper.civilization('CIVILIZATION_GREECE')).toBe('greece');
    expect(mapper.civilization('CIVILIZATION_ATLANTIS')).toBeUndefined();
  });

  it('refuses an id the vocabulary does not list, even when the table knows it', () => {
    const narrow = new Mapper({ ...classicSchema.vocabulary, units: ['WARRIOR'] });
    expect(narrow.unit('UNIT_WARRIOR')).toBe('WARRIOR');
    expect(narrow.unit('UNIT_TRADER')).toBeUndefined();
    expect(narrow.unit('UNIT_GREEK_HOPLITE')).toBeUndefined();
  });

  it('maps terrain, hills, mountains, features, buildings, districts, techs and wonders', () => {
    expect(mapper.terrain('TERRAIN_PLAINS_HILLS')).toEqual({ type: 'PLAINS', form: 'Hill' });
    expect(mapper.terrain('TERRAIN_DESERT_MOUNTAIN')).toEqual({ type: 'DESERT', form: 'Mountain' });
    expect(terrainOf('Grassland')).toEqual({ type: 'GRASS', form: null });
    expect(mapper.feature('FEATURE_FOREST')).toBe('WOODS');
    expect(mapper.building('BUILDING_MARKET')).toBe('MARKETPLACE');
    expect(mapper.building('BUILDING_PYRAMIDS')).toBeUndefined();
    expect(mapper.wonder('BUILDING_PYRAMIDS')).toMatch(/pyramids$/);
    expect(mapper.district('DISTRICT_THEATER')).toBe('THEATER_SQUARE');
    const current = new Mapper({ ...classicSchema.vocabulary, districts: ['ARTS_QUARTER', 'LEARNING_QUARTER', 'HARBOR'] });
    expect(current.district('DISTRICT_THEATER')).toBe('ARTS_QUARTER');
    expect(current.district('DISTRICT_CAMPUS')).toBe('LEARNING_QUARTER');
    expect(mapper.tech('TECH_THE_WHEEL')).toBe('WHEEL');
    expect(mapper.tech('TECH_MINING')).toBe('MINING');
    expect(mapper.route(0)).toBe('ROAD');
    expect(mapper.route(4)).toBe('RAILROAD');
    expect(mapper.route(null)).toBeUndefined();
    expect(displayName('CIVILIZATION_MOHENJO_DARO', 'CIVILIZATION')).toBe('Mohenjo Daro');
  });
});

describe('rivers', () => {
  it('maps external direction bits onto civa sides', () => {
    expect(riverMask(0)).toBeUndefined();
    expect(riverMask(-1)).toBeUndefined();
    // civa sides with north = -r and east = -q: E 0, NE 1, NW 2, W 3, SW 4, SE 5.
    expect(riverMask(1 << 0)).toBe(1 << 1);
    expect(riverMask(1 << 1)).toBe(1 << 0);
    expect(riverMask(1 << 2)).toBe(1 << 5);
    expect(riverMask(1 << 3)).toBe(1 << 4);
    expect(riverMask(1 << 4)).toBe(1 << 3);
    expect(riverMask(1 << 5)).toBe(1 << 2);
    expect(riverMask(0b111111)).toBe(0b111111);
  });
});
