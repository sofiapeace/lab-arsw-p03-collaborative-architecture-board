# Architecture Evidence — Labs 04, 05 & 06

| Artifact | File | Content |
|---|---|---|
| ArchiMate Application View | [`diagrams.drawio`](diagrams.drawio) — page **"ArchiMate Application View"** | Web Client (BoardApp, BoardState, BoardView, BoardApiClient) → REST interface `/api/boards` → BoardRestController → BoardApplicationService → BoardRepository (port) → InMemoryBoardRepository → in-memory Board data |
| Class / module diagram | [`diagrams.drawio`](diagrams.drawio) — page **"Class Diagram"** | Client modules and their import direction, the backend classes and the domain model (`Board`, `BoardElement` with `sourceId`/`targetId`, `ElementType` including `CONNECTOR`) |
| REST contract | [`api-contract.md`](api-contract.md) | Endpoints, Board/element shapes, connector invariants and error codes |
| ADR-001 — repository boundary | [`../ADR-001-repository-boundary.md`](../ADR-001-repository-boundary.md) | Where the port/adapter boundary sits and who may depend on whom |
| ADR-002 — client boundaries | [`../ADR-002-client-boundaries.md`](../ADR-002-client-boundaries.md) | Why the client is split into API client, state and view |
| Event contract | [`../event-contract.md`](../event-contract.md) | STOMP destinations, the BoardEvent envelope, payload per event type and the rules the server enforces before broadcasting |
| ADR-003 — REST vs realtime | [`../ADR-003-rest-vs-realtime.md`](../ADR-003-rest-vs-realtime.md) | Why REST and WebSocket/STOMP coexist instead of one replacing the other |
| Visual evidence | [`../evidence/`](../evidence/) | Screenshots of a board with two connected elements, saved and reloaded |

Open `diagrams.drawio` with [draw.io](https://app.diagrams.net) (or the VS Code Draw.io extension). The file has two pages, selectable at the bottom of the editor.

## Quality rule

The diagrams describe the code that is actually delivered: every box matches a class or module that exists in this repository, and every arrow matches a real dependency (a Java reference, a JavaScript import, or the HTTP call from `BoardApiClient` to `/api/boards`). Framework classes and HTTP transport details (`ApiError`, `GlobalExceptionHandler`, the request DTOs) are deliberately left out — they do not explain the structure.
