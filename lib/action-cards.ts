import { ACTION_STATES, ActionRecord } from '@/lib/action-state';

export interface ActionCard {
  actionId: string;
  state: ActionRecord['currentState'];
  approvedPreviewReference: string | null;
  approvalToken: string | null;
  actions: {
    preview: { enabled: boolean };
    approve: { enabled: boolean };
    reject: { enabled: boolean };
    publish: { enabled: boolean; disabledReason: string | null };
  };
}

export function toActionCard(actionRecord: ActionRecord): ActionCard {
  const isApproved = actionRecord.currentState === ACTION_STATES.APPROVED;

  return {
    actionId: actionRecord.actionId,
    state: actionRecord.currentState,
    approvedPreviewReference: actionRecord.approvedPreviewReference,
    approvalToken: actionRecord.approvalToken,
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
