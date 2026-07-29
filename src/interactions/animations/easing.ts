// Partagée par plusieurs sous-systèmes de interactions/animations/ (childSwap, lightColorSwap) et
// par le cœur one-shot dans objectAnimations.ts ("move") — un seul endroit plutôt que dupliquée.
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
