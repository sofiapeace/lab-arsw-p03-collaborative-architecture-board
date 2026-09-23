package edu.eci.arsw.collabboard.application.service;

import edu.eci.arsw.collabboard.application.event.BoardEvent;
import edu.eci.arsw.collabboard.application.event.BoardEventPayload;
import edu.eci.arsw.collabboard.application.exception.BoardNotFoundException;
import edu.eci.arsw.collabboard.application.port.out.BoardRepository;
import edu.eci.arsw.collabboard.domain.model.Board;
import edu.eci.arsw.collabboard.domain.model.BoardElement;
import edu.eci.arsw.collabboard.domain.model.ElementType;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Applies collaboration events to the authoritative Board state — Lab #6.
 *
 * This is the only place where a BoardEvent becomes a new Board. The STOMP
 * controller never touches the repository and never builds domain objects; it
 * only delivers the message here and broadcasts whatever comes back. That is
 * what keeps the protocol out of the domain.
 *
 * Every transition is expressed as "build a new immutable Board and save it",
 * so the Board compact constructor re-validates the invariants (no duplicate
 * ids, connectors pointing at existing non-connector elements) on every single
 * event. An event that would corrupt the board is rejected instead of applied.
 *
 * DELIBERATELY NOT SOLVED YET: load -> modify -> save is a read-modify-write
 * sequence with no locking, no version and no atomicity. Two events applied at
 * the same time can lose each other update. Lab #7 studies exactly this, so
 * hiding it now with premature synchronization would remove the material.
 */
@Service
public class BoardEventApplicationService {

    private final BoardRepository repository;

    public BoardEventApplicationService(BoardRepository repository) {
        this.repository = repository;
    }

    /**
     * Validates and applies an incoming event.
     *
     * @return the normalized event that may be broadcast — same envelope, but
     *         with a payload rebuilt from what was actually stored, so
     *         subscribers receive server-accepted data and not raw client input.
     * @throws BoardNotFoundException   if the board does not exist.
     * @throws IllegalArgumentException if the event violates the contract or
     *                                  would break a Board invariant.
     */
    public BoardEvent apply(BoardEvent event) {
        Board board = repository.findById(event.boardId())
                .orElseThrow(() -> new BoardNotFoundException(event.boardId()));

        Applied applied = switch (event.type()) {
            case ELEMENT_CREATED -> create(board, event, false);
            case CONNECTOR_CREATED -> create(board, event, true);
            case ELEMENT_UPDATED -> update(board, event);
            case ELEMENT_MOVED -> move(board, event);
            case ELEMENT_DELETED -> delete(board, event);
        };

        repository.save(applied.board());
        return new BoardEvent(
                event.eventId(),
                event.boardId(),
                event.type(),
                event.actorId(),
                event.occurredAt(),
                applied.payload());
    }

    /** A transition result: the new board plus the payload that describes it. */
    private record Applied(Board board, BoardEventPayload payload) {
    }

    private Applied create(Board board, BoardEvent event, boolean expectConnector) {
        BoardElement element = requireElement(event);
        boolean isConnector = element.type() == ElementType.CONNECTOR;
        if (expectConnector != isConnector) {
            throw new IllegalArgumentException(
                    event.type() + " does not accept an element of type " + element.type());
        }
        if (findElement(board, element.id()).isPresent()) {
            throw new IllegalArgumentException("Element already exists: " + element.id());
        }

        List<BoardElement> elements = new ArrayList<>(board.elements());
        elements.add(element);
        // Board validates here: a connector whose endpoints do not exist (or
        // point at another connector) is rejected before it is ever broadcast.
        return new Applied(withElements(board, elements), elementPayload(element));
    }

    private Applied update(Board board, BoardEvent event) {
        BoardElement element = requireElement(event);
        BoardElement current = requireExisting(board, element.id());
        if (current.type() != element.type()) {
            throw new IllegalArgumentException(
                    "ELEMENT_UPDATED cannot change the type of " + element.id());
        }
        return new Applied(replace(board, element), elementPayload(element));
    }

    private Applied move(Board board, BoardEvent event) {
        String elementId = requireElementId(event);
        double x = requireCoordinate(event.payload().x(), "x");
        double y = requireCoordinate(event.payload().y(), "y");

        BoardElement current = requireExisting(board, elementId);
        if (current.type() == ElementType.CONNECTOR) {
            throw new IllegalArgumentException("A connector has no position of its own: " + elementId);
        }

        // Absolute position, not a delta: applying the same final MOVE twice
        // yields the same board, which is what makes replays harmless.
        BoardElement moved = new BoardElement(
                current.id(), current.type(), x, y,
                current.width(), current.height(), current.text(),
                current.sourceId(), current.targetId());

        return new Applied(replace(board, moved),
                new BoardEventPayload(null, moved.id(), moved.x(), moved.y()));
    }

    private Applied delete(Board board, BoardEvent event) {
        String elementId = requireElementId(event);
        requireExisting(board, elementId);

        // Cascade: a connector that referenced the removed element would leave
        // the board in a state its own invariant forbids, so it goes too.
        List<BoardElement> remaining = board.elements().stream()
                .filter(e -> !e.id().equals(elementId))
                .filter(e -> !elementId.equals(e.sourceId()) && !elementId.equals(e.targetId()))
                .toList();

        return new Applied(withElements(board, remaining),
                new BoardEventPayload(null, elementId, null, null));
    }

    private static BoardEventPayload elementPayload(BoardElement element) {
        return new BoardEventPayload(element, element.id(), null, null);
    }

    private static Board withElements(Board board, List<BoardElement> elements) {
        return new Board(board.id(), board.name(), elements);
    }

    private static Board replace(Board board, BoardElement element) {
        List<BoardElement> elements = board.elements().stream()
                .map(e -> e.id().equals(element.id()) ? element : e)
                .toList();
        return withElements(board, elements);
    }

    private static Optional<BoardElement> findElement(Board board, String elementId) {
        return board.elements().stream().filter(e -> e.id().equals(elementId)).findFirst();
    }

    private static BoardElement requireExisting(Board board, String elementId) {
        return findElement(board, elementId)
                .orElseThrow(() -> new IllegalArgumentException("Unknown element: " + elementId));
    }

    private static BoardElement requireElement(BoardEvent event) {
        BoardElement element = event.payload().element();
        if (element == null) {
            throw new IllegalArgumentException(event.type() + " requires payload.element");
        }
        return element;
    }

    private static String requireElementId(BoardEvent event) {
        String elementId = event.payload().elementId();
        if (elementId == null || elementId.isBlank()) {
            throw new IllegalArgumentException(event.type() + " requires payload.elementId");
        }
        return elementId;
    }

    private static double requireCoordinate(Double value, String field) {
        if (value == null) {
            throw new IllegalArgumentException("ELEMENT_MOVED requires payload." + field);
        }
        return value;
    }
}
