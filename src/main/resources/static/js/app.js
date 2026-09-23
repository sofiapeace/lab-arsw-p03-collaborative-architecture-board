import {BoardApiClient} from './api/board-api-client.js';
import {createBoardState} from './state/board-state.js';
import {createBoardView} from './ui/board-view.js';
import {createBoardRealtimeClient} from './realtime/board-realtime-client.js';
import {BoardEvents} from './events/board-event.js';

// BoardApp: orchestrates BoardApiClient (HTTP) + BoardRealtimeClient (STOMP) +
// BoardState (local truth) + BoardView (SVG projection). This module owns
// wiring only — no HTTP calls, no STOMP destinations and no direct DOM
// business logic beyond reading input values.
//
// Lab #6 keeps the two transports strictly separate here: REST still creates,
// loads and snapshots the Board, while STOMP only carries live changes.
const state = createBoardState();
const view = createBoardView(document.querySelector('#boardCanvas'));
const $ = id => document.getElementById(id);
let connecting = false;
let liveStatus = 'disconnected';

// Per-tab identity, in sessionStorage rather than localStorage: two windows of
// the same browser must count as two different collaborators during the demo,
// and localStorage is shared by every tab of the same origin. It survives a
// reload of the tab, which keeps the actor stable across step 9 of the demo.
const actorId = sessionStorage.getItem('arsw-actor-id') ?? `client-${crypto.randomUUID().slice(0, 8)}`;
sessionStorage.setItem('arsw-actor-id', actorId);

const ACTION_BUTTON_IDS = ['newBoardBtn', 'loadBtn', 'saveBtn', 'addRectBtn', 'addTextBtn', 'connectBtn', 'deleteBtn'];

const realtime = createBoardRealtimeClient({
  onStatus(status) { liveStatus = status; refresh(); },

  // The arrival of a remote change is a state transition followed by a
  // re-render. This callback must never touch the SVG: BoardView rebuilds the
  // canvas from the snapshot, so anything drawn here would be a second copy of
  // the state and would vanish on the next render.
  onEvent(event) {
    try {
      state.applyEvent(event);
      // Naming the origin makes the round trip visible during the demo: an
      // event from another actor is a collaborator's change, while one from
      // this actor is the server confirming what we published.
      refresh(event.actorId === actorId
        ? `${event.type} confirmed by the server`
        : `${event.type} applied from ${event.actorId}`);
    } catch (error) {
      // One unusable message must not end the session, so it is reported and
      // the subscription keeps running.
      console.error('Ignored an incoming board event', event, error);
      refresh(`Ignored an incoming event: ${error.message}`);
    }
  }
});

function refresh(message = '') {
  const s = state.snapshot();
  view.render(s);
  $('remoteStatus').textContent = s.remote.status;
  $('liveStatus').textContent = liveStatus;
  $('actorId').textContent = actorId;
  $('message').textContent = message || s.remote.error?.message || '';
  $('retryBtn').hidden = !s.remote.lastAction || s.remote.status !== 'error';

  const isBusy = s.remote.status === 'loading';
  ACTION_BUTTON_IDS.forEach(id => { $(id).disabled = isBusy; });
  $('retryBtn').disabled = isBusy;

  // Live collaboration needs a Board to subscribe to, so it stays unavailable
  // until REST has created or loaded one.
  const isLive = realtime.isConnected();
  $('connectLiveBtn').disabled = isBusy || !s.board.id || isLive;
  $('disconnectLiveBtn').disabled = !isLive;
}

// The id and name fields belong to the user while they type, so refresh()
// never touches them. They are only rewritten when a board actually arrives
// from the server (New / Load / Save), which is where they become stale —
// before this, a local action such as "+ Rectangle" wiped a boardId being
// typed, because every render pushed the current state back into the inputs.
function showBoardInputs(board) {
  $('boardId').value = board.id;
  $('boardName').value = board.name;
}

// `action` must both call the API and apply its result to the state, so that
// Retry re-runs the complete operation (request + apply) and not just the
// request. It returns the success message to show.
async function remote(label, action) {
  // Prevent incompatible actions while loading/saving: if a remote call is
  // already in flight, ignore a new trigger instead of racing two requests
  // against the same board. Buttons are also disabled in refresh() as the
  // primary defense; this is the defense-in-depth check.
  if (state.snapshot().remote.status === 'loading') return;

  state.setRemote('loading', action, null);
  refresh(`${label}...`);
  try {
    const message = await action();
    state.setRemote('success', null, null);
    refresh(message ?? `${label} OK`);
  } catch (error) {
    // Handled here on purpose: the error is already part of the state and is
    // shown by refresh(), so it must not be rethrown into an event handler
    // (that produced an "Uncaught (in promise)" on every failed operation).
    state.setRemote('error', action, error);
    refresh();
  }
}

