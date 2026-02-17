import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const ACTION_STATES = {
  DRAFT_CREATED: 'draft_created',
  PREVIEW_PRESENTED: 'preview_presented',
  APPROVED: 'approved',
  PUBLISHED: 'published',
  REJECTED: 'rejected',
} as const;

export type ActionState = (typeof ACTION_STATES)[keyof typeof ACTION_STATES];

interface Transition {
  timestamp: string;
  fromState: ActionState | null;
  toState: ActionState;
  userId: string;
  sessionId: string;
  metadata: Record<string, unknown>;
}

export interface ActionRecord {
  actionId: string;
  currentState: ActionState;
  draftPayload: Record<string, unknown>;
  previewPayloadHash: string | null;
  approvalToken: string | null;
  approvedPreviewReference: string | null;
  transitions: Transition[];
}

interface StateDb {
  actions: Record<string, ActionRecord>;
}

const ALLOWED_TRANSITIONS = new Map<ActionState, Set<ActionState>>([
  [ACTION_STATES.DRAFT_CREATED, new Set([ACTION_STATES.PREVIEW_PRESENTED, ACTION_STATES.REJECTED])],
  [ACTION_STATES.PREVIEW_PRESENTED, new Set([ACTION_STATES.APPROVED, ACTION_STATES.REJECTED])],
  [ACTION_STATES.APPROVED, new Set([ACTION_STATES.PUBLISHED, ACTION_STATES.REJECTED])],
  [ACTION_STATES.PUBLISHED, new Set()],
  [ACTION_STATES.REJECTED, new Set()],
]);

function createTransition(params: Omit<Transition, 'timestamp'>): Transition {
  return {
    timestamp: new Date().toISOString(),
    ...params,
  };
}

function assertTransitionAllowed(fromState: ActionState, toState: ActionState): void {
  const allowed = ALLOWED_TRANSITIONS.get(fromState);
  if (!allowed?.has(toState)) {
    throw new Error(`Invalid transition from ${fromState} to ${toState}`);
  }
}

export function hashPreviewPayload(previewPayload: unknown): string {
  return createHash('sha256').update(JSON.stringify(previewPayload)).digest('hex');
}

export class ActionStateStore {
  private dbPath: string;
  private db: StateDb;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    this.db = this.load();
  }

  private load(): StateDb {
    if (!existsSync(this.dbPath)) {
      return { actions: {} };
    }

    const raw = readFileSync(this.dbPath, 'utf8');
    if (!raw.trim()) {
      return { actions: {} };
    }

    return JSON.parse(raw) as StateDb;
  }

  private save(): void {
    const folder = dirname(this.dbPath);
    if (!existsSync(folder)) {
      mkdirSync(folder, { recursive: true });
    }

    writeFileSync(this.dbPath, JSON.stringify(this.db, null, 2));
  }

  getAction(actionId: string): ActionRecord {
    const action = this.db.actions[actionId];
    if (!action) throw new Error(`Action not found: ${actionId}`);
    return structuredClone(action);
  }

  createDraft({ actionId = randomUUID(), userId, sessionId, draftPayload = {} as Record<string, unknown> }) {
    if (this.db.actions[actionId]) {
      throw new Error(`Action already exists: ${actionId}`);
    }

    const action: ActionRecord = {
      actionId,
      currentState: ACTION_STATES.DRAFT_CREATED,
      draftPayload,
      previewPayloadHash: null,
      approvalToken: null,
      approvedPreviewReference: null,
      transitions: [
        createTransition({
          fromState: null,
          toState: ACTION_STATES.DRAFT_CREATED,
          userId,
          sessionId,
          metadata: { reason: 'draft initialized' },
        }),
      ],
    };

    this.db.actions[actionId] = action;
    this.save();
    return structuredClone(action);
  }

  presentPreview({ actionId, previewPayload, userId, sessionId }: { actionId: string; previewPayload: unknown; userId: string; sessionId: string; }) {
    const action = this.db.actions[actionId];
    if (!action) throw new Error(`Action not found: ${actionId}`);

    assertTransitionAllowed(action.currentState, ACTION_STATES.PREVIEW_PRESENTED);
    const nextHash = hashPreviewPayload(previewPayload);
    if (action.previewPayloadHash && action.previewPayloadHash !== nextHash) {
      throw new Error('Preview hash is immutable once set. Create a new draft for changed payload.');
    }

    const fromState = action.currentState;
    action.currentState = ACTION_STATES.PREVIEW_PRESENTED;
    action.previewPayloadHash = action.previewPayloadHash ?? nextHash;
    action.transitions.push(
      createTransition({
        fromState,
        toState: ACTION_STATES.PREVIEW_PRESENTED,
        userId,
        sessionId,
        metadata: { previewPayloadHash: action.previewPayloadHash },
      }),
    );

    this.save();
    return structuredClone(action);
  }

  approve({ actionId, userId, sessionId }: { actionId: string; userId: string; sessionId: string; }) {
    const action = this.db.actions[actionId];
    if (!action) throw new Error(`Action not found: ${actionId}`);

    assertTransitionAllowed(action.currentState, ACTION_STATES.APPROVED);
    if (!action.previewPayloadHash) {
      throw new Error('Cannot approve without a preview payload hash.');
    }

    const fromState = action.currentState;
    action.currentState = ACTION_STATES.APPROVED;
    action.approvalToken = randomUUID();
    action.approvedPreviewReference = `preview:${action.actionId}:${action.previewPayloadHash}`;
    action.transitions.push(
      createTransition({
        fromState,
        toState: ACTION_STATES.APPROVED,
        userId,
        sessionId,
        metadata: {
          approvalToken: action.approvalToken,
          approvedPreviewReference: action.approvedPreviewReference,
        },
      }),
    );

    this.save();
    return structuredClone(action);
  }

  reject({ actionId, userId, sessionId, reason = 'Rejected by reviewer' }: { actionId: string; userId: string; sessionId: string; reason?: string; }) {
    const action = this.db.actions[actionId];
    if (!action) throw new Error(`Action not found: ${actionId}`);

    assertTransitionAllowed(action.currentState, ACTION_STATES.REJECTED);
    const fromState = action.currentState;
    action.currentState = ACTION_STATES.REJECTED;
    action.transitions.push(
      createTransition({
        fromState,
        toState: ACTION_STATES.REJECTED,
        userId,
        sessionId,
        metadata: { reason },
      }),
    );

    this.save();
    return structuredClone(action);
  }

  publish({ actionId, publishPayload, approvedToken, userId, sessionId }: { actionId: string; publishPayload: unknown; approvedToken?: string; userId: string; sessionId: string; }) {
    const action = this.db.actions[actionId];
    if (!action) throw new Error(`Action not found: ${actionId}`);

    if (!approvedToken || approvedToken !== action.approvalToken) {
      throw new Error('Publish blocked: valid approved token/reference is required.');
    }

    assertTransitionAllowed(action.currentState, ACTION_STATES.PUBLISHED);
    const publishHash = hashPreviewPayload(publishPayload);
    if (publishHash !== action.previewPayloadHash) {
      throw new Error('Publish blocked: payload hash mismatch with approved preview.');
    }

    const fromState = action.currentState;
    action.currentState = ACTION_STATES.PUBLISHED;
    action.transitions.push(
      createTransition({
        fromState,
        toState: ACTION_STATES.PUBLISHED,
        userId,
        sessionId,
        metadata: {
          publishPayloadHash: publishHash,
          approvedPreviewReference: action.approvedPreviewReference,
        },
      }),
    );

    this.save();
    return structuredClone(action);
  }
}
