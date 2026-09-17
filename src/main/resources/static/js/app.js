import {BoardApiClient} from './api/board-api-client.js';
import {createBoardState} from './state/board-state.js';
import {createBoardView} from './ui/board-view.js';

// BoardApp: orchestrates BoardApiClient (HTTP) + BoardState (local truth) +
// BoardView (SVG projection). This module owns wiring only — no HTTP calls
// and no direct DOM business logic live here beyond reading input values.
const state = createBoardState();
const view = createBoardView(document.querySelector('#boardCanvas'));
const $ = id => document.getElementById(id);
let connecting = false;

const ACTION_BUTTON_IDS = ['newBoardBtn', 'loadBtn', 'saveBtn', 'addRectBtn', 'addTextBtn', 'connectBtn', 'deleteBtn'];

function refresh(message = '') {
  const s = state.snapshot();
  view.render(s);
  $('remoteStatus').textContent = s.remote.status;
  $('message').textContent = message || s.remote.error?.message || '';
  $('retryBtn').hidden = !s.remote.lastAction || s.remote.status !== 'error';

  const isBusy = s.remote.status === 'loading';
  ACTION_BUTTON_IDS.forEach(id => { $(id).disabled = isBusy; });
  $('retryBtn').disabled = isBusy;

  $('boardId').value = s.board.id ?? $('boardId').value;
  $('boardName').value = s.board.name;
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

view.on({
  select(id) { state.select(id); refresh(); },
  move(id, x, y) { state.select(id); state.moveSelected(x, y); refresh(); },
  connectTarget(id) {
    if (connecting) {
      state.completeConnect(id);
      connecting = false;
      refresh('Connector created locally. Save to persist.');
    }
  }
});

// Each remote action reads its inputs once, when the button is clicked, so a
// later Retry repeats the same operation even if the inputs changed meanwhile.
$('newBoardBtn').onclick = () => {
  const name = $('boardName').value.trim();
  remote('Creating', async () => {
    state.setBoard(await BoardApiClient.create(name));
    return 'Board created';
  });
};
$('loadBtn').onclick = () => {
  const id = $('boardId').value.trim();
  remote('Loading', async () => {
    state.setBoard(await BoardApiClient.load(id));
    return 'Board loaded';
  });
};
$('saveBtn').onclick = () => {
  state.setName($('boardName').value.trim());
  remote('Saving', async () => {
    state.setBoard(await BoardApiClient.save(state.toPersistedBoard()));
    return 'Board saved';
  });
};
$('retryBtn').onclick = () => {
  const action = state.snapshot().remote.lastAction;
  if (action) remote('Retrying', action);
};
$('addRectBtn').onclick = () => { state.addRectangle(); refresh('Rectangle added locally'); };
$('addTextBtn').onclick = () => { state.addText(); refresh('Text added locally'); };
$('connectBtn').onclick = () => { state.beginConnect(); connecting = true; refresh('Select the target element'); };
$('deleteBtn').onclick = () => { state.removeSelected(); refresh('Element removed locally'); };

refresh();
