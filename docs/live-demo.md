# Guion de la demo en vivo — Lab #6

Paso a paso para que Sofía y José prueben la colaboración en tiempo real antes
de la sustentación y la repitan igual frente al profesor. Sigue los 9 pasos de
la sección 9 de la guía del laboratorio, en el mismo orden que las capturas de
[`evidence/`](evidence/). Dura unos 5 minutos.

## 1. Antes de empezar (cada uno, una sola vez)

1. Traer la última versión del repositorio:

   ```bash
   git pull origin main
   ```

2. Confirmar Java 21 y Maven:

   ```bash
   java -version
   mvn -v
   ```

3. Correr las pruebas. Debe terminar en **36 pruebas, 0 fallos**:

   ```bash
   mvn clean test
   ```

4. Levantar la aplicación y dejar esa terminal abierta durante toda la demo:

   ```bash
   mvn clean spring-boot:run
   ```

   Está lista cuando aparece `Started CollaborativeBoardApplication`. El
   `clean` importa: con un `target/` viejo, Spring puede servir una página
   antigua.

5. Abrir <http://localhost:8080/> y comprobar que el encabezado dice
   **Lab #6 — Real-Time Collaboration** y muestra dos estados: `REST` y `LIVE`.

## 2. Elegir el modo

| | Modo A — un computador (recomendado para la sustentación) | Modo B — dos computadores |
|---|---|---|
| Servidor | Uno solo, en el computador de quien presenta | Uno solo, en el computador de José (o de quien lo levante) |
| Browser A | Ventana 1 | Computador de José: <http://localhost:8080/> |
| Browser B | Ventana 2 (otra ventana, al lado) | Computador de Sofía: `http://<IP-de-José>:8080/` |
| Browser C | Ventana 3: otro navegador o una ventana privada | Cualquiera de los dos, en una ventana aparte |
| Riesgo | Ninguno de red | La red de la universidad puede bloquear conexiones entre equipos |

**Modo A.** Dos ventanas del mismo navegador sirven: cada pestaña tiene su
propio `Actor` (vive en `sessionStorage`), así que cuentan como dos
colaboradores. Pónganlas lado a lado para que el profesor vea las dos a la vez
(macOS: arrastrar a los bordes o Split View; Windows: `Win + ←` y `Win + →`).

**Modo B.** Quien corre el servidor busca su IP en la red local:

```bash
ipconfig getifaddr en0
```

En Windows es `ipconfig`, en la línea `IPv4 Address`. El otro abre
`http://<esa-IP>:8080/`. Si el sistema pregunta si Java puede aceptar
conexiones entrantes, hay que permitirlo. Si la página no carga desde el
segundo computador, la red está aislando los equipos: usen el hotspot de un
celular o pasen al Modo A. No hay que cambiar nada del código: el cliente arma
la dirección del WebSocket a partir de la dirección de la página.

## 3. Reparto sugerido

- **José** maneja **Browser A** y el servidor.
- **Sofía** maneja **Browser B** y el **Browser C** del paso 8.
- En el Modo A, uno maneja el mouse y el otro narra qué se está demostrando
  (la columna "Qué demuestra" de abajo). Pueden alternar por bloques: pasos 1 a 4
  uno, pasos 5 a 9 el otro.

## 4. El guion

Después de cada acción, miren la **línea de mensaje** debajo de la barra de
herramientas: dice de dónde vino cada cambio. `applied from client-xxxx` es un
cambio de otro colaborador, y `confirmed by the server` es el servidor
aceptando lo que esa misma ventana publicó.

### Paso 1 — A crea un Board (REST)

- **Browser A:** escribir un nombre (por ejemplo `Lab 6 demo`) y pulsar **New**.
- **Qué deben ver:** `REST: success`, el `boardId` generado en el campo de id,
  el mensaje `Board created. Connect live to collaborate.` y `LIVE: disconnected`.
- **Qué demuestra:** la carga inicial sigue siendo REST (`POST /api/boards`).
  El canal en vivo es un paso aparte y explícito.

### Paso 2 — B carga el mismo Board (REST)

- **Browser A:** copiar el `boardId` completo (en el Modo B, pasarlo por chat).
- **Browser B:** pegarlo en el campo de id y pulsar **Load**.
- **Qué deben ver:** `Board loaded. Connect live to collaborate.` y el mismo
  `boardId` que A.
- **Qué demuestra:** los dos clientes arrancan desde el mismo Board por REST
  (`GET /api/boards/{id}`).

### Paso 3 — Los dos se conectan al canal en vivo

- **Browser A** y **Browser B:** pulsar **Connect live**.
- **Qué deben ver:** `LIVE: connected` y `Subscribed to /topic/boards/<boardId>`.
  Cada ventana muestra un `Actor` distinto.
