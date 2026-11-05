import { effect } from '../src/index.ts'

/**
 * Synchronize a computed readout with the signals read by update.
 * Runs immediately; dispose stops tracking. Use bind(signal, input) for inputs,
 * not for computed text, classes, progress bars or disabled states.
 */
export function wireShowcase(update: () => void): () => void {
  return effect(update)
}
