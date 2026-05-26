import { POLYTOPE_DATA, PROJECTION_2D_LAYOUT } from './data.js';

const TAU = Math.PI * 2;

function cssSize(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const w = Math.max(1, Math.floor(rect.width));
  const h = Math.max(1, Math.floor(rect.height));
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
  }
  return { w, h, dpr };
}

function colorForCell(cellId, alpha = 1) {
  const hue = ((cellId || 0) * 137.508) % 360;
  return `hsla(${hue}, 72%, 58%, ${alpha})`;
}

function vertexLabel(id) {
  return String(id).padStart(3, '0');
}

function rotate4(coords, t) {
  let [x, y, z, w] = coords;
  const a = t * 0.27;
  const b = t * 0.19 + 0.8;
  const ca = Math.cos(a), sa = Math.sin(a);
  const cb = Math.cos(b), sb = Math.sin(b);
  [x, z] = [x * ca - z * sa, x * sa + z * ca];
  [y, w] = [y * cb - w * sb, y * sb + w * cb];
  const perspective = 1 / (3.85 - w * 0.33);
  return { x: x * perspective, y: y * perspective, z };
}

export class MapRenderer {
  constructor({ stateProvider, onModeButtonUpdate }) {
    this.getState = stateProvider;
    this.onModeButtonUpdate = onModeButtonUpdate;
    this.view = { panX: 0, panY: 0, zoom: 1, autoRotate: true, drag: null };
    this.lastTime = performance.now();
    this.time = 0;
  }

  resetView() {
    this.view.panX = 0;
    this.view.panY = 0;
    this.view.zoom = 1;
  }

  togglePause() {
    this.view.autoRotate = !this.view.autoRotate;
    this.onModeButtonUpdate?.();
  }

