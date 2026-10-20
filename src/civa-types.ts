/** Shapes of civa's mirror API (docs/mirror-api.md in the civa repo). Only what pydt-mini reads. */

export type CivaPin = { builtin: 'blitz' | 'epic' } | { hash: string } | { featured: string };

export interface SchemaIssue {
  /** JSON path from the envelope root, e.g. `$.state.units[3].type`. */
  path: string;
  message: string;
}

export interface RulesetVocabulary {
  units: string[];
  buildings: string[];
  districts: string[];
  ruralDistricts: string[];
  improvements: string[];
  resources: string[];
  terrain: string[];
  features: string[];
  techs: string[];
  civics: string[];
  governments: string[];
  /** Previous name for `regents`. Present through the one-release alias. */
  governors?: string[];
  /** Previous name for `regentPromotions`. */
  governorPromotions?: string[];
  regents?: string[];
  regentPromotions?: string[];
  promotions: string[];
  policyCards: string[];
  beliefs: string[];
  pantheons: string[];
  religions: string[];
  greatPersonClasses: string[];
  greatPeople: string[];
  wonders: string[];
  civilizations: string[];
  leaders: string[];
  cityStates: string[];
}

export interface CivaSchemaReply {
  formatVersion: number;
  moduleApi: number;
  envelopeSchema: Record<string, unknown>;
  snapshotSchema: Record<string, unknown>;
  ruleset?: { id: string; version: number; hash?: string; builtin?: string };
  vocabulary?: RulesetVocabulary;
  templates?: { units: Record<string, Record<string, unknown>>; navalUnits?: string[] };
}

/** A schema reply for one pinned ruleset: the vocabulary and templates are present. */
export type PinnedSchema = CivaSchemaReply & {
  ruleset: NonNullable<CivaSchemaReply['ruleset']>;
  vocabulary: RulesetVocabulary;
  templates: { units: Record<string, Record<string, unknown>>; navalUnits?: string[] };
};

export interface CivaPlayer {
  id: string;
  name: string;
}

export interface InspectSeat {
  index: number;
  civilizationName: string;
  leaderName: string;
  playerName?: string;
  isCurrent: boolean;
  suggestedAccount?: CivaPlayer;
}

export interface PinOption {
  source: 'envelope' | 'featured' | 'builtin';
  pin: CivaPin;
  label: string;
  ok: boolean;
  error?: string;
}

export interface Inspection {
  issues: SchemaIssue[];
  sourceTurn: number;
  currentSeat: number;
  mapWidth: number;
  mapHeight: number;
  pydtGameId?: string;
  warnings: string[];
  seats: InspectSeat[];
  rulesets: PinOption[];
  alreadyMirroredBy?: string;
}

export interface MirrorLookup {
  mirrored: boolean;
  gameId?: string;
  /** The mirror view: gameId, sourceTurn, seats, ruleset { id, version, hash | builtin }, … */
  view?: { gameId: string; sourceTurn?: number; ruleset?: { id: string; version: number; hash?: string; builtin?: string } };
}

export interface CreateRequest {
  envelope: unknown;
  mode: 'mirror' | 'playable';
  ruleset: CivaPin;
  seatMap: Record<string, string | null>;
  aiSeats: number[];
  gameName?: string;
}
