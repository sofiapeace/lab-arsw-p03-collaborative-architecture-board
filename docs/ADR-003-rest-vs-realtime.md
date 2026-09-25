# ADR-003 — REST and WebSocket/STOMP Coexist

# Status
Accepted

# Context

Lab #6 turns the single-user board of Lab #5 into a collaborative one: two or
more browsers loading the same `boardId` must see each other's changes without
reloading. Lab #5 already delivers create/load/snapshot over three REST
endpoints (`POST`, `GET`, `PUT /api/boards`), and `BoardApiClient` is the only
client module that calls `fetch`.

Once a WebSocket is available, the obvious temptation is to move everything
onto it: a single connection, a single protocol, no duplicated concepts. The
opposite temptation — keeping REST alone and polling — is equally available and
equally wrong for this lab.

Three forces decide this:

- **A client that arrives needs the whole board, not the next change.** A STOMP
  subscription only delivers what happens from the moment it is established. It
  has no answer for "what does board X look like right now".
- **The two interactions have different shapes.** Bootstrap and snapshot are
  request/response with a caller waiting for an answer and an error to show.
  Live collaboration is fire-and-forget fan-out to an unknown set of
  subscribers, with no reply.
- **The lab forbids hiding the problem.** Authentication, presence, history,
  Redis, Kafka and CRDT/OT are out of scope, and simultaneous-update
  consistency is explicitly deferred to Lab #7. Whatever we choose must leave
  that problem visible rather than accidentally solved.

There is also a constraint inherited from ADR-002: the backend must stay
unaware of client concerns, and no endpoint such as `/moveElement` may appear.

# Decision

**The two transports coexist, split by responsibility, over one shared
application boundary and one authoritative Board.**

```text
REST   /api/boards          -> BoardApplicationService      --\
                                                               >-- BoardRepository -> Board
STOMP  /app/boards/{id}/... -> BoardEventApplicationService --/
                                  |
                                  v
                            /topic/boards/{id}
```

- **REST owns bootstrap and snapshot.** Creating a board, loading it and saving
  it stay exactly as delivered in Lab #5. `BoardApiClient` is untouched.
- **STOMP owns live changes.** `BoardRealtimeClient` subscribes to
  `/topic/boards/{boardId}` and publishes to `/app/boards/{boardId}/events`.
  It is the only browser module that knows STOMP exists — connection,
  destinations and serialization are all confined to it, and it exposes
  `topic()` so the UI can display the destination without building it.
- **Clients publish to `/app`, never to `/topic`.** This is the load-bearing
  part of the decision. Sending to `/topic` would let the broker relay a
  message straight to the other subscribers: nothing validated, nothing saved,
  and a server that is a blind loudspeaker. The `/app` prefix routes the
  message to `BoardWebSocketController`, which hands it to
  `BoardEventApplicationService`, which applies it to the authoritative Board
  and saves it. Only the accepted, normalized event is broadcast.
- **Neither transport knows the other.** `WebSocketConfig` is a separate
  `@Configuration` from anything REST. `BoardWebSocketController` is the exact
  counterpart of `BoardRestController`: a transport adapter that owns no state,
  touches no repository and builds no domain object.
- **One wire format.** `WebSocketConfig` reuses the `ObjectMapper` Spring Boot
  configures for REST, so a `Board` or an `Instant` is serialized identically
  on both channels.
- **The contract is not the domain.** `BoardEvent` lives in `application/event`
  and describes communication between participants; `Board` and `BoardElement`
  keep describing the problem state. No message becomes a domain entity.

Rejected alternatives:

- **STOMP only.** The initial load would have to be re-invented as a
  request/response over messaging (send "give me board X", wait for a reply on
  a private destination). That is a worse REST, built by hand, with no status
  codes and no cacheability, and it would delete a working part of Lab #5 for
  nothing.
- **REST only, with polling.** Correct but wasteful and visibly laggy, and it
  answers none of the acceptance criteria about propagation "without
  reloading".
- **Writing through REST and using STOMP only to notify.** Every change would
  cost an HTTP round trip plus a broadcast, and each client would then have to
  re-`GET` the board. It doubles the traffic and still leaves the same
  consistency question.

# Consequences

Positive:

- **Bootstrap has an owner.** A client loads the board over REST, then
  subscribes. Step 9 of the demo — reload a browser and recover the state — is
  answered by the transport that was designed for it.
- **The failure modes are separated.** If the socket drops, create/load/save
  keep working; if the HTTP call fails, `Retry` from Lab #5 still applies. The
  UI reports the two statuses independently (`REST:` and `LIVE:`).
