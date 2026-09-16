const NS = 'http://www.w3.org/2000/svg';
function svgEl(name, attrs = {}) {
  const e = document.createElementNS(NS, name);
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
  return e;
}
function center(e) { return { x: e.x + e.width / 2, y: e.y + e.height / 2 }; }

// Renders the SVG canvas as a pure projection of the state snapshot: every
// render() clears the canvas and rebuilds it from scratch, so the DOM never
// becomes a second, divergent copy of the business state.
export function createBoardView(canvas) {
  let handlers = { select: () => {}, move: () => {}, connectTarget: () => {} };
  let drag = null;

  function render(snapshot) {
    canvas.replaceChildren();
    const byId = new Map(snapshot.board.elements.filter(e => e.type !== 'CONNECTOR').map(e => [e.id, e]));

    for (const e of snapshot.board.elements.filter(e => e.type === 'CONNECTOR')) {
      const a = byId.get(e.sourceId), b = byId.get(e.targetId);
      if (!a || !b) continue;
      const ca = center(a), cb = center(b);
      canvas.append(svgEl('line', { x1: ca.x, y1: ca.y, x2: cb.x, y2: cb.y, class: `connector ${snapshot.selectedId === e.id ? 'selected' : ''}`, 'data-id': e.id }));
    }

    for (const e of snapshot.board.elements.filter(e => e.type !== 'CONNECTOR')) {
      const g = svgEl('g', { 'data-id': e.id, class: 'shape' });
      if (e.type === 'RECTANGLE') {
        g.append(svgEl('rect', { x: e.x, y: e.y, width: e.width, height: e.height, rx: 8, fill: '#e8f0f7', stroke: '#597995', class: snapshot.selectedId === e.id ? 'selected' : '' }));
        const t = svgEl('text', { x: e.x + 12, y: e.y + 40, class: 'label' });
        t.textContent = e.text || 'Component';
        g.append(t);
      }
      if (e.type === 'TEXT') {
        const t = svgEl('text', { x: e.x, y: e.y + 20, 'font-size': 20, fill: '#1d2733', class: `label ${snapshot.selectedId === e.id ? 'selected' : ''}` });
        t.textContent = e.text || 'Text';
        g.append(t);
      }
      canvas.append(g);
    }
  }

  canvas.addEventListener('pointerdown', ev => {
    const node = ev.target.closest?.('[data-id]');
    if (!node) return;
    const id = node.dataset.id;
    handlers.select(id);
    handlers.connectTarget(id);
    drag = { id, startX: ev.clientX, startY: ev.clientY };
    canvas.setPointerCapture(ev.pointerId);
  });
  canvas.addEventListener('pointermove', ev => {
    if (!drag) return;
    const pt = canvas.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    const p = pt.matrixTransform(canvas.getScreenCTM().inverse());
    handlers.move(drag.id, p.x, p.y);
  });
  canvas.addEventListener('pointerup', () => { drag = null; });

  return { render, on(next) { handlers = { ...handlers, ...next }; } };
}
