# ARSW Collaborative Board — Lab #4 & Lab #5

> Lab #4: backend modular, contratos y persistencia desacoplada.
> Lab #5: cliente web interactivo en SVG sobre el mismo contrato REST.
> Asignatura: Arquitecturas de Software (ARSW) — 2026-2

## Autor(es)

- Nombre: Jose Luis Lancheros Ayola y Gina Sofia Garcia Zapata

## 1. Descripción

El **ARSW Collaborative Board** es un tablero de arquitectura. El Board se
persiste únicamente en memoria del proceso; no hay base de datos,
autenticación ni tiempo real (eso llega en labs posteriores).

- **Lab #4** construyó la **arquitectura base del backend**: separación de
  responsabilidades, inversión de dependencias (DIP), inyección por
  constructor y manejo uniforme de errores.
- **Lab #5** agregó un **cliente web interactivo** (JavaScript ES Modules +
  SVG, sin frameworks) que consume esos mismos tres endpoints, y evolucionó el
  dominio con el tipo `CONNECTOR`.

```
Web Client (static/js — ES Modules + SVG)
  BoardApp ──> BoardApiClient ──┐
     ├──────> BoardState        │ HTTP/JSON
     └──────> BoardView         │
                                v
                          REST Controller
                                |
                                v
                        Application Service
                                |
                                v
                       BoardRepository (port)
                                |
                                v
                   InMemoryBoardRepository (adapter)
```

## 2. Requisitos previos

- Java 21
- Maven 3.9+ (o el wrapper `mvnw` si el starter lo incluye)

## 3. Cómo ejecutar el proyecto

```bash
mvn clean spring-boot:run
```

- Cliente web: <http://localhost:8080/>
- API REST: <http://localhost:8080/api/boards>

> El `clean` importa: si queda un `target/` viejo, Spring puede servir la
> página del starter del Lab #4 en vez del cliente interactivo.

## 4. Cómo usar el cliente web

1. Escriba un nombre y presione **New** — el `boardId` generado por el
   servidor aparece en el campo de id.
2. **+ Rectangle** y **+ Text** agregan elementos; arrástrelos para moverlos.
3. Seleccione un elemento, presione **Connect selected + next** y haga clic en
   el segundo elemento para crear un `CONNECTOR`.
4. **Delete selected** elimina el elemento seleccionado (y los conectores que
   lo referenciaban, para no guardar conectores colgantes).
5. **Save** envía el Board completo con `PUT`. **Load** lo recupera por id.
6. Durante una operación remota el estado muestra `loading` y los botones se
   deshabilitan; si falla, aparece el mensaje del servidor y un botón
   **Retry** que repite la última operación.

Evidencia visual del flujo: [`docs/evidence/`](docs/evidence/).

## 5. Cómo ejecutar las pruebas

```bash
mvn test
```

Resultado actual: **12 pruebas, 0 fallos**.

- [x] `mvn test` finaliza correctamente
- [x] Incluye pruebas del `BoardApplicationService` (sin levantar servidor web)
- [x] Incluye pruebas del contrato REST
- [x] Incluye una prueba que demuestre el caso "Board inexistente"
- [x] Incluye pruebas de las invariantes de `CONNECTOR`

| Prueba | Qué cubre |
|---|---|
| `BoardApplicationServiceTest` (4) | Casos de uso create/get/replace sin contexto de Spring, incluido el Board inexistente en `replace` |
| `BoardRestControllerTest` (5) | Contrato HTTP real con servidor en puerto aleatorio: create 201, get 200/404, replace 200/404 |
| `BoardConnectorTest` (3) | Conector válido, conector a un elemento inexistente y conector que apunta a otro conector |

## 6. Estructura del proyecto

