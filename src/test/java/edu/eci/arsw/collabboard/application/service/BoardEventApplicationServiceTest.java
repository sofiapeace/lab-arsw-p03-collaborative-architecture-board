package edu.eci.arsw.collabboard.application.service;

import edu.eci.arsw.collabboard.application.event.BoardEvent;
import edu.eci.arsw.collabboard.application.event.BoardEventPayload;
import edu.eci.arsw.collabboard.application.event.BoardEventType;
import edu.eci.arsw.collabboard.application.exception.BoardNotFoundException;
import edu.eci.arsw.collabboard.domain.model.Board;
import edu.eci.arsw.collabboard.domain.model.BoardElement;
import edu.eci.arsw.collabboard.domain.model.ElementType;
import edu.eci.arsw.collabboard.infrastructure.persistence.InMemoryBoardRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Covers the event-to-domain transitions of Lab #6 and the contract checks that
 * decide whether an event may be broadcast at all.
 */
class BoardEventApplicationServiceTest {

    private final InMemoryBoardRepository repository = new InMemoryBoardRepository();
    private final BoardApplicationService boards = new BoardApplicationService(repository);
    private final BoardEventApplicationService events = new BoardEventApplicationService(repository);

    private String boardId;

    @BeforeEach
    void createBoard() {
        boardId = boards.createBoard("Architecture Session").id();
    }

    // --- transitions ---------------------------------------------------------

    @Test
    void shouldApplyElementCreated() {
        events.apply(event(BoardEventType.ELEMENT_CREATED,
                new BoardEventPayload(rectangle("rect-1", 10, 20), null, null, null)));

        List<BoardElement> elements = boards.getBoard(boardId).elements();
        assertEquals(1, elements.size());
        assertEquals("rect-1", elements.get(0).id());
    }

    @Test
    void shouldApplyElementMovedToTheReportedPosition() {
        events.apply(event(BoardEventType.ELEMENT_CREATED,
                new BoardEventPayload(rectangle("rect-1", 10, 20), null, null, null)));

        events.apply(event(BoardEventType.ELEMENT_MOVED,
                new BoardEventPayload(null, "rect-1", 300.0, 150.0)));

        BoardElement moved = element(boards.getBoard(boardId), "rect-1");
        assertEquals(300.0, moved.x());
        assertEquals(150.0, moved.y());
    }

    @Test
    void shouldTreatARepeatedMoveAsTheSameFinalState() {
        // The board must survive a duplicated broadcast: MOVE carries an
        // absolute position, so applying it twice cannot drift.
        events.apply(event(BoardEventType.ELEMENT_CREATED,
                new BoardEventPayload(rectangle("rect-1", 10, 20), null, null, null)));
        BoardEvent move = event(BoardEventType.ELEMENT_MOVED,
                new BoardEventPayload(null, "rect-1", 300.0, 150.0));

        events.apply(move);
        Board afterFirst = boards.getBoard(boardId);
        events.apply(move);

        assertEquals(afterFirst, boards.getBoard(boardId));
    }

    @Test
    void shouldApplyConnectorCreatedBetweenExistingElements() {
        events.apply(event(BoardEventType.ELEMENT_CREATED,
                new BoardEventPayload(rectangle("rect-1", 0, 0), null, null, null)));
        events.apply(event(BoardEventType.ELEMENT_CREATED,
                new BoardEventPayload(rectangle("rect-2", 200, 0), null, null, null)));

        events.apply(event(BoardEventType.CONNECTOR_CREATED,
                new BoardEventPayload(connector("conn-1", "rect-1", "rect-2"), null, null, null)));

        BoardElement connector = element(boards.getBoard(boardId), "conn-1");
        assertEquals("rect-1", connector.sourceId());
        assertEquals("rect-2", connector.targetId());
    }

    @Test
    void shouldDeleteElementAndItsDependentConnectors() {
        events.apply(event(BoardEventType.ELEMENT_CREATED,
                new BoardEventPayload(rectangle("rect-1", 0, 0), null, null, null)));
        events.apply(event(BoardEventType.ELEMENT_CREATED,
                new BoardEventPayload(rectangle("rect-2", 200, 0), null, null, null)));
        events.apply(event(BoardEventType.CONNECTOR_CREATED,
                new BoardEventPayload(connector("conn-1", "rect-1", "rect-2"), null, null, null)));

        events.apply(event(BoardEventType.ELEMENT_DELETED,
                new BoardEventPayload(null, "rect-1", null, null)));

        List<String> remaining = boards.getBoard(boardId).elements().stream().map(BoardElement::id).toList();
        assertEquals(List.of("rect-2"), remaining);
    }

    @Test
    void shouldReturnTheNormalizedEventReadyToBroadcast() {
        BoardEvent accepted = events.apply(event(BoardEventType.ELEMENT_CREATED,
                new BoardEventPayload(rectangle("rect-1", 10, 20), null, null, null)));

        assertEquals(boardId, accepted.boardId());
        assertEquals(BoardEventType.ELEMENT_CREATED, accepted.type());
        assertNotNull(accepted.payload().element());
        // Normalization: the payload now also carries the id explicitly, even
        // though the client only sent the element.
        assertEquals("rect-1", accepted.payload().elementId());
    }

