package edu.eci.arsw.collabboard.application.service;

import edu.eci.arsw.collabboard.application.exception.BoardNotFoundException;
import edu.eci.arsw.collabboard.domain.model.Board;
import edu.eci.arsw.collabboard.domain.model.BoardElement;
import edu.eci.arsw.collabboard.domain.model.ElementType;
import edu.eci.arsw.collabboard.infrastructure.persistence.InMemoryBoardRepository;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class BoardApplicationServiceTest {

    private final BoardApplicationService service =
            new BoardApplicationService(new InMemoryBoardRepository());

    @Test
    void shouldCreateAndReadBoard() {
        Board created = service.createBoard("Architecture Session");
        Board loaded = service.getBoard(created.id());

        assertEquals(created, loaded);
    }

    @Test
    void shouldFailWithConcreteExceptionWhenBoardDoesNotExist() {
        assertThrows(BoardNotFoundException.class,
                () -> service.getBoard("missing-board"));
    }

    @Test
    void shouldReplaceExistingBoardKeepingItsId() {
        Board created = service.createBoard("Architecture Session");
        BoardElement rectangle = new BoardElement(
                "el-1", ElementType.RECTANGLE, 0, 0, 100, 50, "", null, null);

        Board replaced = service.replaceBoard(
                created.id(), "Renamed Session", List.of(rectangle));

        assertEquals(created.id(), replaced.id());
        assertEquals("Renamed Session", replaced.name());
        assertEquals(1, replaced.elements().size());
    }

    @Test
    void shouldFailToReplaceWhenBoardDoesNotExist() {
        BoardElement rectangle = new BoardElement(
                "el-1", ElementType.RECTANGLE, 0, 0, 100, 50, "", null, null);

        assertThrows(BoardNotFoundException.class,
                () -> service.replaceBoard("missing-board", "X", List.of(rectangle)));
    }
}