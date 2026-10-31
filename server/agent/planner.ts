import { AgentPlan, AgentPlanModel, AgentPlanStep } from './execution-state.js';
import { AgentToolRegistry } from './tool-registry.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export class AgentPlanner {
  constructor(private readonly model: AgentPlanModel, private readonly tools: AgentToolRegistry) {}

  async createPlan(task: string, signal?: AbortSignal): Promise<AgentPlan> {
    const raw = await this.model.plan(task, this.tools.plannerDescriptions(), signal);
    if (!isRecord(raw) || typeof raw.summary !== 'string' || !Array.isArray(raw.steps)) throw new Error('Gemini returned an invalid task plan.');
    if (raw.steps.length < 1 || raw.steps.length > 20) throw new Error('A task plan must contain between 1 and 20 steps.');

    const ids = new Set<string>();
    const steps: AgentPlanStep[] = raw.steps.map((candidate, index) => {
      if (!isRecord(candidate)) throw new Error(`Plan step ${index + 1} is invalid.`);
      const { id, title, tool, input, dependsOn, effect } = candidate;
      if (typeof id !== 'string' || !/^[a-z0-9_-]{1,50}$/i.test(id) || ids.has(id)) throw new Error(`Plan step ${index + 1} has an invalid or duplicate ID.`);
      if (typeof title !== 'string' || !title.trim() || title.length > 240) throw new Error(`Plan step ${id} has an invalid title.`);
      if (typeof tool !== 'string' || !this.tools.get(tool)) throw new Error(`Plan step ${id} selected an unavailable tool.`);
      if (!isRecord(input)) throw new Error(`Plan step ${id} has invalid tool input.`);
      if (!Array.isArray(dependsOn) || dependsOn.some((dependency) => typeof dependency !== 'string')) throw new Error(`Plan step ${id} has invalid dependencies.`);
      if (effect !== 'read' && effect !== 'write' && effect !== 'external') throw new Error(`Plan step ${id} has an invalid effect.`);
      ids.add(id);
      return { id, title: title.trim(), tool, input, dependsOn: [...new Set(dependsOn as string[])], effect };
    });

    for (const step of steps) {
      if (step.dependsOn.includes(step.id)) throw new Error(`Plan step ${step.id} cannot depend on itself.`);
      for (const dependency of step.dependsOn) if (!ids.has(dependency)) throw new Error(`Plan step ${step.id} has unknown dependency ${dependency}.`);
    }
    this.assertAcyclic(steps);
    const needsWebEvidence = this.requiresTinyFish(task);
    const tinyFishSearch = this.tools.get('tinyfish.search');
    if (needsWebEvidence && !tinyFishSearch) {
      throw new Error('TinyFish is required to answer this research or factual question, but it is not configured. Add a valid TinyFish API key in MINDORA Settings and try again.');
    }
    if (needsWebEvidence && !steps.some((step) => step.tool === 'tinyfish.search')) {
      if (steps.length >= 20) throw new Error('The plan is full and cannot include the required TinyFish search step.');
      const searchStep: AgentPlanStep = {
        id: 'tinyfish_required_search', title: 'Retrieve current sources with TinyFish', tool: 'tinyfish.search',
        input: { query: task.slice(0, 1000), purpose: 'Retrieve source data for Gemini to answer the user.' }, dependsOn: [], effect: 'read'
      };
      for (const step of steps) step.dependsOn = [...new Set([...step.dependsOn, searchStep.id])];
      steps.unshift(searchStep);
    }
    return { summary: raw.summary.trim().slice(0, 1000), steps };
  }

  private requiresTinyFish(task: string): boolean {
    const text = task.trim();
    if (/\b(open|click|type|fill|send|submit|create|delete|move|select|format|save|close)\b/i.test(text) && !/\b(research|look up|search the (?:web|internet))\b/i.test(text)) return false;
    return /\?|\b(research|look\s*up|search\s+(?:the\s+)?(?:web|internet)|find\s+(?:current|latest|sources|information)|latest|current|today|news|weather|stock price|exchange rate|who is|what is|how many|how much|where is|when did|compare)\b/i.test(text);
  }

  private assertAcyclic(steps: AgentPlanStep[]): void {
    const remaining = new Map(steps.map((step) => [step.id, new Set(step.dependsOn)]));
    const completed = new Set<string>();
    while (remaining.size) {
      const ready = [...remaining].filter(([, dependencies]) => [...dependencies].every((dependency) => completed.has(dependency)));
      if (!ready.length) throw new Error('Gemini returned a plan with circular dependencies.');
      for (const [id] of ready) { remaining.delete(id); completed.add(id); }
    }
  }
}
