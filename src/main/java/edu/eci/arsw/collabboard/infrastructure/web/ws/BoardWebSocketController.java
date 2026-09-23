package edu.eci.arsw.collabboard.infrastructure.web.ws;

import edu.eci.arsw.collabboard.application.event.BoardEvent;
import edu.eci.arsw.collabboard.application.exception.BoardNotFoundException;
import edu.eci.arsw.collabboard.application.service.BoardEventApplicationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

/**
 * STOMP entry point for live collaboration — Lab #6.
 *
 * Mirrors what BoardRestController does for HTTP: it adapts one transport to
 * the application boundary and nothing else. It owns no state, never touches
 * the repository and never builds domain objects; it delegates to
 * BoardEventApplicationService and relays the result.
 *
 * Messages arrive at /app/boards/{boardId}/events (the /app prefix is what
 * routes them here instead of straight to subscribers) and accepted events go
 * out on /topic/boards/{boardId}.
 */
@Controller
public class BoardWebSocketController {

    private static final Logger log = LoggerFactory.getLogger(BoardWebSocketController.class);

    private static final String BOARD_TOPIC = "/topic/boards/";

    private final BoardEventApplicationService service;
    private final SimpMessagingTemplate messagingTemplate;

    public BoardWebSocketController(BoardEventApplicationService service,
                                    SimpMessagingTemplate messagingTemplate) {
        this.service = service;
        this.messagingTemplate = messagingTemplate;
    }

    @MessageMapping("/boards/{boardId}/events")
    public void handle(@DestinationVariable String boardId, BoardEvent event) {
        // Session isolation starts here. The destination is the authority on
        // which board is being edited, so an envelope claiming a different
        // boardId is discarded rather than reconciled: honouring it would let
        // a client subscribed to one board write into another one.
        if (!boardId.equals(event.boardId())) {
            log.warn("Discarded event {}: destination board {} does not match envelope board {}",
                    event.eventId(), boardId, event.boardId());
            return;
        }

        BoardEvent accepted;
        try {
            accepted = service.apply(event);
        } catch (BoardNotFoundException | IllegalArgumentException rejected) {
            // A rejected event must not reach any subscriber: broadcasting it
            // would leave the clients holding a change the server refused.
            log.warn("Rejected {} event {} on board {}: {}",
                    event.type(), event.eventId(), boardId, rejected.getMessage());
            return;
        }

        // One destination per board is what keeps sessions independent: a
        // subscriber to another boardId is never reached by this send.
        messagingTemplate.convertAndSend(BOARD_TOPIC + boardId, accepted);
    }
}
