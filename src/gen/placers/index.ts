import { type PlacementKind } from '../../core/enemy-defs';
import { crossingPlacer } from './crossing';
import { decoyPlacer } from './decoy';
import { flagPlacer } from './flag';
import { gatePlacer } from './gate';
import { linePlacer } from './line';
import { nichePlacer } from './niche';
import { pivotPlacer } from './pivot';
import { pointPlacer } from './point';
import { reachPlacer, segmentPlacer } from './segment';
import { type Placer } from './types';

export { MAX_PATROL_LENGTH, MAX_SPEAR_LENGTH, MIN_CHASER_START_DISTANCE } from './rules';
export { MIN_ENEMY_START_DISTANCE, MIN_PATROL_LENGTH, MIN_SPEAR_LENGTH } from './rules';
export type { PlaceContext, Placed, Placer, ValidateContext } from './types';

/** One placer per `EnemyDef.placement`; a new kind of geometry is a new entry here. */
export const PLACERS: Readonly<Record<PlacementKind, Placer>> = {
  point: pointPlacer,
  segment: segmentPlacer,
  reach: reachPlacer,
  decoy: decoyPlacer,
  line: linePlacer,
  gate: gatePlacer,
  pivot: pivotPlacer,
  crossing: crossingPlacer,
  niche: nichePlacer,
  flag: flagPlacer,
};
