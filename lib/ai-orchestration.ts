import { randomUUID } from 'node:crypto';

import { AgentActionInput } from '@/lib/validation';

const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-1.5-pro';

interface AgentDraft {
  actionId: string;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
}

interface AgentReply {
  action: AgentActionInput['type'];
  status: 'queued' | 'draft_ready';
  instruction: string;
  receivedPayloadKeys: string[];
  preview: string;
  drafts: AgentDraft[];
}


async function maybeGeneratePreview(action: AgentActionInput): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const prompt = `You are a Meta Ads copilot. Create a short preview plan for action ${action.type} with payload ${JSON.stringify(action.payload)}. Keep to 2 sentences.`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });

    if (!response.ok) return null;

    const json = await response.json();
    return json?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } catch {
    return null;
  }
}
function resolveObjective(input: AgentActionInput): string {
  const objective = input.payload.objective;
  return typeof objective === 'string' ? objective : 'LEADS';
}

export async function orchestrateAgentAction(action: AgentActionInput): Promise<AgentReply> {
  const instructionMap: Record<AgentActionInput['type'], string> = {
    summarize: 'Summarize account performance and flag blockers.',
    recommend_budget: 'Propose spend changes while respecting hard limits.',
    draft_copy: 'Create ad copy variants tailored to best-performing angles.',
  };

  const objective = resolveObjective(action);
  const baseBudget = Number(action.payload.budget ?? 25000);
  const safeBudget = Number.isFinite(baseBudget) && baseBudget > 0 ? Math.round(baseBudget) : 25000;

  const drafts: AgentDraft[] = [
    {
      actionId: randomUUID(),
      title: 'Primary campaign draft',
      summary: `Draft campaign for objective ${objective} with conservative daily budget.`,
      payload: {
        entityType: 'campaign',
        name: `AI ${objective} Campaign`,
        budget: safeBudget,
        optimizationMode: 'daily',
        objective,
      },
    },
    {
      actionId: randomUUID(),
      title: 'Variant ad set draft',
      summary: 'Alternative ad set variant for comparison testing.',
      payload: {
        entityType: 'ad_set',
        name: `AI ${objective} Ad Set Variant`,
        budget: Math.max(1000, Math.round(safeBudget * 0.6)),
        optimizationMode: 'daily',
        audience: action.payload.audience ?? 'broad_it_services',
      },
    },
  ];

  const llmPreview = await maybeGeneratePreview(action);

  return {
    action: action.type,
    status: 'draft_ready',
    instruction: instructionMap[action.type],
    receivedPayloadKeys: Object.keys(action.payload),
    preview:
      llmPreview ??
      'Preview mode active: nothing will publish until you explicitly run preview, approve, then publish on a draft card.',
    drafts,
  };
}
