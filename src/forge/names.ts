import type { Rng } from '../lib/rng';

const FIRST = ['Northwind', 'Bright', 'Maple', 'Copper', 'Harbor', 'Juniper', 'Quartz', 'Lumen', 'Cedar', 'Summit', 'Tidal', 'Willow', 'Ember', 'Atlas', 'Pixel', 'Orchard'] as const;
const SECOND = ['Studio', 'Labs', 'Goods', 'Academy', 'Supply', 'Collective', 'Works', 'Digital', 'Co', 'Media', 'Market', 'Club'] as const;

export function sellerName(rng: Rng): { name: string; initials: string } {
  const first = rng.pick(FIRST);
  const second = rng.pick(SECOND);
  return { name: `${first} ${second}`, initials: first[0]! + second[0]! };
}