- **Ahora mismo, Browser C** (para el paso 8): escribir otro nombre (por ejemplo
  `Otro tablero`), pulsar **New** y luego **Connect live**. C queda escuchando
  otro Board desde el principio.

### Paso 4 — A agrega un rectángulo y aparece en B ★

- **Browser A:** pulsar **+ Rectangle**.
- **Qué deben ver:** el rectángulo aparece en B **sin recargar**. A dice
  `ELEMENT_CREATED confirmed by the server` y B dice
  `ELEMENT_CREATED applied from <actor de A>`.
- **Qué demuestra:** dos navegadores con el mismo `boardId` reciben
  `ELEMENT_CREATED`. El evento pasó por el servidor antes de llegar a B.

### Paso 5 — B mueve el rectángulo y A lo ve

- **Browser B:** arrastrar el rectángulo a otro lugar y soltar. Mientras se
  arrastra, el rectángulo se engancha por su esquina superior izquierda; es el
  comportamiento normal de la vista.
- **Qué deben ver:** A **no** se mueve durante el arrastre; salta a la posición
  final **al soltar**. A dice `ELEMENT_MOVED applied from <actor de B>`.
- **Qué demuestra:** mover en un navegador actualiza el otro sin recargar, y el
  movimiento se publica una sola vez, al terminar el arrastre, no en cada píxel.

### Paso 6 — Dos elementos y un conector

1. **Browser A:** **+ Rectangle** (segundo rectángulo).
2. **Browser B:** **+ Text**.
3. **Browser A:** arrastrar el texto a otro lugar. Así el movimiento va de A
   hacia B, al revés del paso 5.
4. **Browser A:** hacer clic en el segundo rectángulo, pulsar
   **Connect selected + next** (el mensaje dice `Select the target element`) y
   hacer clic en el texto.

- **Qué deben ver:** una línea entre el segundo rectángulo y el texto en las dos
  ventanas, unida a los mismos dos elementos. B dice
  `CONNECTOR_CREATED applied from <actor de A>`. Cada ventana tiene 3 nodos y 1
  conector.
- **Qué demuestra:** un conector creado en A aparece en B con los mismos
  extremos.

### Paso 7 — B elimina el rectángulo conectado ★

- **Browser B:** hacer clic en el segundo rectángulo (el que tiene la línea) y
  pulsar **Delete selected**.
- **Qué deben ver:** en las dos ventanas desaparecen el rectángulo **y** la
  línea. Quedan 2 nodos y 0 conectores. A dice
  `ELEMENT_DELETED applied from <actor de B>`.
- **Qué demuestra:** eliminar un elemento elimina también sus conectores
  dependientes en todos los clientes. El servidor aplica la cascada antes del
  broadcast y cada `BoardState` aplica la misma al recibir el evento.

### Paso 8 — Otro Board no recibe nada ★

- **Browser C:** mostrarlo al lado de A y B.
- **Qué deben ver:** C sigue vacío y su mensaje sigue siendo
  `Subscribed to /topic/boards/<otro id>`: no recibió ninguno de los cambios de
  A y B, aunque estuvo conectado en vivo todo el tiempo.
- **Al revés (opcional):** en C pulsar **+ Rectangle**. Aparece en C y **no**
  llega ni a A ni a B.
- **Qué demuestra:** los eventos de un Board no aparecen en otro `boardId`.
  Cada Board tiene su propio destino `/topic/boards/{boardId}`.

> **Si el profesor pide cambiar de Board en una ventana que ya está en vivo**
> (usar **Load** o **New** con otro Board en A o en B): esa ventana cierra sola
> el canal del Board anterior y pasa a `LIVE: disconnected`, para no aplicar
> eventos de un Board sobre otro. Pulsen **Connect live** y quedará suscrita al
> Board nuevo, sin recibir nada del anterior. Cargar otra vez el **mismo**
> Board no la desconecta.

### Paso 9 — Recargar y recuperar el estado por REST

- **Browser B:** recargar la página (`Cmd + R` / `F5`), pegar el mismo
  `boardId` y pulsar **Load**.
- **Qué deben ver:** los mismos elementos y posiciones que tiene A, sin que
  nadie haya pulsado **Save snapshot**. El `Actor` de B es el mismo de antes y
  `LIVE` vuelve a `disconnected` hasta pulsar **Connect live** otra vez.
- **Qué demuestra:** el estado se recupera por REST. Los eventos ya se habían
  aplicado al Board autoritativo del servidor, no solo a los navegadores.

## 5. Mostrar el protocolo en las DevTools (opcional, pero convence)

