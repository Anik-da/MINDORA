import { AgentExecutionContext, AgentTool, AgentToolResult } from './execution-state.js';

export class AgentToolRegistry {
  private readonly tools = new Map<string, AgentTool>();

  register(tool: AgentTool): void {
    if (!/^[a-z][a-z0-9_.-]{1,80}$/i.test(tool.id)) throw new Error('Tool ID is invalid.');
    if (this.tools.has(tool.id)) throw new Error(`Tool is already registered: ${tool.id}`);
    this.tools.set(tool.id, tool);
  }

  get(id: string): AgentTool | undefined { return this.tools.get(id); }
  list(): AgentTool[] { return [...this.tools.values()]; }
  plannerDescriptions(): Array<{ id: string; description: string; capability: 'read' | 'write' }> {
    return this.list().map(({ id, description, capability }) => ({ id, description, capability }));
  }

  async execute(id: string, input: Record<string, unknown>, context: AgentExecutionContext): Promise<AgentToolResult> {
    const tool = this.tools.get(id);
    if (!tool) throw new Error(`Unknown tool: ${id}`);
    return tool.execute(input, context);
  }
}
