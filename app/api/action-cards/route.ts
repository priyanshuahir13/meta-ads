import { NextResponse } from 'next/server';
import { z } from 'zod';

import { toActionCard } from '@/lib/action-cards';
import { ActionStateStore } from '@/lib/action-state';
import { publishAdSet, publishCampaign } from '@/lib/endpoints/publish';

const store = new ActionStateStore(`${process.cwd()}/.data/action-state-db.json`);

const actionSchema = z.object({
  op: z.enum(['create_draft', 'present_preview', 'approve', 'reject', 'publish']),
  actionId: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
  userId: z.string().default('local-user'),
  sessionId: z.string().default('local-session'),
  approvedToken: z.string().optional(),
});

export async function POST(request: Request) {
  const json = await request.json();
  const parsed = actionSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const { op, actionId, payload, userId, sessionId, approvedToken } = parsed.data;

  try {
    if (op === 'create_draft') {
      const action = store.createDraft({ actionId, userId, sessionId, draftPayload: payload ?? {} });
      return NextResponse.json({ ok: true, card: toActionCard(action), action });
    }

    if (!actionId) {
      return NextResponse.json({ ok: false, error: 'actionId is required for this operation.' }, { status: 400 });
    }

    if (op === 'present_preview') {
      const action = store.presentPreview({ actionId, previewPayload: payload ?? {}, userId, sessionId });
      return NextResponse.json({ ok: true, card: toActionCard(action), action });
    }

    if (op === 'approve') {
      const action = store.approve({ actionId, userId, sessionId });
      return NextResponse.json({ ok: true, card: toActionCard(action), action });
    }

    if (op === 'reject') {
      const reason = typeof payload?.reason === 'string' ? payload.reason : 'Rejected by reviewer';
      const action = store.reject({ actionId, userId, sessionId, reason });
      return NextResponse.json({ ok: true, card: toActionCard(action), action });
    }

    const snapshot = store.getAction(actionId);
    const entityType = snapshot.draftPayload.entityType === 'ad_set' ? 'ad_set' : 'campaign';
    const budget = Number(snapshot.draftPayload.budget ?? 0);
    const optimizationMode = snapshot.draftPayload.optimizationMode === 'lifetime' ? 'lifetime' : 'daily';
    const name = typeof snapshot.draftPayload.name === 'string' ? snapshot.draftPayload.name : `Draft ${actionId}`;

    const publishResponse =
      entityType === 'ad_set'
        ? await publishAdSet({ budget, optimizationMode, name })
        : await publishCampaign({ budget, optimizationMode, name });

    if (!publishResponse.ok) {
      return NextResponse.json({ ok: false, error: publishResponse.error }, { status: 400 });
    }

    const action = store.publish({
      actionId,
      publishPayload: snapshot.draftPayload,
      approvedToken,
      userId,
      sessionId,
    });

    return NextResponse.json({ ok: true, card: toActionCard(action), action, publishResponse });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown action card error';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
