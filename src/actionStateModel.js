import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export const ACTION_STATES = Object.freeze({
  DRAFT_CREATED: 'draft_created',
  PREVIEW_PRESENTED: 'preview_presented',
  APPROVED: 'approved',
  PUBLISHED: 'published',
  REJECTED: 'rejected',
});

const ALLOWED_TRANSITIONS = new Map([
  [ACTION_STATES.DRAFT_CREATED, new Set([ACTION_STATES.PREVIEW_PRESENTED, ACTION_STATES.REJECTED])],
  [ACTION_STATES.PREVIEW_PRESENTED, new Set([ACTION_STATES.APPROVED, ACTION_STATES.REJECTED])],
  [ACTION_STATES.APPROVED, new Set([ACTION_STATES.PUBLISHED, ACTION_STATES.REJECTED])],
  [ACTION_STATES.REJECTED, new Set([])],
  [ACTION_STATES.PUBLISHED, new Set([])],
]);

export function hashPreviewPayload(previewPayload) {
  return createHash('sha256').update(JSON.stringify(previewPayload)).digest('hex');
}

function nowIso() {
  return new Date().toISOString();
}

function createTransition({ fromState, toState, userId, sessionId, timestamp = nowIso(), metadata = {} }) {
  return {
    fromState,
    toState,
    userId,
    sessionId,
    timestamp,
    metadata,
  };
}

function assertTransitionAllowed(fromState, toState) {
  const allowedTargets = ALLOWED_TRANSITIONS.get(fromState);
  if (!allowedTargets || !allowedTargets.has(toState)) {
    throw new Error(`Invalid transition from ${fromState} to ${toState}`);
  }
}

export class ActionStateStore {
  constructor(dbPath = '.data/action-state-db.json') {
    this.dbPath = dbPath;
    this.db = this.load();
  }

  load() {
    if (!existsSync(this.dbPath)) {
      return { actions: {} };
    }

    const raw = readFileSync(this.dbPath, 'utf8');
    if (!raw.trim()) {
      return { actions: {} };
    }

    return JSON.parse(raw);
  }

  save() {
    writeFileSync(this.dbPath, JSON.stringify(this.db, null, 2));
  }

  getAction(actionId) {
    const action = this.db.actions[actionId];
    if (!action) {
      throw new Error(`Action not found: ${actionId}`);
    }

    return structuredClone(action);
  }

  createDraft({ actionId = randomUUID(), userId, sessionId, draftPayload = {} }) {
    if (this.db.actions[actionId]) {
      throw new Error(`Action already exists: ${actionId}`);
    }

    const action = {
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

  presentPreview({ actionId, previewPayload, userId, sessionId }) {
    const action = this.db.actions[actionId];
    if (!action) throw new Error(`Action not found: ${actionId}`);

    assertTransitionAllowed(action.currentState, ACTION_STATES.PREVIEW_PRESENTED);
    const nextHash = hashPreviewPayload(previewPayload);

    if (action.previewPayloadHash && action.previewPayloadHash !== nextHash) {
      throw new Error('Preview hash is immutable once set. Create a new draft for changed payload.');
    }

    action.previewPayloadHash = action.previewPayloadHash ?? nextHash;
    const fromState = action.currentState;
    action.currentState = ACTION_STATES.PREVIEW_PRESENTED;
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

  approve({ actionId, userId, sessionId }) {
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

  reject({ actionId, userId, sessionId, reason = 'Rejected by reviewer' }) {
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

  publish({ actionId, publishPayload, approvedToken, userId, sessionId }) {
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
