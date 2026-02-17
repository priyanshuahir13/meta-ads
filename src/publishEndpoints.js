export function publishCreativeEndpoint(store, request) {
  const { actionId, payload, approvedToken, userId, sessionId } = request;
  return store.publish({
    actionId,
    publishPayload: payload,
    approvedToken,
    userId,
    sessionId,
  });
}
