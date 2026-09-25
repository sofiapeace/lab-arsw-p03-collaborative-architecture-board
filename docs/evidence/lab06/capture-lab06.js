// Drives the Lab #6 demo (section 9 of the guide) against a running
// `mvn spring-boot:run` and writes the evidence screenshots.
//
// Three isolated browser contexts play Browser A, B and C: they share no
// cookies, localStorage or sessionStorage, exactly like three browsers.
// Every WebSocket frame and every /api/boards response is recorded per window,
// so the isolation claim is backed by frame counts and not only by pictures.
//
// Usage (from any folder with puppeteer-core installed; it downloads no browser):
//   npm install puppeteer-core
//   node capture-lab06.js <output-dir>
// BASE_URL defaults to http://localhost:8080/ and CHROME_PATH to the macOS
// Google Chrome install; override either through the environment.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://localhost:8080/';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = path.resolve(process.argv[2] || 'evidence');
const VIEWPORT = { width: 1180, height: 1000, deviceScaleFactor: 1 };
const TIMEOUT = 10000;

fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function openWindow(browser, name) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport(VIEWPORT);
  const win = { name, page, sent: [], received: [], rest: [] };

  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  cdp.on('Network.webSocketFrameSent', e => win.sent.push(e.response.payloadData));
  cdp.on('Network.webSocketFrameReceived', e => win.received.push(e.response.payloadData));
  page.on('response', r => {
    if (r.url().includes('/api/boards')) {
      win.rest.push(`${r.request().method()} ${new URL(r.url()).pathname} -> ${r.status()}`);
    }
  });
  page.on('pageerror', e => console.log(`[${name}] pageerror: ${e.message}`));

  await page.goto(BASE, { waitUntil: 'networkidle0' });
  win.actor = await page.$eval('#actorId', e => e.textContent);
  return win;
}

const textOf = (win, sel) => win.page.$eval(sel, e => e.textContent);
const waitText = (win, sel, predicate) => win.page.waitForFunction(
  (s, src) => new Function('t', `return ${src}`)(document.querySelector(s)?.textContent ?? ''),
  { timeout: TIMEOUT }, sel, predicate);

// What the SVG currently shows. The view is a projection of BoardState, so
// this is also what the local state holds.
function canvasOf(win) {
  return win.page.evaluate(() => {
    const shapes = [...document.querySelectorAll('#boardCanvas g.shape')].map(g => {
      const first = g.firstElementChild;
      const isRect = first.tagName === 'rect';
      return {
        id: g.dataset.id,
        type: isRect ? 'RECTANGLE' : 'TEXT',
        x: Math.round(+first.getAttribute('x')),
        y: Math.round(+first.getAttribute('y')) - (isRect ? 0 : 20)
      };
    });
    // A connector is drawn between the centers of its endpoints, so equal
    // coordinates in two windows mean the same source and target.
    const connectors = [...document.querySelectorAll('#boardCanvas line.connector')].map(l => ({
      id: l.dataset.id,
      from: [Math.round(+l.getAttribute('x1')), Math.round(+l.getAttribute('y1'))],
      to: [Math.round(+l.getAttribute('x2')), Math.round(+l.getAttribute('y2'))]
    }));
    return { shapes, connectors };
  });
}

async function waitCanvas(win, nodes, connectors) {
  await win.page.waitForFunction((n, c) =>
    document.querySelectorAll('#boardCanvas g.shape').length === n &&
    document.querySelectorAll('#boardCanvas line.connector').length === c,
    { timeout: TIMEOUT }, nodes, connectors);
}

