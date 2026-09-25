# ARSW Collaborative Board — Lab #4, Lab #5 & Lab #6

> Lab #4: backend modular, contratos y persistencia desacoplada.
> Lab #5: cliente web interactivo en SVG sobre el mismo contrato REST.
> Lab #6: colaboración en tiempo real con WebSocket/STOMP sobre la misma base.
> Asignatura: Arquitecturas de Software (ARSW) — 2026-2

## Autor(es)

- Nombre: Jose Luis Lancheros Ayola y Gina Sofia Garcia Zapata

## 1. Descripción

El **ARSW Collaborative Board** es un tablero de arquitectura. El Board se
persiste únicamente en memoria del proceso; no hay base de datos ni
autenticación.

- **Lab #4** construyó la **arquitectura base del backend**: separación de
  responsabilidades, inversión de dependencias (DIP), inyección por
  constructor y manejo uniforme de errores.
- **Lab #5** agregó un **cliente web interactivo** (JavaScript ES Modules +
  SVG, sin frameworks) que consume esos mismos tres endpoints, y evolucionó el
  dominio con el tipo `CONNECTOR`.
- **Lab #6** agregó **colaboración en tiempo real**: dos o más navegadores que
  carguen el mismo `boardId` comparten una sesión y ven los cambios de los
  demás sin recargar. REST conserva el arranque y el snapshot; STOMP lleva los
  cambios en vivo.

```
Web Client (static/js — ES Modules + SVG)
  BoardApp ──> BoardApiClient ──────── HTTP/JSON ───┐
     ├──────> BoardRealtimeClient ── STOMP ──┐      │
     ├──────> BoardState                     │      │
     └──────> BoardView                      │      │
                                             v      v
                        SEND /app/boards/{id}/events   REST Controller
                                    |                        |
                                    v                        v
                     BoardEventApplicationService   BoardApplicationService
                                    |                        |
                                    +───────────+────────────+
                                                v
                                       BoardRepository (port)
                                                |
                                                v
                                   InMemoryBoardRepository (adapter)

        El evento aceptado se publica en  /topic/boards/{id}
        y cada cliente suscrito lo aplica sobre su BoardState.
```

Los dos transportes son independientes entre sí y comparten **un solo Board
autoritativo**. El porqué está en
[`docs/ADR-003-rest-vs-realtime.md`](docs/ADR-003-rest-vs-realtime.md).

## 2. Requisitos previos

- Java 21
- Maven 3.9+ (o el wrapper `mvnw` si el starter lo incluye)

## 3. Cómo ejecutar el proyecto

```bash
mvn clean spring-boot:run
```

- Cliente web: <http://localhost:8080/>
- API REST: <http://localhost:8080/api/boards>
- Endpoint WebSocket: `ws://localhost:8080/ws`

> El `clean` importa: si queda un `target/` viejo, Spring puede servir una
> página antigua en vez del cliente actual.

## 4. Cómo usar el cliente web

1. Escriba un nombre y presione **New** — el `boardId` generado por el
   servidor aparece en el campo de id.
2. **+ Rectangle** y **+ Text** agregan elementos; arrástrelos para moverlos.
3. Seleccione un elemento, presione **Connect selected + next** y haga clic en
   el segundo elemento para crear un `CONNECTOR`.
4. **Delete selected** elimina el elemento seleccionado (y los conectores que
   lo referenciaban, para no guardar conectores colgantes).
5. **Save snapshot** envía el Board completo con `PUT`. **Load** lo recupera
   por id.
6. Durante una operación remota el estado muestra `loading` y los botones se
   deshabilitan; si falla, aparece el mensaje del servidor y un botón
   **Retry** que repite la última operación.

### 4.1 Colaboración en tiempo real

1. **Navegador A**: **New** → **Connect live**. El estado `LIVE` pasa a
   `connected` y el mensaje indica a qué destino quedó suscrito.
2. **Navegador B**: pegue el mismo `boardId` → **Load** → **Connect live**.
3. Desde cualquiera de los dos, cree, mueva, conecte o elimine elementos: el
   cambio aparece en el otro sin recargar.
4. **Navegador C** con un `boardId` distinto no recibe nada de esa sesión.

Detalles que ayudan a leer la pantalla:

- El encabezado muestra **dos estados independientes**: `REST` (arranque y
  snapshot) y `LIVE` (canal de colaboración). Si el socket se cae, crear,
  cargar y guardar siguen funcionando.