- **Validation cannot be bypassed.** Every live change goes through an
  application service before reaching any subscriber, so the rules already
  written in the domain (no duplicate ids, no dangling connectors) also govern
  collaboration. A refused event reaches nobody.
- **Session isolation is structural, not conditional.** One destination per
  board plus the destination-versus-envelope check in the controller means a
  board never receives another board's events. Verified with three windows.
- **Lab #7 has a clean target.** The concurrency problem is concentrated in one
  method, `BoardEventApplicationService.apply`, instead of being spread over
  two write paths.

Negative:

- **Two write paths into the same Board.** `PUT /api/boards/{id}` replaces the
  whole board while events mutate it incrementally. A snapshot saved from a
  stale client can overwrite changes that arrived by STOMP in the meantime.
- **More moving parts.** Two configurations, two controllers, two client
  modules and two contracts to keep aligned.
- **A new failure mode the UI must express.** "Connected but not live" did not
  exist in Lab #5.

# Trade-off

- **Last write wins, deliberately.** `apply()` is a read-modify-write with no
  lock, no version and no atomicity. Two events applied concurrently can lose
  one another. We accept this and documented it in the class Javadoc rather
  than adding synchronization, because Lab #7 needs the defect to be reachable.
  Hiding it now with premature complexity would be the worse engineering
  choice, and the lab says so explicitly.
- **No event history.** The broker replays nothing, so a client that
  disconnects misses everything published meanwhile and must reload the
  snapshot over REST to catch up. Event history is out of scope for this lab;
  the REST snapshot is the recovery mechanism, which is one more reason the two
  transports coexist.
- **The simple in-memory broker does not scale past one instance.** With two
  application instances, subscribers on one would not see events applied on the
  other. A relay such as RabbitMQ or Redis would fix it and is explicitly out
  of scope.
- **The `actorId` is unauthenticated.** It is client-generated and only
  informational; no rule depends on it. Authentication is out of scope.
- **Optimistic local application.** An interaction is applied locally before
  the server accepts it, so a rejected event leaves that one client showing
  something the server refused until it reloads. We accept it for
  responsiveness; the authoritative copy overwrites the optimistic one whenever
  the event is accepted.

# Evidence / validation

- **Only the STOMP adapter broadcasts.**
  `grep -rn "convertAndSend" src/main/java` returns exactly one line, in
  `BoardWebSocketController`.
- **The protocol did not leak into the domain.**
  `grep -rn "BoardEvent" src/main/java/edu/eci/arsw/collabboard/domain` returns
  nothing, and `grep -rn "import edu.eci.arsw.collabboard.infrastructure"` over
  `domain/` and `application/` returns nothing.
- **The transports stay separated in the browser.**
  `grep -rn "fetch(" static/js` matches only `api/board-api-client.js`;
  the STOMP destinations `/app/boards/...` and `/topic/boards/...` are built
  only inside `realtime/board-realtime-client.js`.
- **Accepted messages pass through an application service before broadcast.**
  `BoardWebSocketControllerTest` (5 tests) asserts the broadcast destination
  and normalized payload, that the board is updated before the broadcast, and
  silence on a mismatched board, a rejected event and an unknown board.
- **The transitions and the contract are covered.**
  `BoardEventApplicationServiceTest` (15 tests) covers the five event types,
  the contract validations, idempotence of a repeated `MOVED`, the cascade on
  delete, and that a rejected event leaves the board untouched.
  `BoardEventContractTest` (4 tests) parses the exact JSON emitted by
  `js/events/board-event.js`; it is what detected the numeric `occurredAt`
  divergence described in [`event-contract.md`](event-contract.md).
- **`mvn test` passes with 36 tests** (12 of which are the Lab #4/#5
  regression suite, unchanged).
- **Manual verification with three browser windows** against
  `mvn spring-boot:run`: two windows on the same `boardId` propagated create,
  move, connector and delete in both directions, a third window on a different
  `boardId` received nothing, and reloading one window recovered the
  accumulated state over REST.
- **Recorded run of the nine demo steps**, with three isolated browser
  contexts: deleting the connected rectangle took both clients from 3 nodes +
  1 connector to 2 nodes + 0 connectors; the third window, live on another
  Board from the start, received 0 STOMP `MESSAGE` frames while the first two
  received the same 7 accepted events; and after a reload one
  `GET /api/boards/{id}` returned the same elements and positions the other
  window had, without any Save. Screenshots and frame counts in
  [`evidence/`](evidence/).
