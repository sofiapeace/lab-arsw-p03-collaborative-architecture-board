function uid(prefix) { return `${prefix}-${crypto.randomUUID()}`; }

// The single source of truth for local board state. Nothing outside this
// module mutates `board`/`selectedId`/`remote` directly; callers only get
// immutable snapshots (structuredClone) so the view can never corrupt state
// by editing what render() received.
export function createBoardState() {
  let board = { id: null, name: 'Architecture Board', elements: [] };
  let selectedId = null;
  let connectSourceId = null;
  let remote = { status: 'idle', lastAction: null, error: null };

  // Insert or replace by id. Lab #6 needs the "replace" half because a client
  // also receives back the events it published: the element is already there
  // locally, and the authoritative copy from the server must overwrite the
  // optimistic one instead of being appended as a duplicate.
  function upsert(element) {
    const incoming = structuredClone(element);
    const known = board.elements.some(e => e.id === incoming.id);
    board = known
      ? { ...board, elements: board.elements.map(e => e.id === incoming.id ? incoming : e) }
      : { ...board, elements: [...board.elements, incoming] };
  }

  // Drop an element together with every connector that referenced it, so the
  // board never holds a dangling connector (the backend Board invariant would
  // reject that state anyway). Also forgets it as selection/connection source,
  // which matters when the element was deleted by somebody else.
  function forget(elementId) {
    board = {
      ...board,
      elements: board.elements.filter(e =>
        e.id !== elementId && e.sourceId !== elementId && e.targetId !== elementId)
    };
    if (selectedId === elementId) selectedId = null;
    if (connectSourceId === elementId) connectSourceId = null;
  }

  return {
    snapshot() {
      // lastAction holds a closure (needed by the Retry button) — functions
      // are not structured-cloneable, so clone everything else and
      // reattach it by reference afterwards.
      const cloned = structuredClone({ board, selectedId, connectSourceId, remote: { status: remote.status, error: remote.error } });
      cloned.remote.lastAction = remote.lastAction;
      return cloned;
    },
    setBoard(next) { board = structuredClone(next); selectedId = null; connectSourceId = null; },
    setName(name) { board = { ...board, name }; },
    select(id) { selectedId = id; },
    setRemote(status, lastAction = null, error = null) { remote = { status, lastAction, error }; },

    addRectangle() {
      const e = { id: uid('rect'), type: 'RECTANGLE', x: 100 + board.elements.length * 12, y: 90 + board.elements.length * 12, width: 170, height: 70, text: 'Component', sourceId: null, targetId: null };
      board = { ...board, elements: [...board.elements, e] };
      selectedId = e.id;
      return e;
    },

    addText() {
      const e = { id: uid('text'), type: 'TEXT', x: 120, y: 210, width: 150, height: 30, text: 'Text', sourceId: null, targetId: null };
      board = { ...board, elements: [...board.elements, e] };
      selectedId = e.id;
      return e;
    },

    moveSelected(x, y) {
      // Immutable update: replace only the selected element, and only when
      // it is not a CONNECTOR (connectors have no x/y of their own — their
      // position is derived from source/target centers in the view).
      board = { ...board, elements: board.elements.map(e => e.id === selectedId && e.type !== 'CONNECTOR' ? { ...e, x, y } : e) };
    },

    beginConnect() { if (selectedId) connectSourceId = selectedId; },

    completeConnect(targetId) {
      // Only create a connector when both endpoints are set and different —
      // matches the domain's BoardElement invariant (sourceId/targetId
      // required and distinct for CONNECTOR).
      if (!connectSourceId || !targetId || connectSourceId === targetId) return null;
      const e = { id: uid('conn'), type: 'CONNECTOR', x: 0, y: 0, width: 0, height: 0, text: '', sourceId: connectSourceId, targetId };
      board = { ...board, elements: [...board.elements, e] };
      connectSourceId = null;
      selectedId = e.id;
      return e;
    },

    removeSelected() {
      if (!selectedId) return null;
      const removed = selectedId;
      forget(removed);
      return removed;
    },

    // Lab #6 — the arrival of a remote change is a state transition, never a
    // DOM mutation. The STOMP callback hands the event here and then asks the
    // view to re-render the resulting snapshot, so the SVG stays a projection
    // of the state and never becomes a second, divergent copy of it.
    //
    // Every case is idempotent on purpose. A client is subscribed to the same
    // topic it publishes to, so it receives its own accepted events back, and
    // a reconnection can replay one. Applying an event twice must leave the
    // board exactly as applying it once.
    applyEvent(event) {
      const payload = event?.payload;
      if (!event?.type || !payload) throw new Error('A BoardEvent requires a type and a payload');

      switch (event.type) {
        case 'ELEMENT_CREATED':
        case 'CONNECTOR_CREATED':
        case 'ELEMENT_UPDATED': {
          if (!payload.element?.id) throw new Error(`${event.type} requires payload.element`);
          upsert(payload.element);
          break;
        }

        case 'ELEMENT_MOVED': {
          const { elementId, x, y } = payload;
          if (!elementId || x == null || y == null) {
            throw new Error('ELEMENT_MOVED requires payload.elementId, payload.x and payload.y');
          }
          // The position is absolute, not a delta, which is what makes a
          // repeated MOVE harmless: re-applying the final position is a no-op.
          board = {
            ...board,
            elements: board.elements.map(e =>
              e.id === elementId && e.type !== 'CONNECTOR' ? { ...e, x, y } : e)
          };
          break;
        }

        case 'ELEMENT_DELETED': {
          if (!payload.elementId) throw new Error('ELEMENT_DELETED requires payload.elementId');
          // Already-gone is the expected outcome, so a repeated delete simply
          // finds nothing to remove.
          forget(payload.elementId);
          break;
        }

        default:
          throw new Error(`Unsupported BoardEvent type: ${event.type}`);
      }
    },

    toPersistedBoard() { return structuredClone(board); }
  };
}