- El `Actor` identifica a cada pestaña. Vive en `sessionStorage`, así que dos
  ventanas del mismo navegador cuentan como dos colaboradores distintos.
- La línea de estado dice de dónde vino cada cambio: `applied from <actor>`
  cuando es de un colaborador, y `confirmed by the server` cuando es el
  servidor aceptando lo que usted mismo publicó.
- El movimiento se publica **al soltar el arrastre**, no en cada píxel.
- El canal en vivo pertenece a un solo Board: si **New** o **Load** traen un
  Board distinto, la ventana cierra el canal anterior (`LIVE` pasa a
  `disconnected`) y hay que pulsar **Connect live** otra vez. Así nunca aplica
  eventos de un Board sobre otro.

> Un cliente desconectado se pierde los eventos publicados mientras tanto: para
> ponerse al día usa **Load** (REST). No hay historial de eventos — está fuera
> del alcance de este laboratorio.

Evidencia visual del flujo: [`docs/evidence/`](docs/evidence/). Guion paso a paso para
repetir la demo en vivo: [`docs/live-demo.md`](docs/live-demo.md).

## 5. Cómo ejecutar las pruebas

```bash
mvn test
```

Resultado actual: **36 pruebas, 0 fallos**.

- [x] `mvn test` finaliza correctamente
- [x] Incluye pruebas del `BoardApplicationService` (sin levantar servidor web)
- [x] Incluye pruebas del contrato REST
- [x] Incluye una prueba que demuestre el caso "Board inexistente"
- [x] Incluye pruebas de las invariantes de `CONNECTOR`
- [x] Incluye pruebas de al menos dos tipos de evento y una validación de contrato

| Prueba | Qué cubre |
|---|---|
| `BoardApplicationServiceTest` (4) | Casos de uso create/get/replace sin contexto de Spring, incluido el Board inexistente en `replace` |
| `BoardRestControllerTest` (5) | Contrato HTTP real con servidor en puerto aleatorio: create 201, get 200/404, replace 200/404 |
| `BoardConnectorTest` (3) | Conector válido, conector a un elemento inexistente y conector que apunta a otro conector |
| `BoardEventApplicationServiceTest` (15) | Las cinco transiciones de evento, las validaciones de contrato, la idempotencia de un `ELEMENT_MOVED` repetido, la cascada al eliminar y que un evento rechazado deja el Board intacto |
| `BoardWebSocketControllerTest` (5) | Destino del broadcast y payload normalizado, estado aplicado antes de publicar, y silencio ante un `boardId` que no corresponde, un evento rechazado y un Board inexistente |
| `BoardEventContractTest` (4) | Formato de cable: parsea el JSON exacto que emite `js/events/board-event.js` y exige que `occurredAt` viaje como ISO-8601 |

Las 12 primeras son la suite de regresión de los Labs #4 y #5, sin cambios.

## 6. Estructura del proyecto

```
src/main/java/.../collabboard
├── domain/model
│   ├── Board.java              (invariantes del Board + validateConnectors)
│   ├── BoardElement.java       (invariantes del elemento y del CONNECTOR)
│   └── ElementType.java        (RECTANGLE, TEXT, CONNECTOR)
├── application
│   ├── port/out/BoardRepository.java
│   ├── event                   (contrato de colaboración, NO dominio)
│   │   ├── BoardEvent.java     (sobre: eventId, boardId, type, actorId, occurredAt, payload)
│   │   ├── BoardEventType.java
│   │   └── BoardEventPayload.java
│   ├── service
│   │   ├── BoardApplicationService.java       (casos de uso REST)
│   │   └── BoardEventApplicationService.java  (evento -> nuevo Board)
│   └── exception/BoardNotFoundException.java
└── infrastructure
    ├── persistence/InMemoryBoardRepository.java
    ├── web/rest
    │   ├── BoardRestController.java
    │   ├── ApiError.java
    │   ├── GlobalExceptionHandler.java
    │   ├── CreateBoardRequest.java
    │   └── ReplaceBoardRequest.java
    └── web/ws
        ├── WebSocketConfig.java          (/ws, prefijo /app, broker simple /topic)
        └── BoardWebSocketController.java (adaptador STOMP)

src/main/resources/static
├── index.html
├── css/app.css
└── js
    ├── app.js                            (BoardApp — orquestación)
    ├── api/board-api-client.js           (único módulo con fetch)
    ├── realtime/board-realtime-client.js (único módulo que conoce STOMP)
    ├── events/board-event.js             (fábrica del sobre BoardEvent)
    ├── state/board-state.js              (estado local, única fuente de verdad)
    └── ui/board-view.js                  (render SVG + eventos de puntero)
```

