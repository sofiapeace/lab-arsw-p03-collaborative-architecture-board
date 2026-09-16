export class BoardApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function parse(response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new BoardApiError(response.status, payload?.code ?? 'HTTP_ERROR', payload?.message ?? `HTTP ${response.status}`);
  }
  return payload;
}

// The only module allowed to talk HTTP. It receives/returns plain data
// (board DTOs) and never touches the DOM or the local state.
export const BoardApiClient = {
  async create(name) {
    const response = await fetch('/api/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    return parse(response);
  },

  async load(id) {
    // Validate before calling fetch: an empty/blank id would still build a
    // syntactically valid URL (/api/boards/) and hit the wrong endpoint,
    // so we fail fast with a clear, consistent BoardApiError instead.
    if (!id || !id.trim()) {
      throw new BoardApiError(400, 'INVALID_BOARD_ID', 'Board id is required to load a board.');
    }
    const response = await fetch(`/api/boards/${encodeURIComponent(id)}`);
    return parse(response);
  },

  async save(board) {
    // PUT the complete board state (name + elements) — the backend contract
    // only exposes create/get/replace, there is no partial /move or /draw
    // endpoint to invent here.
    const response = await fetch(`/api/boards/${encodeURIComponent(board.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: board.name, elements: board.elements })
    });
    return parse(response);
  }
};
