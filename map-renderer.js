(() => {
const { POLYTOPE_DATA, PROJECTION_2D_LAYOUT } = window;

const TAU = Math.PI * 2;

const LAYOUT_NODE_BY_ID = new Map(PROJECTION_2D_LAYOUT.nodes.map(node => [node.id, node]));
const LAYOUT_NODE_IDS = PROJECTION_2D_LAYOUT.nodes.map(node => node.id);
const LAYOUT_ADJ = new Map(LAYOUT_NODE_IDS.map(id => [id, new Set()]));
for (const edge of PROJECTION_2D_LAYOUT.edges) {
  LAYOUT_ADJ.get(edge.a).add(edge.b);
  LAYOUT_ADJ.get(edge.b).add(edge.a);
}
const LAYOUT_CENTER_NODE = 0;
const LAYOUT_DIST = graphDistances(LAYOUT_ADJ, LAYOUT_CENTER_NODE);
const LAYOUT_DEGREE = new Map(LAYOUT_NODE_IDS.map(id => [id, LAYOUT_ADJ.get(id).size]));
const LAYOUT_SIGNATURE = new Map(LAYOUT_NODE_IDS.map(id => [id, graphNodeSignature(LAYOUT_ADJ, LAYOUT_DIST, LAYOUT_DEGREE, id)]));
const TOPOLOGY_2D_CACHE = new Map();

function graphDistances(adj, start) {
  const queue = [start];
  const dist = new Map([[start, 0]]);
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head];
    const nextDistance = dist.get(id) + 1;
    for (const neighbor of adj.get(id) || []) {
      if (dist.has(neighbor)) continue;
      dist.set(neighbor, nextDistance);
      queue.push(neighbor);
    }
  }
  return dist;
}

function graphNodeSignature(adj, dist, degree, id) {
  const neighborProfile = [...(adj.get(id) || [])]
    .map(neighbor => `${dist.get(neighbor)}:${degree.get(neighbor)}`)
    .sort()
    .join('|');
  return `${dist.get(id)}:${degree.get(id)}:${neighborProfile}`;
}

function localFocusGraph(currentVertex) {
  const current = POLYTOPE_DATA.vertices[currentVertex];
  const vertices = new Set();
  for (const cellId of current.cells) {
    for (const vertexId of POLYTOPE_DATA.cells[cellId].vertices) vertices.add(vertexId);
  }
  const adj = new Map();
  for (const vertexId of vertices) {
    adj.set(vertexId, new Set(POLYTOPE_DATA.vertices[vertexId].neighbors.filter(neighbor => vertices.has(neighbor))));
  }
  return { vertices: [...vertices], adj };
}