## 7. Contratos

### 7.1 REST

Ver detalle completo en
[`docs/architecture/api-contract.md`](docs/architecture/api-contract.md).

| Método | Recurso              | Propósito          | Respuesta esperada       |
|--------|----------------------|---------------------|---------------------------|
| POST   | `/api/boards`        | Crear Board          | 201 + Board creado        |
| GET    | `/api/boards/{id}`   | Consultar Board       | 200 + Board                |
| PUT    | `/api/boards/{id}`   | Reemplazar estado    | 200 + Board actualizado    |

Ni el Lab #5 ni el Lab #6 **agregaron endpoints**: mover, conectar o eliminar
se aplican al estado local, se publican como eventos y se persisten con un solo
`PUT` del Board completo.

### 7.2 Colaboración (STOMP)

Ver detalle completo en
[`docs/event-contract.md`](docs/event-contract.md).

```text
Cliente  SEND       /app/boards/{boardId}/events
Servidor BROADCAST  /topic/boards/{boardId}
```

| Tipo de evento | Payload | Significado |
|---|---|---|
| `ELEMENT_CREATED` | `element` | Agregar un RECTANGLE o TEXT |
| `CONNECTOR_CREATED` | `element` | Agregar un CONNECTOR con extremos válidos |
| `ELEMENT_MOVED` | `elementId`, `x`, `y` | Reposicionar (posición absoluta) |
| `ELEMENT_UPDATED` | `element` | Reemplazar propiedades de un elemento existente |
| `ELEMENT_DELETED` | `elementId` | Eliminar el elemento y sus conectores dependientes |

Los clientes publican en **`/app`**, nunca en `/topic`: ese prefijo es lo que
enruta el mensaje al controlador para que sea **validado y aplicado** sobre el
Board autoritativo antes de retransmitirse. Un evento rechazado no llega a
ningún suscriptor.

## 8. Decisiones arquitectónicas

- [`docs/ADR-001-repository-boundary.md`](docs/ADR-001-repository-boundary.md):
  límite entre el puerto `BoardRepository` y el adaptador
  `InMemoryBoardRepository`.
- [`docs/ADR-002-client-boundaries.md`](docs/ADR-002-client-boundaries.md):
  separación entre `BoardApiClient`, `BoardState` y `BoardView`.
- [`docs/ADR-003-rest-vs-realtime.md`](docs/ADR-003-rest-vs-realtime.md):
  por qué REST y WebSocket/STOMP coexisten en vez de que uno reemplace al otro.

## 9. Evidencia arquitectónica

| Artefacto            | Ubicación                                   |
|-----------------------|----------------------------------------------|
| Vista ArchiMate        | `docs/architecture/diagrams.drawio` (página "ArchiMate Application View") · imagen: [`archimate-application-view.png`](docs/architecture/archimate-application-view.png) |
| Diagrama de clases/módulos | `docs/architecture/diagrams.drawio` (página "Class Diagram") · imagen: [`class-diagram.png`](docs/architecture/class-diagram.png) |
| Contrato REST          | `docs/architecture/api-contract.md`           |
| Contrato de eventos    | `docs/event-contract.md`                      |
| ADR-001                | `docs/ADR-001-repository-boundary.md`         |
| ADR-002                | `docs/ADR-002-client-boundaries.md`           |
| ADR-003                | `docs/ADR-003-rest-vs-realtime.md`            |
| Captura del flujo      | `docs/evidence/`                              |
| Declaración uso de IA  | `docs/AI_USAGE.md`                            |

## 10. Checklist de criterios de aceptación

**Lab #4**

- [x] El proyecto ejecuta con Java 21 y Maven
- [x] `mvn test` finaliza correctamente
- [x] Es posible crear, consultar y reemplazar un Board mediante HTTP
- [x] Un Board inexistente produce un error HTTP coherente y un `ApiError` uniforme
- [x] El Application Service puede probarse sin levantar el servidor web
- [x] Cambiar el adaptador de persistencia no exige modificar el controlador REST
- [x] No hay referencias a clases de infraestructura dentro del paquete `domain`
- [x] Los diagramas reflejan nombres y dependencias observables en el código

