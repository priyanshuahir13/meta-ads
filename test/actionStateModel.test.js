import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ActionStateStore, ACTION_STATES, hashPreviewPayload } from '../src/actionStateModel.js';
import { toActionCard } from '../src/chatActionCards.js';
import { publishCreativeEndpoint } from '../src/publishEndpoints.js';

function createStore() {
  const dir = mkdtempSync(join(tmpdir(), 'action-state-'));
  return new ActionStateStore(join(dir, 'db.json'));
}

test('full lifecycle requires approved token and matching hash', () => {
  const store = createStore();
  const payload = { adText: 'Big launch', budget: 5000 };

  const draft = store.createDraft({
    actionId: 'act-1',
    draftPayload: payload,
    userId: 'alice',
    sessionId: 'sess-1',
  });
  assert.equal(draft.currentState, ACTION_STATES.DRAFT_CREATED);

  const preview = store.presentPreview({
    actionId: 'act-1',
    previewPayload: payload,
    userId: 'alice',
    sessionId: 'sess-1',
  });
  assert.equal(preview.previewPayloadHash, hashPreviewPayload(payload));

  assert.throws(
    () =>
      publishCreativeEndpoint(store, {
        actionId: 'act-1',
        payload,
        approvedToken: 'wrong',
        userId: 'alice',
        sessionId: 'sess-1',
      }),
    /approved token\/reference is required/,
  );

  const approved = store.approve({ actionId: 'act-1', userId: 'reviewer', sessionId: 'sess-2' });
  assert.equal(approved.currentState, ACTION_STATES.APPROVED);
  assert.ok(approved.approvalToken);

  assert.throws(
    () =>
      publishCreativeEndpoint(store, {
        actionId: 'act-1',
        payload: { ...payload, budget: 6000 },
        approvedToken: approved.approvalToken,
        userId: 'alice',
        sessionId: 'sess-1',
      }),
    /payload hash mismatch/,
  );

  const published = publishCreativeEndpoint(store, {
    actionId: 'act-1',
    payload,
    approvedToken: approved.approvalToken,
    userId: 'alice',
    sessionId: 'sess-1',
  });

  assert.equal(published.currentState, ACTION_STATES.PUBLISHED);
  assert.equal(published.transitions.length, 4);
  for (const transition of published.transitions) {
    assert.ok(transition.timestamp);
    assert.ok(transition.userId);
    assert.ok(transition.sessionId);
  }
});

test('preview hash is immutable once previewed', () => {
  const store = createStore();
  const payload = { adText: 'Version A' };
  store.createDraft({ actionId: 'act-immutable', draftPayload: payload, userId: 'u1', sessionId: 's1' });
  store.presentPreview({ actionId: 'act-immutable', previewPayload: payload, userId: 'u1', sessionId: 's1' });

  assert.throws(
    () =>
      store.presentPreview({
        actionId: 'act-immutable',
        previewPayload: { adText: 'Version B' },
        userId: 'u1',
        sessionId: 's1',
      }),
    /Invalid transition from preview_presented to preview_presented/,
  );
});

test('chat action cards disable publish until approved', () => {
  const store = createStore();
  store.createDraft({ actionId: 'card-1', draftPayload: {}, userId: 'u1', sessionId: 's1' });

  let card = toActionCard(store.getAction('card-1'));
  assert.equal(card.actions.publish.enabled, false);

  store.presentPreview({ actionId: 'card-1', previewPayload: { x: 1 }, userId: 'u1', sessionId: 's1' });
  card = toActionCard(store.getAction('card-1'));
  assert.equal(card.actions.publish.enabled, false);

  store.approve({ actionId: 'card-1', userId: 'u2', sessionId: 's2' });
  card = toActionCard(store.getAction('card-1'));
  assert.equal(card.actions.publish.enabled, true);
});
