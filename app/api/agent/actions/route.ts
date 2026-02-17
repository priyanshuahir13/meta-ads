import { NextResponse } from "next/server";

import { orchestrateAgentAction } from "@/lib/ai-orchestration";
import { agentActionSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const json = await request.json();
  const parsed = agentActionSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await orchestrateAgentAction(parsed.data);
  return NextResponse.json(result);
}
