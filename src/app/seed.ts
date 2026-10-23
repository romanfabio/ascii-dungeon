const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Random 8-character, human-readable run seed (Crockford base32: no I, L, O, U). */
export function makeRunSeed(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let seed = '';
  for (const b of bytes) seed += CROCKFORD[b % 32];
  return seed;
}
