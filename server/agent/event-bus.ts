import { AgentEvent } from './execution-state.js';

export type AgentEventListener = (event: AgentEvent) => void;

export class AgentEventBus {
  private readonly listeners = new Set<AgentEventListener>();

  subscribe(listener: AgentEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  publish(event: AgentEvent): void {
    for (const listener of this.listeners) {
      try { listener(event); }
      catch { /* A UI subscriber must not interrupt task execution. */ }
    }
  }
}