// Local-first: the interaction has already been applied to BoardState, and the
// event only tells the other participants about it. Without a live channel the
// action simply stays local, exactly as it behaved in Lab #5.
//
// `build` receives the boardId and returns a BoardEvent. Everything STOMP —
// destination, serialization, connection check — stays inside
// BoardRealtimeClient, so this module never names a topic.
function publish(label, build) {
  const {board} = state.snapshot();
  if (!board.id || !realtime.isConnected()) return `${label} (local only)`;
  try {
    realtime.publish(build(board.id));
    return `${label} and published`;
  } catch (error) {
    return `${label}, but publishing failed: ${error.message}`;
  }
}

view.on({
  select(id) { state.select(id); refresh(); },

  // Dragging stays local while it happens: only the final position is worth
  // announcing, and it arrives through moveEnd.
  move(id, x, y) { state.select(id); state.moveSelected(x, y); refresh(); },

  moveEnd(id, x, y) {
    refresh(publish('Moved', boardId => BoardEvents.elementMoved(boardId, actorId, id, x, y)));
  },

  connectTarget(id) {
    if (!connecting) return;
    const connector = state.completeConnect(id);
    connecting = false;
    if (!connector) { refresh('Connector discarded: pick two different elements'); return; }
    refresh(publish('Connector created', boardId => BoardEvents.connectorCreated(boardId, actorId, connector)));
  }
});

// Each remote action reads its inputs once, when the button is clicked, so a
// later Retry repeats the same operation even if the inputs changed meanwhile.
$('newBoardBtn').onclick = () => {
  const name = $('boardName').value.trim();
  remote('Creating', async () => {
    const board = await BoardApiClient.create(name);
    state.setBoard(board);
    showBoardInputs(board);
    return 'Board created. Connect live to collaborate.';
  });
};
$('loadBtn').onclick = () => {
  const id = $('boardId').value.trim();
  remote('Loading', async () => {
    const board = await BoardApiClient.load(id);
    state.setBoard(board);
    showBoardInputs(board);
    return 'Board loaded. Connect live to collaborate.';
  });
};
$('saveBtn').onclick = () => {
  state.setName($('boardName').value.trim());
  remote('Saving', async () => {
    const board = await BoardApiClient.save(state.toPersistedBoard());
    state.setBoard(board);
    showBoardInputs(board);
    return 'Snapshot saved';
  });
};
$('retryBtn').onclick = () => {
  const action = state.snapshot().remote.lastAction;
  if (action) remote('Retrying', action);
};

// The live channel is opened explicitly, so the REST bootstrap and the
// subscription stay observable as two separate steps during the demo.
$('connectLiveBtn').onclick = async () => {
  const {board} = state.snapshot();
  try {
    await realtime.connect(board.id);
    // The destination is reported by the transport module, not built here:
    // app.js orchestrates and must not know how a STOMP topic is spelled.
    refresh(`Subscribed to ${realtime.topic()}`);
  } catch (error) {
    liveStatus = 'error';
    refresh(`Live connection failed: ${error.message}`);
  }
};
$('disconnectLiveBtn').onclick = async () => {
  await realtime.disconnect();
  refresh('Live collaboration disconnected');
};

$('addRectBtn').onclick = () => {
  const element = state.addRectangle();
  refresh(publish('Rectangle added', boardId => BoardEvents.elementCreated(boardId, actorId, element)));
};
$('addTextBtn').onclick = () => {
  const element = state.addText();
  refresh(publish('Text added', boardId => BoardEvents.elementCreated(boardId, actorId, element)));
};
$('connectBtn').onclick = () => { state.beginConnect(); connecting = true; refresh('Select the target element'); };
$('deleteBtn').onclick = () => {
  const removed = state.removeSelected();
  if (!removed) { refresh('Select an element first'); return; }
  refresh(publish('Element removed', boardId => BoardEvents.elementDeleted(boardId, actorId, removed)));
};

refresh();
