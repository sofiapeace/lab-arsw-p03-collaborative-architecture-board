# Visual evidence — Lab 05

Required by the lab guide (section 10): a screenshot or short GIF showing a loaded Board with two connected elements and a change that was saved and reloaded.

## Delivered evidence

**1. `board-saved.png`** — a RECTANGLE and a TEXT joined by a CONNECTOR, right after pressing **Save** (status `success`, message `Board saved`):

![Board with a rectangle and a text joined by a connector, just saved](board-saved.png)

**2. `board-reloaded.png`** — the same board after reloading the page and pressing **Load** with that `boardId` (message `Board loaded`). The two connected elements and their positions came back from the server:

![The same board reloaded from the server with its connector intact](board-reloaded.png)


How to reproduce the flow:

1. `mvn clean spring-boot:run` (the `clean` matters: a stale `target/` can serve the old Lab 04 landing page).
2. Open <http://localhost:8080/>, type a board name and press **New** — the generated `boardId` appears in the id field.
3. Press **+ Rectangle** and **+ Text**, then drag them apart on the canvas.
4. Click one element, press **Connect selected + next**, then click the other one — a connector line appears between their centers.
5. Press **Save** (status turns `success`, message `Board saved`).
6. Reload the page, paste the `boardId` and press **Load** — the same three elements come back.

The visual evidence does not replace the code review.
