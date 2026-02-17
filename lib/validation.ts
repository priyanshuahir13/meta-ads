import { z } from "zod";

export const agentActionSchema = z.object({
  type: z.enum(["summarize", "recommend_budget", "draft_copy"]),
  payload: z.record(z.unknown()).default({}),
});

export const metaProxySchema = z.object({
  path: z.string().min(1),
  method: z.enum(["GET", "POST", "DELETE"]).default("GET"),
  params: z.record(z.string()).optional(),
  body: z.record(z.unknown()).optional(),
});

export type AgentActionInput = z.infer<typeof agentActionSchema>;
export type MetaProxyInput = z.infer<typeof metaProxySchema>;
