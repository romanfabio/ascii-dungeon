import { describe, expect, it } from 'vitest';
import { BESTIARY_TYPES, bestiaryEntry, isBestiaryType, typesMet } from './bestiary';
import { ENEMY_DEFS, ENEMY_TYPE_IDS } from './enemy-defs';
import { parseMap } from './floor-map';
import { createGameState, type GameState } from './game-state';
import { applyAction } from './turn';

function game(map: string[]): GameState {
  return createGameState('BES', parseMap(map), { sightRadius: 6 });
}

describe('the Bestiary entries', () => {
  it('has one for every type but the Breeder young, in unlock order', () => {
    expect(BESTIARY_TYPES).toHaveLength(ENEMY_TYPE_IDS.length - 1);
    expect(BESTIARY_TYPES).not.toContain('brood');
    const floors = BESTIARY_TYPES.map((id) => ENEMY_DEFS[id].minFloor);
    expect(floors).toEqual([...floors].sort((a, b) => a - b));
    expect(BESTIARY_TYPES[0]).toBe('bloodstone');
    expect(BESTIARY_TYPES[BESTIARY_TYPES.length - 1]).toBe('breeder');
  });

  it('reads the young as the Breeder and knows which names are entries', () => {
    expect(bestiaryEntry('brood')).toBe('breeder');
    expect(bestiaryEntry('ghost')).toBe('ghost');
    expect(isBestiaryType('ghost')).toBe(true);
    expect(isBestiaryType('brood')).toBe(false);
    expect(isBestiaryType('dragon')).toBe(false);
  });
});

describe('typesMet', () => {
  it('counts an enemy that comes into view', () => {
    const wall = '#'.repeat(20);
    const s = game([wall, '#@........x.......!#', wall]);
    let met: string[] = [];
    for (let i = 0; i < 4 && met.length === 0; i++) {
      met = typesMet(s, applyAction(s, { type: 'move', dir: 'E' }));
    }
    expect(met).toEqual(['bloodstone']); // from the moment it is in view, not before
  });

  it('counts one that touches you', () => {
    const s = game(['#######', '#@x..!#', '#######']);
    s.sightRadius = 1;
    const events = applyAction(s, { type: 'move', dir: 'E' });
    expect(events.map((e) => e.type)).toContain('hitEnemy');
    expect(typesMet(s, events)).toContain('bloodstone');
  });

  it('does not count a Mimic that is only seen, but does once it reveals itself', () => {
    const wall = '#'.repeat(20);
    const s = game([wall, '#@........m.......!#', wall]);
    let sighted = false;
    let revealed: BestiaryResult = [];
    for (let i = 0; i < 7 && revealed.length === 0; i++) {
      const events = applyAction(s, { type: 'move', dir: 'E' });
      if (events.some((e) => e.type === 'enemySighted')) sighted = true;
      revealed = typesMet(s, events);
      if (!revealed.includes('mimic')) expect(revealed).toEqual([]); // seen, but still a pickup
    }
    expect(sighted).toBe(true);
    expect(revealed).toEqual(['mimic']);
  });

  it('counts a hidden Lurker only when it shows itself', () => {
    const wall = '#'.repeat(14);
    const s = game([wall, '#@..........!#', '#####l########', '#####.########', wall]);
    for (let i = 0; i < 3; i++)
      expect(typesMet(s, applyAction(s, { type: 'move', dir: 'E' }))).toEqual([]);
    expect(typesMet(s, applyAction(s, { type: 'move', dir: 'E' }))).toEqual(['lurker']);
  });
});

type BestiaryResult = ReturnType<typeof typesMet>;
