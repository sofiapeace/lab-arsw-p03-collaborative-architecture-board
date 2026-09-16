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
      if (!selectedId) return;
      const removed = selectedId;
      // Also drop any connector that referenced the removed element, so we
      // never leave a dangling connector (Board.validateConnectors on the
      // backend would reject it anyway when saving).
      board = { ...board, elements: board.elements.filter(e => e.id !== removed && e.sourceId !== removed && e.targetId !== removed) };
      selectedId = null;
    },

    toPersistedBoard() { return structuredClone(board); }
  };
}
