package edu.eci.arsw.collabboard.infrastructure.web.ws;

import edu.eci.arsw.collabboard.application.event.BoardEvent;
import edu.eci.arsw.collabboard.application.event.BoardEventPayload;
import edu.eci.arsw.collabboard.application.event.BoardEventType;
import edu.eci.arsw.collabboard.application.service.BoardApplicationService;
import edu.eci.arsw.collabboard.application.service.BoardEventApplicationService;
import edu.eci.arsw.collabboard.domain.model.BoardElement;
import edu.eci.arsw.collabboard.domain.model.ElementType;
import edu.eci.arsw.collabboard.infrastructure.persistence.InMemoryBoardRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * The controller is a transport adapter, so these tests only check the three
 * decisions it actually owns: route to the application service, broadcast the
 * accepted event on the board topic, and stay silent otherwise.
 */
class BoardWebSocketControllerTest {

    private final InMemoryBoardRepository repository = new InMemoryBoardRepository();
    private final BoardApplicationService boards = new BoardApplicationService(repository);
    private final SimpMessagingTemplate messagingTemplate = mock(SimpMessagingTemplate.class);

    private final BoardWebSocketController controller =
            new BoardWebSocketController(new BoardEventApplicationService(repository), messagingTemplate);

    private String boardId;

    @BeforeEach
    void createBoard() {
        boardId = boards.createBoard("Architecture Session").id();
    }

    @Test
    void shouldBroadcastAnAcceptedEventOnTheBoardTopic() {
        controller.handle(boardId, elementCreated(boardId, "rect-1"));

        ArgumentCaptor<Object> payload = ArgumentCaptor.forClass(Object.class);
        verify(messagingTemplate).convertAndSend(eq("/topic/boards/" + boardId), payload.capture());

        BoardEvent broadcast = (BoardEvent) payload.getValue();
        assertEquals(BoardEventType.ELEMENT_CREATED, broadcast.type());
        assertEquals(boardId, broadcast.boardId());
        assertEquals("rect-1", broadcast.payload().elementId());
    }

    @Test
    void shouldApplyTheEventToTheBoardBeforeBroadcasting() {
        controller.handle(boardId, elementCreated(boardId, "rect-1"));

        assertEquals(1, boards.getBoard(boardId).elements().size());
    }

    @Test
    void shouldDiscardAnEventWhoseEnvelopeTargetsAnotherBoard() {
        String otherBoardId = boards.createBoard("Another Session").id();

        // Sent to this board destination, but claiming to belong to the other.
        controller.handle(boardId, elementCreated(otherBoardId, "rect-1"));

        verify(messagingTemplate, never()).convertAndSend(anyString(), any(Object.class));
        assertEquals(0, boards.getBoard(boardId).elements().size());
        assertEquals(0, boards.getBoard(otherBoardId).elements().size());
    }

    @Test
    void shouldNotBroadcastAnEventRejectedByTheApplicationService() {
        // Deleting an element that does not exist is refused downstream.
        BoardEvent invalid = new BoardEvent(UUID.randomUUID().toString(), boardId,
                BoardEventType.ELEMENT_DELETED, "client-a", Instant.now(),
                new BoardEventPayload(null, "ghost-1", null, null));

        controller.handle(boardId, invalid);

        verify(messagingTemplate, never()).convertAndSend(anyString(), any(Object.class));
    }

    @Test
    void shouldNotBroadcastWhenTheBoardDoesNotExist() {
        controller.handle("missing-board", elementCreated("missing-board", "rect-1"));

        verify(messagingTemplate, never()).convertAndSend(anyString(), any(Object.class));
    }

    private static BoardEvent elementCreated(String boardId, String elementId) {
        BoardElement rectangle =
                new BoardElement(elementId, ElementType.RECTANGLE, 10, 20, 170, 70, "Component", null, null);
        return new BoardEvent(UUID.randomUUID().toString(), boardId, BoardEventType.ELEMENT_CREATED,
                "client-a", Instant.now(), new BoardEventPayload(rectangle, null, null, null));
    }
}
