/**
 * AG-UI State Manager
 * Tracks and emits state snapshots and deltas for frontend synchronization.
 * Manages pipeline status, predicted intents, and cognitive state.
 *
 * @module services/agui/state-manager
 */

export class AgUIStateManager {
  private states: Map<string, Record<string, unknown>> = new Map();

  getState(stateType: string): Record<string, unknown> | undefined {
    return this.states.get(stateType);
  }

  /**
   * Update a state and return both the full snapshot and the delta (changed keys only).
   */
  updateState(stateType: string, update: Record<string, unknown>): {
    snapshot: Record<string, unknown>;
    delta: Record<string, unknown>;
  } {
    const current = this.states.get(stateType) || {};
    const delta: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(update)) {
      if (JSON.stringify(current[key]) !== JSON.stringify(value)) {
        delta[key] = value;
      }
    }

    const snapshot = { ...current, ...update };
    this.states.set(stateType, snapshot);

    return { snapshot, delta };
  }

  clearState(stateType: string): void {
    this.states.delete(stateType);
  }

  /**
   * Pipeline status tracking — updates individual step status
   * within the 'pipeline_status' state type.
   */
  updatePipelineStep(
    step: string,
    status: 'pending' | 'running' | 'complete' | 'error',
    details?: Record<string, unknown>
  ): Record<string, unknown> {
    const pipeline = (this.states.get('pipeline_status') || { steps: {} }) as {
      steps: Record<string, unknown>;
    };
    pipeline.steps = {
      ...pipeline.steps,
      [step]: { status, ...details, updatedAt: Date.now() },
    };
    this.states.set('pipeline_status', pipeline);
    return pipeline;
  }
}
