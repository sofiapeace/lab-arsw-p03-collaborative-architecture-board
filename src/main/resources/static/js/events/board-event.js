// Browser-side factory for the collaboration envelope — Lab #6.
//
// This is the client mirror of the Java BoardEvent record, and the only place
// where the shape of a message is decided. Nothing else in the client builds
// an event literal, so a change to the contract (docs/event-contract.md) has a
// single place to land on this side.
//
// It knows the contract but not the transport: no STOMP destination, no
// serialization. That belongs to BoardRealtimeClient.
function envelope(type, boardId, actorId, payload) {
  return {
    eventId: crypto.randomUUID(),
    boardId,
    type,
    actorId,
    // ISO-8601 with an explicit zone, which is what Jackson needs to read it
    // back as an Instant on the server.
    occurredAt: new Date().toISOString(),
    payload
  };
}

// Only the fields each type actually uses are filled in; the rest travel as
// null so the payload keeps the same shape for every event type.
export const BoardEvents = {
  elementCreated(boardId, actorId, element) {
    return envelope('ELEMENT_CREATED', boardId, actorId, { element, elementId: element.id, x: null, y: null });
  },

  connectorCreated(boardId, actorId, connector) {
    return envelope('CONNECTOR_CREATED', boardId, actorId, { element: connector, elementId: connector.id, x: null, y: null });
  },

  elementUpdated(boardId, actorId, element) {
    return envelope('ELEMENT_UPDATED', boardId, actorId, { element, elementId: element.id, x: null, y: null });
  },

  // Absolute position on purpose, never a delta: a delta applied twice would
  // move the element twice, while re-applying a final position is a no-op.
  elementMoved(boardId, actorId, elementId, x, y) {
    return envelope('ELEMENT_MOVED', boardId, actorId, { element: null, elementId, x, y });
  },

  elementDeleted(boardId, actorId, elementId) {
    return envelope('ELEMENT_DELETED', boardId, actorId, { element: null, elementId, x: null, y: null });
  }
};
