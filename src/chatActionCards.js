import { ACTION_STATES } from './actionStateModel.js';

export function toActionCard(actionRecord) {
  const isApproved = actionRecord.currentState === ACTION_STATES.APPROVED;

  return {
    actionId: actionRecord.actionId,
    state: actionRecord.currentState,
    approvedPreviewReference: actionRecord.approvedPreviewReference,
    actions: {
      preview: { enabled: actionRecord.currentState === ACTION_STATES.DRAFT_CREATED },
      approve: { enabled: actionRecord.currentState === ACTION_STATES.PREVIEW_PRESENTED },
      reject: {
        enabled:
          actionRecord.currentState !== ACTION_STATES.PUBLISHED &&
          actionRecord.currentState !== ACTION_STATES.REJECTED,
      },
      publish: {
        enabled: isApproved,
        disabledReason: isApproved ? null : 'Publish requires approved state.',
      },
    },
  };
}

export function applyCardAction(store, { actionId, cardAction, payload, userId, sessionId }) {
  switch (cardAction) {
    case 'preview':
      return store.presentPreview({ actionId, previewPayload: payload, userId, sessionId });
    case 'approve':
      return store.approve({ actionId, userId, sessionId });
    case 'reject':
      return store.reject({ actionId, userId, sessionId, reason: payload?.reason });
    case 'publish':
      return store.publish({
        actionId,
        publishPayload: payload,
        approvedToken: payload?.approvedToken,
        userId,
        sessionId,
      });
    default:
      throw new Error(`Unsupported card action: ${cardAction}`);
  }
}
