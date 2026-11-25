/* Easing functions — pure, no dependencies. */
export type Ease =
  | 'linear'
  | 'ease'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'ease-out-quad'
  | 'ease-out-cubic'
  | 'ease-out-quart'
  | 'ease-out-expo';

export const EASE: Record<Ease, (u: number) => number> = {
  linear: (u) => u,
  ease: (u) => u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2,
  'ease-in': (u) => u * u,
  'ease-out': (u) => 1 - (1 - u) * (1 - u),
  'ease-in-out': (u) => u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2,
  'ease-out-quad': (u) => 1 - (1 - u) * (1 - u),
  'ease-out-cubic': (u) => 1 - Math.pow(1 - u, 3),
  'ease-out-quart': (u) => 1 - Math.pow(1 - u, 4),
  'ease-out-expo': (u) => (u === 1 ? 1 : 1 - Math.pow(2, -10 * u)),
};