  attach(canvas) {
    const onPointerDown = (event) => {
      event.preventDefault();
      canvas.setPointerCapture?.(event.pointerId);
      this.view.drag = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        button: event.button,
        pan: event.button === 2 || event.shiftKey
      };
    };
    const onPointerMove = (event) => {
      if (!this.view.drag || this.view.drag.id !== event.pointerId) return;
      const dx = event.clientX - this.view.drag.x;
      const dy = event.clientY - this.view.drag.y;
      this.view.drag.x = event.clientX;
      this.view.drag.y = event.clientY;
      if (this.view.drag.pan) {
        this.view.panX += dx;
        this.view.panY += dy;
      } else {
        this.time += dx * 0.01 + dy * 0.005;
      }
    };
    const end = (event) => {
      if (this.view.drag?.id === event.pointerId) this.view.drag = null;
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.001);
      this.view.zoom = Math.max(0.35, Math.min(5, this.view.zoom * factor));
    }, { passive: false });
  }

  visibleSetForState(state) {
    let visible = new Set(POLYTOPE_DATA.vertices.map(v => v.id));
    if (state.focusMode === 1) {
      visible = new Set();
      const current = POLYTOPE_DATA.vertices[state.currentVertex];
      for (const cellId of current.cells) {
        const cell = POLYTOPE_DATA.cells[cellId];
        for (const vertexId of cell.vertices) visible.add(vertexId);
      }
    }
    if (state.mapFilter === 'visited') {
      visible = new Set([...visible].filter(id => state.discovered.has(id)));
      visible.add(state.currentVertex);
    } else if (state.mapFilter === 'unvisited') {
      visible = new Set([...visible].filter(id => !state.discovered.has(id)));
      visible.add(state.currentVertex);
    }
    return visible;
  }

  localFocusVertices(state) {
    const current = POLYTOPE_DATA.vertices[state.currentVertex];
    const set = new Set();
    for (const cellId of current.cells) for (const v of POLYTOPE_DATA.cells[cellId].vertices) set.add(v);
    const queue = [state.currentVertex];
    const visited = new Set(queue);
    const ordered = [state.currentVertex];
    for (let head = 0; head < queue.length; head++) {
      const id = queue[head];
      for (const n of POLYTOPE_DATA.vertices[id].neighbors) {
        if (!set.has(n) || visited.has(n)) continue;
        visited.add(n); queue.push(n); ordered.push(n);
      }
    }
    for (const id of [...set].sort((a,b)=>a-b)) if (!visited.has(id)) ordered.push(id);
    return ordered.slice(0, PROJECTION_2D_LAYOUT.nodes.length);
  }

  render(canvas, full = false) {
    const state = this.getState();
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;
    if (this.view.autoRotate) this.time += dt;

    const { w, h, dpr } = cssSize(canvas);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#090d18';
    ctx.fillRect(0, 0, w, h);

    if (state.focusMode === 2) this.render2DFocus(ctx, w, h, state, full);
    else this.render4D(ctx, w, h, state, full);
  }

  render4D(ctx, w, h, state, full) {
    const visible = this.visibleSetForState(state);
    const points = new Map();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const v of POLYTOPE_DATA.vertices) {
      const p = rotate4(v.coords, this.time);
      points.set(v.id, p);
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const scale = Math.min(w / (maxX - minX + 0.35), h / (maxY - minY + 0.35)) * 0.86 * this.view.zoom;
    const cx = w / 2 + this.view.panX;
    const cy = h / 2 + this.view.panY;
    const xy = (id) => {
      const p = points.get(id);
      return [cx + p.x * scale, cy + p.y * scale];
    };

    ctx.lineCap = 'round';
    ctx.lineWidth = full ? 1.2 : 0.75;
    for (const edge of POLYTOPE_DATA.edges) {
      const [a, b] = edge.endpoints;
      if (!visible.has(a) || !visible.has(b)) continue;
      const [x1, y1] = xy(a), [x2, y2] = xy(b);
      ctx.strokeStyle = 'rgba(210,225,255,0.20)';
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }

    for (const v of POLYTOPE_DATA.vertices) {
      if (!visible.has(v.id)) continue;
      const [x, y] = xy(v.id);
      const isCurrent = v.id === state.currentVertex;
      const isDiscovered = state.discovered.has(v.id);
      const r = isCurrent ? (full ? 7 : 5.2) : (full ? 3.2 : 2.3);
      ctx.fillStyle = isCurrent ? '#ffffff' : isDiscovered ? colorForCell(v.cells[0], 0.95) : 'rgba(130,145,175,0.42)';
      ctx.shadowColor = isCurrent ? 'rgba(255,255,255,0.9)' : 'transparent';
      ctx.shadowBlur = isCurrent ? 12 : 0;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      if (full && (isCurrent || (state.focusMode === 1 && isDiscovered))) {
        ctx.font = '700 10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#050812'; ctx.fillText(vertexLabel(v.id), x, y);
      }
    }
  }

  render2DFocus(ctx, w, h, state, full) {
    const layout = PROJECTION_2D_LAYOUT;
    const local = this.localFocusVertices(state);
    const mapNodeToVertex = new Map(layout.nodes.map((n, i) => [n.id, local[i] ?? null]));
    const margin = full ? 60 : 18;
    const [vx, vy, vw, vh] = layout.viewBox;
    const nodeRadius = full ? 9 : 5;
    const scale = Math.min((w - margin * 2) / vw, (h - margin * 2) / vh) * this.view.zoom;
    const ox = w / 2 - (vx + vw / 2) * scale + this.view.panX;
    const oy = h / 2 - (vy + vh / 2) * scale + this.view.panY;
    const pos = (nodeId) => {
      const n = layout.nodes[nodeId];
      return [ox + n.x * scale, oy + n.y * scale];
    };

    ctx.lineCap = 'round';
    ctx.lineWidth = full ? 1.5 : 1.0;
    for (const e of layout.edges) {
      const va = mapNodeToVertex.get(e.a);
      const vb = mapNodeToVertex.get(e.b);
      if (state.mapFilter === 'visited' && (!state.discovered.has(va) || !state.discovered.has(vb))) continue;
      if (state.mapFilter === 'unvisited' && (state.discovered.has(va) || state.discovered.has(vb))) continue;
      const [x1, y1] = pos(e.a), [x2, y2] = pos(e.b);
      ctx.strokeStyle = 'rgba(210,225,255,0.34)';
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }

    for (const n of layout.nodes) {
      const vertexId = mapNodeToVertex.get(n.id);
      if (vertexId == null) continue;
      if (state.mapFilter === 'visited' && !state.discovered.has(vertexId) && vertexId !== state.currentVertex) continue;
      if (state.mapFilter === 'unvisited' && state.discovered.has(vertexId) && vertexId !== state.currentVertex) continue;
      const [x, y] = pos(n.id);
      const current = vertexId === state.currentVertex;
      const discovered = state.discovered.has(vertexId);
      ctx.fillStyle = current ? '#ffffff' : discovered ? colorForCell(POLYTOPE_DATA.vertices[vertexId].cells[0], 0.96) : 'rgba(130,145,175,0.48)';
      ctx.shadowColor = current ? 'rgba(255,255,255,0.9)' : 'transparent';
      ctx.shadowBlur = current ? 12 : 0;
      ctx.beginPath(); ctx.arc(x, y, nodeRadius, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(5,8,15,0.9)'; ctx.lineWidth = full ? 1.4 : 1;
      ctx.stroke();
      if (full || current) {
        ctx.font = `800 ${full ? 10 : 8}px system-ui`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = current ? '#050812' : 'rgba(5,8,15,0.90)';
        ctx.fillText(vertexLabel(vertexId), x, y);
      }
    }
  }
}
