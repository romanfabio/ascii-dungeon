export const Tile = { Wall: 0, Floor: 1, Exit: 2 } as const;
export type TileType = (typeof Tile)[keyof typeof Tile];

export interface TileDef {
  glyph: string;
  walkable: boolean;
  opaque: boolean;
}

export const TILE_DEFS: Readonly<Record<TileType, TileDef>> = {
  [Tile.Wall]: { glyph: '#', walkable: false, opaque: true },
  [Tile.Floor]: { glyph: '.', walkable: true, opaque: false },
  [Tile.Exit]: { glyph: '!', walkable: true, opaque: false },
};

export function isWalkable(tile: number): boolean {
  return tile === Tile.Floor || tile === Tile.Exit;
}