```
src/main/java/.../collabboard
├── domain/model
│   ├── Board.java              (invariantes del Board + validateConnectors)
│   ├── BoardElement.java       (invariantes del elemento y del CONNECTOR)
│   └── ElementType.java        (RECTANGLE, TEXT, CONNECTOR)
├── application
│   ├── port/out/BoardRepository.java
│   ├── service/BoardApplicationService.java
│   └── exception/BoardNotFoundException.java
└── infrastructure
    ├── persistence/InMemoryBoardRepository.java
    └── web/rest
        ├── BoardRestController.java
        ├── ApiError.java
        ├── GlobalExceptionHandler.java
        ├── CreateBoardRequest.java
        └── ReplaceBoardRequest.java

src/main/resources/static
├── index.html
├── css/app.css
└── js
    ├── app.js                  (BoardApp — orquestación)
    ├── api/board-api-client.js (único módulo con fetch)
    ├── state/board-state.js    (estado local, única fuente de verdad)
    └── ui/board-view.js        (render SVG + eventos)
```

## 7. Contrato REST

Ver detalle completo en
[`docs/architecture/api-contract.md`](docs/architecture/api-contract.md).

| Método | Recurso              | Propósito          | Respuesta esperada       |
|--------|----------------------|---------------------|---------------------------|
| POST   | `/api/boards`        | Crear Board          | 201 + Board creado        |
| GET    | `/api/boards/{id}`   | Consultar Board       | 200 + Board                |
| PUT    | `/api/boards/{id}`   | Reemplazar estado    | 200 + Board actualizado    |

El Lab #5 **no agregó endpoints**: mover, conectar o eliminar se aplican al
estado local y se persisten con un solo `PUT` del Board completo.

## 8. Decisiones arquitectónicas

- [`docs/ADR-001-repository-boundary.md`](docs/ADR-001-repository-boundary.md):
  límite entre el puerto `BoardRepository` y el adaptador
  `InMemoryBoardRepository`.
- [`docs/ADR-002-client-boundaries.md`](docs/ADR-002-client-boundaries.md):
  separación entre `BoardApiClient`, `BoardState` y `BoardView`.

## 9. Evidencia arquitectónica

| Artefacto            | Ubicación                                   |
|-----------------------|----------------------------------------------|
| Vista ArchiMate        | `docs/architecture/diagrams.drawio` (página "ArchiMate Application View") |
| Diagrama de clases/módulos | `docs/architecture/diagrams.drawio` (página "Class Diagram") |
| Contrato REST          | `docs/architecture/api-contract.md`           |
| ADR-001                | `docs/ADR-001-repository-boundary.md`         |
| ADR-002                | `docs/ADR-002-client-boundaries.md`           |
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

## 11. Pregunta de sustentación (Lab #4)

> Si mañana `InMemoryBoardRepository` se reemplaza por otro adaptador, ¿qué
> componentes deberían cambiar y cuáles deberían permanecer intactos?

**Respuesta:** solo habría que **agregar** una clase nueva en
`infrastructure.persistence` que implemente `BoardRepository` y sea el único
bean de ese tipo en el contexto de Spring (si conviven dos, habría que marcar
uno con `@Primary` o calificarlo).

Permanecen intactos:

- `BoardApplicationService`, porque su constructor recibe la interfaz
  `BoardRepository` y nunca menciona la clase concreta — ningún archivo del
  proyecto hace `new InMemoryBoardRepository()`, el cableado lo hace el
  contenedor de Spring.
- `BoardRestController`, que solo conoce el servicio de aplicación.
- El dominio (`Board`, `BoardElement`, `ElementType`), donde viven las
  invariantes; en particular, las reglas de `CONNECTOR` seguirían aplicándose
  con cualquier adaptador.
- El cliente web completo, porque depende del contrato HTTP, no del
  almacenamiento.
- La interfaz `BoardRepository` misma, salvo que el nuevo adaptador necesite
  operaciones nuevas (por ejemplo listar o paginar): ese caso obligaría a
  crecer el puerto y a tocar todas las implementaciones. Ese trade-off está
  documentado en el ADR-001.

Evidencia de que el límite es real: `BoardApplicationServiceTest` construye el
servicio a mano, sin contexto de Spring, y pasa.

## 12. Alcance y restricciones

Fuera de alcance en esta entrega: WebSockets/STOMP, colaboración
multiusuario en tiempo real, autenticación, base de datos externa,
historial/undo, zoom, permisos, microservicios y despliegue. El Lab #6
agregará la colaboración en tiempo real sobre esta misma base.

## 13. Uso de IA

Ver declaración completa en [`docs/AI_USAGE.md`](docs/AI_USAGE.md).
