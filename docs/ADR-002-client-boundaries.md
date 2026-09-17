# ADR-002 — Client Boundaries

# Status
Accepted

# Context

Lab #5 adds an interactive web client to the Lab #4 backend. The client has to create/load a Board, add RECTANGLE and TEXT elements, select and move them, connect two of them with a CONNECTOR, delete them, and save the whole Board through the existing REST API, showing loading, success and error states with a Retry action.

Without an explicit decision, the easy path is a single script where click handlers call `fetch`, mutate SVG nodes directly and read the "current board" back from the DOM. That design has three problems that matter for this course:

- The DOM becomes the source of truth, so saving means scraping SVG attributes, and any rendering bug silently corrupts data.
- HTTP details (URLs, status codes, error JSON) leak into every handler, so error handling is inconsistent.
- Lab #6 will add WebSocket/STOMP updates coming from other users. Those updates must be applied to the same Board that local interactions modify; if state lives in the DOM or inside click handlers there is no single place to apply them.

The backend must also stay unaware of the client: the lab forbids adding DOM/SVG/interaction concepts or endpoints such as `/moveElement` to the Controller, Application Service or domain.

# Decision

The client is split into four ES modules with one responsibility each and dependencies in a single direction (no cycles):

```
BoardApp (static/js/app.js)                 — orchestration only
  |----> BoardApiClient (js/api/board-api-client.js) ----HTTP/JSON----> /api/boards
  |----> BoardState     (js/state/board-state.js)
  '----> BoardView      (js/ui/board-view.js) ----> SVG / DOM
```

- **`BoardApiClient` is the only module that calls `fetch`.** It exposes `create(name)`, `load(id)` and `save(board)`, which map 1:1 to `POST`, `GET` and `PUT /api/boards`. It receives and returns plain Board objects and translates every non-2xx response into a `BoardApiError { status, code, message }` built from the backend `ApiError`. It never touches the DOM or the state. It also rejects a blank board id before calling the network.
- **`BoardState` is the single source of truth.** It holds the current `board`, `selectedId`, the connect interaction (`connectSourceId`) and the remote operation status `{ status, lastAction, error }`. All interactions (`addRectangle`, `addText`, `moveSelected`, `beginConnect`/`completeConnect`, `removeSelected`) are local operations with immutable updates. It enforces the same connector rules as the domain before they reach the server: it creates a connector only between two different elements, and removes connectors that referenced a deleted element. It exposes `snapshot()` (a `structuredClone` copy) so no caller can mutate internal state by accident, and `toPersistedBoard()` for saving. It knows nothing about HTTP or the DOM.
- **`BoardView` is a projection of a snapshot.** `render(snapshot)` clears the `<svg>` and rebuilds it: RECTANGLE as `<g><rect><text>`, TEXT as `<text>`, CONNECTOR as a `<line>` between the centers of its source and target, each node tagged with `data-id`. Pointer events are translated into intents (`select`, `move`, `connectTarget`) and handed to callbacks registered with `on(...)`; the view never modifies the Board or decides what to persist.
- **`BoardApp` wires the three.** Each user action follows the same flow: change `BoardState` → `view.render(state.snapshot())`. Remote calls go through one `remote(label, action)` helper that sets `loading`, disables incompatible buttons, ignores a new remote action while one is in flight, sets `success`/`error`, and stores the failed action as `lastAction` so **Retry** can re-run it. Saving is only triggered by the explicit **Save** button (one `PUT` with the full Board), never on every pixel of a drag.

On the backend, the only change is in the domain model (`ElementType.CONNECTOR`, `BoardElement.sourceId/targetId`, `Board.validateConnectors`). No endpoint, controller or service method was added for the client.

# Consequences

Positive:

- **The Board can be saved without reading the DOM.** `Save` sends `state.toPersistedBoard()`, and `Load` replaces the state and re-renders. Saving then reloading gives back the same Board because the view is only drawn from the state.
- **Error handling is uniform.** Every failure reaches `BoardApp` as a `BoardApiError` whose `message` comes from the backend `ApiError`, so the view shows messages such as "Connector c2 cannot reference another connector" without knowing Java exceptions exist.
- **Retry is generic.** `lastAction` is a closure over the failed remote call, so the same button retries a failed create, load or save.
- **It is ready for Lab #6.** A WebSocket message can be applied as another `BoardState` operation followed by `render`, without touching `BoardApiClient` or `BoardView`.
- **The backend stayed thin.** Controller and service are unchanged since Lab #4; the new rules live in the domain, where they also protect any future client.

# Trade-off

- **Full re-render on every change.** `render()` rebuilds the whole SVG, including on every `pointermove` during a drag. That is simple and keeps the DOM from drifting away from the state, but it does not scale to boards with thousands of elements. We accept it because the lab board is small and correctness of the projection matters more than performance here.
- **Snapshots cost copies.** `structuredClone` copies the whole Board on every `snapshot()`. It also forced a workaround: `lastAction` is a function and functions are not structured-cloneable, so `snapshot()` clones everything else and re-attaches `lastAction` by reference (this bug broke every button on first use until it was fixed).
- **Validation is duplicated on purpose.** Connector rules exist in `BoardState` (for immediate feedback) and in the backend domain (the authority). The client's copy can drift from the backend's; if it does, the backend still rejects the save with `INVALID_INPUT` and the client shows the message.
- **Whole-board PUT.** Replacing the entire Board on save is the simplest contract and needs no new endpoints, but "last save wins" if two tabs edit the same Board. That concurrency problem is explicitly deferred to Labs #6/#7.
- **No framework and no frontend test runner**, as required by the lab. Module boundaries are enforced by convention and review, not by a tool.

# Evidence / validation

- `grep -rn "fetch(" src/main/resources/static/js` returns matches **only** in `js/api/board-api-client.js` (3 calls: create, load, save).
- `board-view.js` has no import of `board-api-client.js` or `board-state.js`; it only receives snapshots and emits callbacks. `board-state.js` imports nothing.
- `app.js` is the only module importing the other three.
- `mvn test` passes with 12 tests: `BoardApplicationServiceTest` (4), `BoardRestControllerTest` (5), `BoardConnectorTest` (3: valid connector, connector to a missing element, connector to another connector).
- Manual HTTP check against the running server (`mvn spring-boot:run`): a `PUT` with RECTANGLE + TEXT + CONNECTOR returns `200` and a later `GET` returns the same three elements; a connector to a missing element, to itself, to another connector, or a RECTANGLE with `sourceId` each return `400 INVALID_INPUT` with a descriptive `message` (recorded in `docs/architecture/api-contract.md`).
- Visual evidence: screenshot/GIF of a loaded Board with two connected elements, saved and reloaded (see `docs/evidence/`).
