/**
 * GWT Ignition Mechanism
 *
 * Based on: Nature 2025 (Adversarial Testing of GNW) and Frontiers 2025
 *
 * Ignition = non-linear threshold transition. Activation exceeding theta_GWT
 * broadcasts globally (winner-takes-all + broadcast). Below threshold =
 * suppressed (no workspace access).
 *
 * Addition: Hysteresis mechanism (different activate/deactivate thresholds)
 * prevents oscillation at the boundary — a real-world stability requirement
 * not present in the original GWT formalization.
 *
 * Broadcast(x) = 1[Activation(x) > theta_GWT] * GlobalBroadcast(x)
 */

export interface ModuleActivation {
  id: string;
  activation: number;
}

export interface IgnitionResult {
  broadcast: string[];
  suppressed: string[];
  ignitionLog: Array<{ moduleId: string; activation: number; decision: 'broadcast' | 'suppress' }>;
}

export interface IgnitionConfig {
  /** Activation threshold for broadcast */
  activationThreshold: number;
  /** Deactivation threshold (hysteresis: lower than activation) */
  deactivationThreshold: number;
}

export const IGNITION_DEFAULTS: IgnitionConfig = {
  activationThreshold: 0.5,
  deactivationThreshold: 0.3,
};

/**
 * Simple ignition: binary threshold, no hysteresis.
 */
export function evaluateIgnition(
  modules: ModuleActivation[],
  config: IgnitionConfig = IGNITION_DEFAULTS,
): IgnitionResult {
  const broadcast: string[] = [];
  const suppressed: string[] = [];
  const ignitionLog: IgnitionResult['ignitionLog'] = [];

  for (const mod of modules) {
    if (mod.activation >= config.activationThreshold) {
      broadcast.push(mod.id);
      ignitionLog.push({ moduleId: mod.id, activation: mod.activation, decision: 'broadcast' });
    } else {
      suppressed.push(mod.id);
      ignitionLog.push({ moduleId: mod.id, activation: mod.activation, decision: 'suppress' });
    }
  }

  return { broadcast, suppressed, ignitionLog };
}

/**
 * Ignition with hysteresis: modules that were previously broadcasting
 * only need to exceed the lower deactivation threshold to stay active.
 * New modules need to exceed the higher activation threshold.
 *
 * This prevents oscillation at the boundary and provides stable workspace
 * composition across consecutive reasoning steps.
 */
export function evaluateIgnitionWithHysteresis(
  modules: ModuleActivation[],
  previouslyBroadcasting: string[],
  config: IgnitionConfig = IGNITION_DEFAULTS,
): IgnitionResult {
  const broadcast: string[] = [];
  const suppressed: string[] = [];
  const ignitionLog: IgnitionResult['ignitionLog'] = [];

  const prevSet = new Set(previouslyBroadcasting);

  for (const mod of modules) {
    const threshold = prevSet.has(mod.id)
      ? config.deactivationThreshold
      : config.activationThreshold;

    if (mod.activation >= threshold) {
      broadcast.push(mod.id);
      ignitionLog.push({ moduleId: mod.id, activation: mod.activation, decision: 'broadcast' });
    } else {
      suppressed.push(mod.id);
      ignitionLog.push({ moduleId: mod.id, activation: mod.activation, decision: 'suppress' });
    }
  }

  return { broadcast, suppressed, ignitionLog };
}