function compute2DTopologyMapping(currentVertex) {
  if (TOPOLOGY_2D_CACHE.has(currentVertex)) return TOPOLOGY_2D_CACHE.get(currentVertex);

  const graph = localFocusGraph(currentVertex);
  const localDist = graphDistances(graph.adj, currentVertex);
  const localDegree = new Map(graph.vertices.map(id => [id, graph.adj.get(id).size]));
  const localSignature = new Map(graph.vertices.map(id => [id, graphNodeSignature(graph.adj, localDist, localDegree, id)]));

  let candidates = new Map(LAYOUT_NODE_IDS.map(nodeId => [
    nodeId,
    graph.vertices.filter(vertexId => localSignature.get(vertexId) === LAYOUT_SIGNATURE.get(nodeId))
  ]));

  if ([...candidates.values()].some(list => list.length === 0)) {
    candidates = new Map(LAYOUT_NODE_IDS.map(nodeId => [
      nodeId,
      graph.vertices.filter(vertexId =>
        localDist.get(vertexId) === LAYOUT_DIST.get(nodeId) &&
        localDegree.get(vertexId) === LAYOUT_DEGREE.get(nodeId)
      )
    ]));
  }

  candidates.set(LAYOUT_CENTER_NODE, [currentVertex]);

  const nodeToVertex = new Map([[LAYOUT_CENTER_NODE, currentVertex]]);
  const usedVertices = new Set([currentVertex]);
  const unassignedNodes = new Set(LAYOUT_NODE_IDS.filter(id => id !== LAYOUT_CENTER_NODE));

  const isCompatible = (nodeId, vertexId) => {
    if (usedVertices.has(vertexId)) return false;
    const localNeighbors = graph.adj.get(vertexId);
    for (const [mappedNodeId, mappedVertexId] of nodeToVertex) {
      const layoutConnected = LAYOUT_ADJ.get(nodeId).has(mappedNodeId);
      const localConnected = localNeighbors.has(mappedVertexId);
      if (layoutConnected !== localConnected) return false;
    }
    return true;
  };

  const forwardCheck = (nodeId, vertexId) => {
    for (const layoutNeighbor of LAYOUT_ADJ.get(nodeId)) {
      if (nodeToVertex.has(layoutNeighbor)) continue;
      let exists = false;
      for (const candidate of candidates.get(layoutNeighbor) || []) {
        if (usedVertices.has(candidate) || candidate === vertexId) continue;
        if (!graph.adj.get(vertexId).has(candidate)) continue;
        let compatible = true;
        for (const [mappedNodeId, mappedVertexId] of nodeToVertex) {
          const layoutConnected = LAYOUT_ADJ.get(layoutNeighbor).has(mappedNodeId);
          const localConnected = graph.adj.get(candidate).has(mappedVertexId);
          if (layoutConnected !== localConnected) { compatible = false; break; }
        }
        if (compatible) { exists = true; break; }
      }
      if (!exists) return false;
    }
    return true;
  };

  const compatibleCandidateCount = (nodeId) => {
    let count = 0;
    for (const candidate of candidates.get(nodeId) || []) {
      if (isCompatible(nodeId, candidate)) count++;
    }
    return count;
  };

  const chooseNextNode = () => {
    let best = null;
    let bestAssignedNeighbors = -1;
    let bestCandidateCount = Infinity;
    let bestDistance = Infinity;
    for (const nodeId of unassignedNodes) {
      const assignedNeighbors = [...LAYOUT_ADJ.get(nodeId)].filter(neighbor => nodeToVertex.has(neighbor)).length;
      if (assignedNeighbors === 0) continue;
      const count = compatibleCandidateCount(nodeId);
      const distance = LAYOUT_DIST.get(nodeId);
      if (
        assignedNeighbors > bestAssignedNeighbors ||
        (assignedNeighbors === bestAssignedNeighbors && count < bestCandidateCount) ||
        (assignedNeighbors === bestAssignedNeighbors && count === bestCandidateCount && distance < bestDistance) ||
        (assignedNeighbors === bestAssignedNeighbors && count === bestCandidateCount && distance === bestDistance && (best == null || nodeId < best))
      ) {
        best = nodeId;
        bestAssignedNeighbors = assignedNeighbors;
        bestCandidateCount = count;
        bestDistance = distance;
      }
    }
    if (best != null) return best;
    return [...unassignedNodes].sort((a, b) => (candidates.get(a)?.length || 0) - (candidates.get(b)?.length || 0))[0];
  };

  const search = () => {
    if (unassignedNodes.size === 0) return true;
    const nodeId = chooseNextNode();
    if (nodeId == null) return false;
    const candidateList = [...(candidates.get(nodeId) || [])].sort((a, b) => a - b);
    unassignedNodes.delete(nodeId);
    for (const candidate of candidateList) {
      if (!isCompatible(nodeId, candidate)) continue;
      if (!forwardCheck(nodeId, candidate)) continue;
      nodeToVertex.set(nodeId, candidate);
      usedVertices.add(candidate);
      if (search()) return true;
      usedVertices.delete(candidate);
      nodeToVertex.delete(nodeId);
    }
    unassignedNodes.add(nodeId);
    return false;
  };

  if (!search()) throw new Error(`Could not map 2D focus topology for vertex ${currentVertex}`);

  for (const edge of PROJECTION_2D_LAYOUT.edges) {
    const a = nodeToVertex.get(edge.a);
    const b = nodeToVertex.get(edge.b);
    if (!graph.adj.get(a)?.has(b)) throw new Error(`Invalid 2D focus topology edge for vertex ${currentVertex}`);
  }

  const vertexToNode = new Map([...nodeToVertex].map(([nodeId, vertexId]) => [vertexId, nodeId]));
  const result = { nodeToVertex, vertexToNode, localAdj: graph.adj };
  TOPOLOGY_2D_CACHE.set(currentVertex, result);
  return result;
}


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

class MapRenderer {
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

  get2DTopologyMapping(currentVertex) {
    return compute2DTopologyMapping(currentVertex);
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
    const topology = this.get2DTopologyMapping(state.currentVertex);
    const mapNodeToVertex = topology.nodeToVertex;
    const margin = full ? 60 : 18;
    const [vx, vy, vw, vh] = layout.viewBox;
    const nodeRadius = full ? 9 : 5;
    const scale = Math.min((w - margin * 2) / vw, (h - margin * 2) / vh) * this.view.zoom;
    const ox = w / 2 - (vx + vw / 2) * scale + this.view.panX;
    const oy = h / 2 - (vy + vh / 2) * scale + this.view.panY;
    const pos = (nodeId) => {
      const n = LAYOUT_NODE_BY_ID.get(nodeId);
      return [ox + n.x * scale, oy + n.y * scale];
    };

    ctx.lineCap = 'round';
    ctx.lineWidth = full ? 1.5 : 1.0;
    for (const e of layout.edges) {
      const va = mapNodeToVertex.get(e.a);
      const vb = mapNodeToVertex.get(e.b);
      if (!topology.localAdj.get(va)?.has(vb)) continue;
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

window.MapRenderer = MapRenderer;
})();