    // --- contract validation -------------------------------------------------

    @Test
    void shouldRejectEventsForAnUnknownBoard() {
        BoardEvent orphan = new BoardEvent(UUID.randomUUID().toString(), "missing-board",
                BoardEventType.ELEMENT_CREATED, "client-a", Instant.now(),
                new BoardEventPayload(rectangle("rect-1", 0, 0), null, null, null));

        assertThrows(BoardNotFoundException.class, () -> events.apply(orphan));
    }

    @Test
    void shouldRejectElementCreatedWithoutAnElement() {
        BoardEvent incomplete = event(BoardEventType.ELEMENT_CREATED,
                new BoardEventPayload(null, null, null, null));

        assertThrows(IllegalArgumentException.class, () -> events.apply(incomplete));
    }

    @Test
    void shouldRejectConnectorCreatedCarryingANonConnectorElement() {
        BoardEvent mismatched = event(BoardEventType.CONNECTOR_CREATED,
                new BoardEventPayload(rectangle("rect-1", 0, 0), null, null, null));

        assertThrows(IllegalArgumentException.class, () -> events.apply(mismatched));
    }

    @Test
    void shouldRejectAConnectorWhoseEndpointsDoNotExist() {
        BoardEvent dangling = event(BoardEventType.CONNECTOR_CREATED,
                new BoardEventPayload(connector("conn-1", "ghost-1", "ghost-2"), null, null, null));

        assertThrows(IllegalArgumentException.class, () -> events.apply(dangling));
        assertTrue(boards.getBoard(boardId).elements().isEmpty());
    }

    @Test
    void shouldRejectAMoveWithoutCoordinates() {
        events.apply(event(BoardEventType.ELEMENT_CREATED,
                new BoardEventPayload(rectangle("rect-1", 10, 20), null, null, null)));

        BoardEvent incomplete = event(BoardEventType.ELEMENT_MOVED,
                new BoardEventPayload(null, "rect-1", null, null));

        assertThrows(IllegalArgumentException.class, () -> events.apply(incomplete));
    }

    @Test
    void shouldRejectAnEventTargetingAnUnknownElement() {
        BoardEvent unknown = event(BoardEventType.ELEMENT_DELETED,
                new BoardEventPayload(null, "ghost-1", null, null));

        assertThrows(IllegalArgumentException.class, () -> events.apply(unknown));
    }

    @Test
    void shouldRejectCreatingTheSameElementTwice() {
        BoardEvent create = event(BoardEventType.ELEMENT_CREATED,
                new BoardEventPayload(rectangle("rect-1", 10, 20), null, null, null));
        events.apply(create);

        assertThrows(IllegalArgumentException.class, () -> events.apply(create));
        assertEquals(1, boards.getBoard(boardId).elements().size());
    }

    @Test
    void shouldRejectMovingAConnector() {
        events.apply(event(BoardEventType.ELEMENT_CREATED,
                new BoardEventPayload(rectangle("rect-1", 0, 0), null, null, null)));
        events.apply(event(BoardEventType.ELEMENT_CREATED,
                new BoardEventPayload(rectangle("rect-2", 200, 0), null, null, null)));
        events.apply(event(BoardEventType.CONNECTOR_CREATED,
                new BoardEventPayload(connector("conn-1", "rect-1", "rect-2"), null, null, null)));

        BoardEvent invalid = event(BoardEventType.ELEMENT_MOVED,
                new BoardEventPayload(null, "conn-1", 50.0, 50.0));

        assertThrows(IllegalArgumentException.class, () -> events.apply(invalid));
    }

    @Test
    void shouldNotLeaveTheBoardModifiedWhenAnEventIsRejected() {
        events.apply(event(BoardEventType.ELEMENT_CREATED,
                new BoardEventPayload(rectangle("rect-1", 10, 20), null, null, null)));
        Board before = boards.getBoard(boardId);

        assertThrows(IllegalArgumentException.class, () -> events.apply(
                event(BoardEventType.ELEMENT_MOVED, new BoardEventPayload(null, "ghost-1", 1.0, 1.0))));

        assertEquals(before, boards.getBoard(boardId));
        assertFalse(boards.getBoard(boardId).elements().isEmpty());
    }

    // --- fixtures ------------------------------------------------------------

    private BoardEvent event(BoardEventType type, BoardEventPayload payload) {
        return new BoardEvent(UUID.randomUUID().toString(), boardId, type, "client-a", Instant.now(), payload);
    }

    private static BoardElement rectangle(String id, double x, double y) {
        return new BoardElement(id, ElementType.RECTANGLE, x, y, 170, 70, "Component", null, null);
    }

    private static BoardElement connector(String id, String sourceId, String targetId) {
        return new BoardElement(id, ElementType.CONNECTOR, 0, 0, 0, 0, "", sourceId, targetId);
    }

    private static BoardElement element(Board board, String elementId) {
        return board.elements().stream()
                .filter(e -> e.id().equals(elementId))
                .findFirst()
                .orElseThrow(() -> new AssertionError("Element not found: " + elementId));
    }
}