**Lab #5**

- [x] `mvn test` finaliza correctamente
- [x] La interfaz crea y carga Boards reales usando REST
- [x] `RECTANGLE` y `TEXT` pueden agregarse, seleccionarse, moverse y eliminarse
- [x] Puede crearse al menos un `CONNECTOR` válido entre dos elementos
- [x] Guardar y recargar conserva el Board
- [x] No existe `fetch` fuera de `js/api/board-api-client.js`
- [x] La vista no contiene reglas de persistencia ni conoce excepciones Java
- [x] Existe manejo visible de loading/error/retry
- [x] La Vista de Aplicación y el diagrama de clases reflejan la implementación real

**Lab #6**

- [x] Dos navegadores con el mismo `boardId` reciben `ELEMENT_CREATED`
- [x] Mover un elemento en A actualiza su posición en B sin recargar
- [x] Crear un conector en A aparece en B con los mismos extremos
- [x] Eliminar un elemento elimina también conectores dependientes en todos los clientes
- [x] Un Board diferente no recibe eventos de otra sesión
- [x] La carga inicial sigue realizándose mediante REST
- [x] El callback STOMP actualiza `BoardState` y no manipula directamente SVG/DOM
- [x] Los mensajes aceptados pasan por un servicio de aplicación antes del broadcast
- [x] El repositorio conserva la estructura acumulada de Labs #4 y #5

## 11. Pregunta de sustentación (Lab #4)

> Si mañana `InMemoryBoardRepository` se reemplaza por otro adaptador, ¿qué
> componentes deberían cambiar y cuáles deberían permanecer intactos?

**Respuesta:** solo habría que **agregar** una clase nueva en
`infrastructure.persistence` que implemente `BoardRepository` y sea el único
bean de ese tipo en el contexto de Spring (si conviven dos, habría que marcar
uno con `@Primary` o calificarlo).

Permanecen intactos:

- `BoardApplicationService` y `BoardEventApplicationService`, porque sus
  constructores reciben la interfaz `BoardRepository` y nunca mencionan la
  clase concreta — ningún archivo del proyecto hace
  `new InMemoryBoardRepository()`, el cableado lo hace el contenedor de Spring.
- `BoardRestController` y `BoardWebSocketController`, que solo conocen su
  servicio de aplicación.
- El dominio (`Board`, `BoardElement`, `ElementType`), donde viven las
  invariantes; en particular, las reglas de `CONNECTOR` seguirían aplicándose
  con cualquier adaptador.
- El cliente web completo, porque depende de los contratos HTTP y STOMP, no del
  almacenamiento.
- La interfaz `BoardRepository` misma, salvo que el nuevo adaptador necesite
  operaciones nuevas (por ejemplo listar o paginar): ese caso obligaría a
  crecer el puerto y a tocar todas las implementaciones. Ese trade-off está
  documentado en el ADR-001.

Evidencia de que el límite es real: `BoardApplicationServiceTest` y
`BoardEventApplicationServiceTest` construyen sus servicios a mano, sin
contexto de Spring, y pasan.

## 12. Alcance y restricciones

Fuera de alcance en esta entrega: autenticación, chat, presencia, cursores
remotos, historial, undo/redo, Redis, Kafka, microservicios, CRDT/OT, base de
datos externa, zoom, permisos y despliegue.

La **consistencia ante cambios simultáneos tampoco se resuelve todavía**, y es
deliberado. `BoardEventApplicationService.apply` hace un
lectura-modificación-escritura sin bloqueo, sin versión y sin atomicidad: dos
eventos aplicados a la vez pueden perderse mutuamente. El Lab #7 —
*Concurrent Collaboration* usa exactamente este camino para exponer los *lost
updates*, el estado compartido y las operaciones no atómicas. Esconder el
problema ahora con complejidad prematura eliminaría el material en vez de
resolverlo.

El broker es el simple en memoria de Spring, así que la solución no escala más
allá de una instancia de la aplicación. Las consecuencias están en el ADR-003.

## 13. Uso de IA

Ver declaración completa en [`docs/AI_USAGE.md`](docs/AI_USAGE.md).