async function centerOf(win, id) {
  return win.page.$eval(`#boardCanvas g[data-id="${id}"]`, g => {
    const r = g.firstElementChild.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
}

async function toClient(win, x, y) {
  return win.page.evaluate((x, y) => {
    const c = document.querySelector('#boardCanvas');
    const pt = c.createSVGPoint();
    pt.x = x; pt.y = y;
    const p = pt.matrixTransform(c.getScreenCTM());
    return { x: p.x, y: p.y };
  }, x, y);
}

async function clickElement(win, id) {
  const c = await centerOf(win, id);
  await win.page.mouse.click(c.x, c.y);
}

// A real pointer drag: down on the element, ten intermediate moves, up.
// BoardView publishes ELEMENT_MOVED once, on pointerup.
async function drag(win, id, svgX, svgY) {
  const from = await centerOf(win, id);
  const to = await toClient(win, svgX, svgY);
  const mouse = win.page.mouse;
  await mouse.move(from.x, from.y);
  await mouse.down();
  for (let i = 1; i <= 10; i++) {
    await mouse.move(from.x + (to.x - from.x) * i / 10, from.y + (to.y - from.y) * i / 10);
  }
  await mouse.up();
}

async function newIds(win, known) {
  const { shapes } = await canvasOf(win);
  return shapes.map(s => s.id).filter(id => !known.includes(id));
}

async function panel(win, label) {
  // Only cosmetic: drop the focus ring on the canvas and the hover on the last
  // clicked button, so the capture shows the board and not the pointer.
  await win.page.evaluate(() => document.activeElement?.blur());
  await win.page.mouse.move(0, 0);
  await sleep(300);
  const png = await win.page.screenshot({ fullPage: true, encoding: 'base64' });
  const { shapes, connectors } = await canvasOf(win);
  const boardId = await win.page.$eval('#boardId', e => e.value);
  const rest = await textOf(win, '#remoteStatus');
  const live = await textOf(win, '#liveStatus');
  return {
    label,
    caption: `actor <b>${win.actor}</b> · board <b>${boardId ? boardId.slice(0, 8) : '—'}</b> · REST ${rest} · LIVE ${live}` +
      ` · <b>${shapes.length} nodos, ${connectors.length} conector${connectors.length === 1 ? '' : 'es'}</b>`,
    png
  };
}

async function composite(browser, file, title, panels) {
  const page = await browser.newPage();
  const width = panels.length === 1 ? 1240 : panels.length === 2 ? 2440 : 3000;
  await page.setViewport({ width, height: 800, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><body style="margin:0;font-family:system-ui,sans-serif;background:#fff;color:#1d2733">
    <div style="padding:14px 20px;font-size:22px;font-weight:600;border-bottom:1px solid #ccd">${title}</div>
    <div style="display:flex;gap:20px;padding:18px 20px">${panels.map(p => `
      <div style="flex:1;min-width:0">
        <div style="font-size:18px;font-weight:700">${p.label}</div>
        <div style="font-size:14px;color:#445;margin:4px 0 8px">${p.caption}</div>
        <img style="width:100%;border:1px solid #99a;display:block" src="data:image/png;base64,${p.png}">
      </div>`).join('')}
    </div></body></html>`);
  await page.screenshot({ path: path.join(OUT, file), fullPage: true });
  await page.close();
  console.log(`  wrote ${file}`);
}

function stompSummary(win, boardIds) {
  const sends = win.sent.filter(f => f.startsWith('SEND'));
  const messages = win.received.filter(f => f.startsWith('MESSAGE'));
  const byBoard = {};
  for (const m of messages) {
    const dest = (m.match(/destination:([^\n]+)/) || [])[1] || '?';
    byBoard[dest] = (byBoard[dest] || 0) + 1;
  }
  const types = messages.map(m => {
    try { return JSON.parse(m.slice(m.indexOf('\n\n') + 2).replace(/\0$/, '')).type; } catch { return '?'; }
  });
  return { sends: sends.length, messages: messages.length, byDestination: byBoard, types };
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const run = { steps: [] };
  const step = (n, text) => { console.log(`Paso ${n}: ${text}`); run.steps.push(`${n}. ${text}`); };

  const A = await openWindow(browser, 'A');
  const B = await openWindow(browser, 'B');
  const C = await openWindow(browser, 'C');

  // 1. Browser A creates a Board over REST.
  step(1, 'A crea un Board por REST');
  await A.page.$eval('#boardName', e => { e.value = ''; });
  await A.page.type('#boardName', 'Lab 6 demo');
  await A.page.click('#newBoardBtn');
  await waitText(A, '#remoteStatus', "t === 'success'");
  const boardId = await A.page.$eval('#boardId', e => e.value);
  await composite(browser, '01-a-board-created.png',
    'Paso 1 — Browser A crea un Board por REST (POST /api/boards)',
    [await panel(A, 'Browser A')]);

  // 2. Browser B loads exactly the same boardId over REST.
  step(2, 'B carga el mismo boardId por REST');
  await B.page.type('#boardId', boardId);
  await B.page.click('#loadBtn');
  await waitText(B, '#remoteStatus', "t === 'success'");
  await composite(browser, '02-b-board-loaded.png',
    'Paso 2 — Browser B carga exactamente el mismo boardId (GET /api/boards/{id})',
    [await panel(B, 'Browser B')]);

  // 3. Both connect to the live channel.
  step(3, 'A y B se conectan al canal live');
  for (const w of [A, B]) {
    await w.page.click('#connectLiveBtn');
    await waitText(w, '#liveStatus', "t === 'connected'");
  }
  await composite(browser, '03-live-connected.png',
    'Paso 3 — A y B conectados al canal live del mismo Board (/topic/boards/{id})',
    [await panel(A, 'Browser A'), await panel(B, 'Browser B')]);

  // Browser C: its own Board, connected live before any change happens, so it
  // is listening during the whole session and can prove it hears nothing.
  await C.page.$eval('#boardName', e => { e.value = ''; });
  await C.page.type('#boardName', 'Otro tablero');
  await C.page.click('#newBoardBtn');
  await waitText(C, '#remoteStatus', "t === 'success'");
  const otherBoardId = await C.page.$eval('#boardId', e => e.value);
  await C.page.click('#connectLiveBtn');
  await waitText(C, '#liveStatus', "t === 'connected'");

  // 4. A adds a rectangle; it appears in B without reloading.
  step(4, 'A agrega un rectángulo y aparece en B');
  await A.page.click('#addRectBtn');
  await waitCanvas(B, 1, 0);
  await waitText(A, '#message', "t.includes('confirmed by the server')");
  await waitText(B, '#message', "t.includes('applied from')");
  const [r1] = await newIds(A, []);
  await composite(browser, '04-rectangle-created-sync.png',
    'Paso 4 — A agrega un rectángulo: B lo recibe como ELEMENT_CREATED sin recargar',
    [await panel(A, 'Browser A (origen)'), await panel(B, 'Browser B (recibe)')]);

  // 5. B moves the rectangle; A sees the new position.
  step(5, 'B mueve el rectángulo y A ve la nueva posición');
  await drag(B, r1, 560, 130);
  await A.page.waitForFunction(id => {
    const r = document.querySelector(`#boardCanvas g[data-id="${id}"] rect`);
    return r && Math.abs(+r.getAttribute('x') - 560) < 2 && Math.abs(+r.getAttribute('y') - 130) < 2;
  }, { timeout: TIMEOUT }, r1);
  await waitText(A, '#message', "t.startsWith('ELEMENT_MOVED applied from')");
  await composite(browser, '05-rectangle-moved-sync.png',
    'Paso 5 — B arrastra el rectángulo: A recibe un único ELEMENT_MOVED al soltar',
    [await panel(A, 'Browser A (recibe)'), await panel(B, 'Browser B (origen)')]);

  // 6. Two more elements (one from each side) and a connector between them.
  step(6, 'Se crean dos elementos y un conector; ambos navegadores lo ven');
  await A.page.click('#addRectBtn');
  await waitCanvas(B, 2, 0);
  const [r2] = await newIds(A, [r1]);
  await B.page.click('#addTextBtn');
  await waitCanvas(A, 3, 0);
  const [t1] = await newIds(B, [r1, r2]);
  // This drag is done in A on purpose: step 5 moved B -> A, this one moves
  // A -> B, so both directions of ELEMENT_MOVED are exercised.
  await drag(A, t1, 330, 390);
  await B.page.waitForFunction(id => {
    const t = document.querySelector(`#boardCanvas g[data-id="${id}"] text`);
    return t && Math.abs(+t.getAttribute('y') - 410) < 2;
  }, { timeout: TIMEOUT }, t1);
  await clickElement(A, r2);
  await A.page.click('#connectBtn');
  await clickElement(A, t1);
  await waitCanvas(B, 3, 1);
  await waitText(B, '#message', "t.startsWith('CONNECTOR_CREATED applied from')");
  const connA = await canvasOf(A);
  const connB = await canvasOf(B);
  await composite(browser, '06-connector-sync.png',
    'Paso 6 — Dos elementos nuevos y un CONNECTOR creado en A: B lo recibe con los mismos extremos',
    [await panel(A, 'Browser A (crea el conector)'), await panel(B, 'Browser B (recibe)')]);

  // 7. B deletes the connected rectangle: the connector goes with it everywhere.
  step(7, 'B elimina el rectángulo conectado; el conector se va en cascada en ambos');
  await clickElement(B, r2);
  await B.page.click('#deleteBtn');
  await waitCanvas(A, 2, 0);
  await waitCanvas(B, 2, 0);
  await waitText(A, '#message', "t.startsWith('ELEMENT_DELETED applied from')");
  await composite(browser, '07-delete-cascade.png',
    'Paso 7 — B elimina el rectángulo conectado: el conector dependiente desaparece en ambos clientes',
    [await panel(A, 'Browser A (recibe)'), await panel(B, 'Browser B (elimina)')]);

  // 8. Session isolation: C, live on another Board, received nothing.
  step(8, 'C, conectado a otro Board, no recibió nada');
  await sleep(500);
  const cBefore = stompSummary(C);
  await composite(browser, '08-session-isolation.png',
    'Paso 8 — Aislamiento: C está conectado en vivo a otro boardId y no recibió ningún cambio de la sesión de A y B',
    [await panel(A, 'Browser A'), await panel(B, 'Browser B'), await panel(C, 'Browser C (otro Board)')]);

  // And the other direction: a change in C never reaches A or B.
  await C.page.click('#addRectBtn');
  await waitCanvas(C, 1, 0);
  await waitText(C, '#message', "t.includes('confirmed by the server')");
  await sleep(1000);
  await waitCanvas(A, 2, 0);
  await waitCanvas(B, 2, 0);
  await composite(browser, '08b-session-isolation-reverse.png',
    'Paso 8 (inverso) — C agrega un rectángulo en su propio Board: A y B no lo reciben',
    [await panel(A, 'Browser A'), await panel(B, 'Browser B'), await panel(C, 'Browser C (otro Board)')]);

  // 9. Reload B and recover the accumulated state over REST.
  step(9, 'B recarga la página y recupera el snapshot por REST');
  const beforeReload = await canvasOf(A);
  await B.page.reload({ waitUntil: 'networkidle0' });
  const restAfterReload = B.rest.length;
  await B.page.type('#boardId', boardId);
  await B.page.click('#loadBtn');
  await waitText(B, '#remoteStatus', "t === 'success'");
  await waitCanvas(B, 2, 0);
  const afterReload = await canvasOf(B);
  await composite(browser, '09-reload-rest-snapshot.png',
    'Paso 9 — B recarga y usa Load: GET /api/boards/{id} devuelve el estado acumulado por los eventos (sin Save)',
    [await panel(A, 'Browser A (sin recargar)'), await panel(B, 'Browser B (recargado + Load)')]);

  const same = JSON.stringify(beforeReload.shapes.sort((a, b) => a.id.localeCompare(b.id))) ===
    JSON.stringify(afterReload.shapes.sort((a, b) => a.id.localeCompare(b.id)));

  const summary = {
    boardId, otherBoardId,
    actors: { A: A.actor, B: B.actor, C: C.actor },
    ids: { r1, r2, t1 },
    connectorAfterStep6: {
      A: connA.connectors, B: connB.connectors
    },
    reloadedStateMatchesA: same,
    restCallsB: B.rest,
    restCallsBAfterReload: B.rest.slice(restAfterReload),
    stomp: {
      A: stompSummary(A), B: stompSummary(B),
      CUntilStep8: cBefore, C: stompSummary(C)
    },
    steps: run.steps
  };
  fs.writeFileSync(path.join(OUT, 'run-summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