En Chrome, **antes** de pulsar **Connect live**, abrir las DevTools
(`Cmd + Option + I` / `F12`) en la pestaña **Network**:

- Filtro **Fetch/XHR:** se ven `POST /api/boards` (paso 1) y
  `GET /api/boards/{id}` (pasos 2 y 9). Eso es REST.
- Filtro **WS**, clic en la conexión `ws`, pestaña **Messages:** se ven los
  frames STOMP: `SUBSCRIBE` con `destination:/topic/boards/...`, cada `SEND`
  con `destination:/app/boards/.../events`, y cada `MESSAGE` que llega de
  `/topic/boards/...` con el JSON del `BoardEvent`.
- En **Browser C**, la misma pestaña no muestra ningún `MESSAGE` hasta que C
  publica en su propio Board. Es la prueba del aislamiento a nivel de protocolo.

Las DevTools tienen que estar abiertas antes de conectar; si se abren después,
Chrome no muestra los frames anteriores.

## 6. Si algo falla

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `Port 8080 was already in use` al arrancar | Quedó otra instancia corriendo | macOS: `lsof -iTCP:8080 -sTCP:LISTEN` y `kill <PID>`. Windows: `netstat -ano \| findstr :8080` y `taskkill /PID <PID> /F` |
| La página se ve distinta a la de las capturas | `target/` viejo o caché del navegador | Parar el servidor, `mvn clean spring-boot:run` y recargar con `Cmd + Shift + R` / `Ctrl + F5` |
| **Connect live** está deshabilitado | Todavía no hay Board | Crear (**New**) o cargar (**Load**) uno primero |
| `LIVE: error` o `Live connection failed: ...` | El servidor no está corriendo o se cayó | Revisar la terminal del servidor y volver a pulsar **Connect live** |
| Los cambios no llegan a la otra ventana | Las dos ventanas no están en el mismo `boardId`, o una no está en `LIVE: connected` | Comparar el `boardId` de las dos y conectar la que falte |
| Después de **New** o **Load**, `LIVE` pasó a `disconnected` | Es intencional: se cambió a otro Board y el canal en vivo pertenece a un solo Board | Pulsar **Connect live** para suscribirse al Board nuevo |
| Un cambio dice `(local only)` | Esa ventana no estaba conectada en vivo cuando se hizo | Conectar y usar **Load** para ponerse al día. Un cliente desconectado se pierde los eventos y no hay historial |
| En el Modo B la página no carga desde el otro computador | Firewall o red que aísla equipos | Permitir Java en el firewall, probar con el hotspot de un celular o pasar al Modo A |

## 7. Preguntas probables del profesor

| Pregunta | Respuesta corta | Dónde está el detalle |
|---|---|---|
| ¿Por qué los clientes publican en `/app` y no en `/topic`? | `/app` lleva el mensaje al controlador, que lo valida y lo aplica al Board antes de retransmitirlo. Un evento rechazado no le llega a nadie | README §7.2, [`event-contract.md`](event-contract.md) |
| ¿Por qué no reemplazaron REST por WebSocket? | REST hace el arranque y el snapshot; STOMP lleva solo los cambios en vivo. Un cliente que se desconecta se pone al día con REST | [`ADR-003`](ADR-003-rest-vs-realtime.md) |
| ¿El callback de STOMP toca el SVG? | No. `onEvent` llama a `state.applyEvent(event)` y luego `refresh()` vuelve a dibujar desde `BoardState` | `js/app.js`, `js/state/board-state.js` |
| ¿Dónde vive STOMP en el cliente? | Solo en `js/realtime/board-realtime-client.js`: `app.js` no nombra ningún topic | [`ADR-003`](ADR-003-rest-vs-realtime.md), sección de evidencia |
| ¿Qué pasa si el sobre dice un `boardId` distinto al del destino? | El controlador lo descarta: el destino manda, así nadie escribe en un Board que no está editando | `BoardWebSocketController`, [`event-contract.md`](event-contract.md) |
| ¿`BoardEvent` es parte del dominio? | No. Vive en `application/event`: describe comunicación entre participantes; `Board` y `BoardElement` siguen describiendo el estado | Diagrama de clases, nota "Contrato ≠ dominio" |
| ¿Qué pasa si dos personas mueven lo mismo a la vez? | Hoy gana el último en escribir: `apply` lee, modifica y guarda sin bloqueo. Es deliberado y es el material del Lab #7 | README §12 |
| ¿Por qué el actor está en `sessionStorage`? | Para que dos pestañas del mismo navegador cuenten como dos colaboradores; `localStorage` lo comparten todas las pestañas | README §4.1 |
