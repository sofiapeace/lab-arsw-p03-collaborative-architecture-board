package edu.eci.arsw.collabboard.application.port.out;

import edu.eci.arsw.collabboard.domain.model.Board;

import java.util.Optional;

/**
 * Output port owned by the application boundary.
 *
 * These three operations are the minimum the use cases need: save (upsert),
 * findById (get) and existsById (so replace can reject an unknown board
 * without loading it). No framework-specific abstraction belongs here — the
 * boundary and its trade-offs are documented in docs/ADR-001-repository-boundary.md.
 */
public interface BoardRepository {
    Board save(Board board);

    Optional<Board> findById(String boardId);

    boolean existsById(String boardId);
}
