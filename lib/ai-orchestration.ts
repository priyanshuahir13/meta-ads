import { AgentActionInput } from "@/lib/validation";

export async function orchestrateAgentAction(action: AgentActionInput) {
  const instructionMap: Record<AgentActionInput["type"], string> = {
    summarize: "Generate a concise summary of performance drivers and blockers.",
    recommend_budget: "Recommend budget reallocations based on efficiency trends.",
    draft_copy: "Draft ad copy variants aligned to top performing hooks.",
  };

  return {
    action: action.type,
    status: "queued",
    instruction: instructionMap[action.type],
    receivedPayloadKeys: Object.keys(action.payload),
    note: "Hook this into your model provider and background job processor.",
  };
}
