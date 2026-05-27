(() => {
const { POLYTOPE_DATA, MapRenderer, AdventureSave } = window;
const { encodeSave, decodeSave, saveLocal, loadLocal, clearLocal, GAME_VERSION } = AdventureSave;

const SIZE = 15;
const WALL = { N: 1, E: 2, S: 4, W: 8 };
const DIRS = [
  { name: 'N', bit: WALL.N, dx: 0, dy: -1, index: 0 },
  { name: 'E', bit: WALL.E, dx: 1, dy: 0, index: 1 },
  { name: 'S', bit: WALL.S, dx: 0, dy: 1, index: 2 },
  { name: 'W', bit: WALL.W, dx: -1, dy: 0, index: 3 }
];
const DIR_BY_NAME = Object.fromEntries(DIRS.map(d => [d.name, d]));
const OPPOSITE = { N: 'S', S: 'N', E: 'W', W: 'E' };
const SIDE_TO_INDEX = { N: 0, E: 1, S: 2, W: 3 };
const INDEX_TO_SIDE = ['N', 'E', 'S', 'W'];
const PLAYER_R = 0.27;
const PLAYER_MAX_SUBSTEP = PLAYER_R / 3;
const GOLD_R = PLAYER_R * 0.5;
const ENEMY_R = PLAYER_R;
const MARKER_R = 0.34;
const GRAVITY = 30;
const JUMP_HEIGHT = 2.62;
const JUMP_V = Math.sqrt(2 * GRAVITY * JUMP_HEIGHT);
const JUMP_RELEASE_MULT = 0.42;
const JUMP_KEYS = new Set(['w', ' ', 'z', 'arrowup']);
const MOVE_SPEED = 5.2;
const AIR_ACCEL = 26;
const GROUND_ACCEL = 40;
const TRANSITION_MS = 260;
const INVULNERABLE_MS = 3000;
const DEFENSE_MS = 180;
const PHI = (1 + Math.sqrt(5)) / 2;
const ENEMY_ROTATIONS = [-36, -24, -12, 12, 24, 36].map(d => d * Math.PI / 180);
const GOLD_COLOR = '#ffd84a';
const TAU = Math.PI * 2;

const $ = (id) => document.getElementById(id);
const els = {
  loading: $('loading'), maze: $('maze'), map: $('map'), fullMap: $('fullMap'),
  mapOverlay: $('mapOverlay'), closeMap: $('closeMap'), fullMapButton: $('fullMapButton'),
  resetMapView: $('resetMapView'), visitedMode: $('visitedMode'), cellFocus: $('cellFocus'),
  pauseGame: $('pauseGame'), killPlayerButton: $('killPlayerButton'),
  reset: $('reset'), newMazeSet: $('newMazeSet'), seedInput: $('seedInput'), seededNewGame: $('seededNewGame'),
  exportSave: $('exportSave'), saveExport: $('saveExport'), copySave: $('copySave'),
  saveImport: $('saveImport'), importSave: $('importSave'), status: $('status'), message: $('message'),
  goldCounter: $('goldCounter'), goldBar: $('goldBar'), goldFill: $('goldFill'),
  stickBase: $('stickBase'), stickThumb: $('stickThumb'), mobileJump: $('mobileJump'), mobileDefend: $('mobileDefend')
};
const ctx = els.maze.getContext('2d');

function mulberry32(seed) {
  let t = seed >>> 0;
  return function() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
function randInt(rng, n) { return Math.floor(rng() * n); }
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function randomMazeSeed() {
  const values = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(values);
    if (values[0] !== 0) return values[0];
  }
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}
function normalizeSeed(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return null;
  const num = Number(text);
  if (!Number.isSafeInteger(num) || num < 0) return null;
  return num >>> 0;
}
function vertexLabel(id) { return String(id).padStart(3, '0'); }
function floorColorForVertex(vertexId) { return POLYTOPE_DATA.vertices[vertexId].cells[0]; }
function hueForCell(cellId) { return ((cellId || 0) * 137.508) % 360; }
function colorForCell(cellId, alpha = 1) { return `hsla(${hueForCell(cellId)}, 72%, 58%, ${alpha})`; }
function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  if (s === 0) {
    const gray = Math.round(l * 255);
    return [gray, gray, gray];
  }
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255)
  ];
}
function inverseColorForVertex(vertexId, alpha = 1) {
  const [r, g, b] = hslToRgb(hueForCell(floorColorForVertex(vertexId)), 72, 58);
  return `rgba(${255 - r}, ${255 - g}, ${255 - b}, ${alpha})`;
}
function formatElapsed(ms) {
  const sec = Math.floor(ms / 1000); const m = Math.floor(sec / 60); const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
function sideAfterRotation(side, q) { return INDEX_TO_SIDE[(SIDE_TO_INDEX[side] + q + 4) % 4]; }
function sideBeforeRotation(displaySide, q) { return INDEX_TO_SIDE[(SIDE_TO_INDEX[displaySide] - q + 4) % 4]; }
function orientationForDoorAsSide(canonicalSide, desiredDisplaySide) {
  return (SIDE_TO_INDEX[desiredDisplaySide] - SIDE_TO_INDEX[canonicalSide] + 4) % 4;
}
function rotateBit(bit, q) {
  const side = bit === WALL.N ? 'N' : bit === WALL.E ? 'E' : bit === WALL.S ? 'S' : 'W';
  return DIR_BY_NAME[sideAfterRotation(side, q)].bit;
}
function rotateWallBits(bits, q) {
  let out = 0;
  for (const d of DIRS) if (bits & d.bit) out |= rotateBit(d.bit, q);
  return out;
}
function canonPointToDisplay(x, y, q, size = SIZE) {
  if (q === 0) return { x, y };
  if (q === 1) return { x: size - y, y: x };
  if (q === 2) return { x: size - x, y: size - y };
  return { x: y, y: size - x };
}
function displayPointToCanon(x, y, q, size = SIZE) {
  if (q === 0) return { x, y };
  if (q === 1) return { x: y, y: size - x };
  if (q === 2) return { x: size - x, y: size - y };
  return { x: size - y, y: x };
}
function canonCellToDisplay(x, y, q, size = SIZE) {
  const p = canonPointToDisplay(x + 0.5, y + 0.5, q, size);
  return { x: Math.floor(p.x), y: Math.floor(p.y) };
}
function displayCellToCanon(x, y, q, size = SIZE) {
  const p = displayPointToCanon(x + 0.5, y + 0.5, q, size);
  return { x: Math.floor(p.x), y: Math.floor(p.y) };
}
function displayDirToCanon(dx, dy, q) {
  const side = dx === 1 ? 'E' : dx === -1 ? 'W' : dy === 1 ? 'S' : 'N';
  const cside = sideBeforeRotation(side, q);
  const d = DIR_BY_NAME[cside];
  return { dx: d.dx, dy: d.dy, side: cside };
}

function generateMazeData(seed) {
  const mazes = [];
  const oppositeBit = { [WALL.N]: WALL.S, [WALL.S]: WALL.N, [WALL.E]: WALL.W, [WALL.W]: WALL.E };
  const fixedDoorCell = { N: { x: 7, y: 0 }, E: { x: 14, y: 7 }, S: { x: 7, y: 14 }, W: { x: 0, y: 7 } };
  const sides = ['N', 'E', 'S', 'W'];
  const idx = (x, y) => y * SIZE + x;
  const xy = (i) => ({ x: i % SIZE, y: Math.floor(i / SIZE) });
  const inBounds = (x, y) => x >= 0 && x < SIZE && y >= 0 && y < SIZE;

  function carvePassage(cells, passages, a, b, dir) {
    cells[a] &= ~dir.bit;
    cells[b] &= ~oppositeBit[dir.bit];
    passages[a].add(b);
    passages[b].add(a);
  }

  function shortestPathDistance(passages, start, target) {
    if (start === target) return 0;
    const dist = Array(SIZE * SIZE).fill(-1);
    const queue = [start];
    dist[start] = 0;
    for (let head = 0; head < queue.length; head++) {
      const cell = queue[head];
      const nextDist = dist[cell] + 1;
      for (const neighbor of passages[cell]) {
        if (dist[neighbor] >= 0) continue;
        if (neighbor === target) return nextDist;
        dist[neighbor] = nextDist;
        queue.push(neighbor);
      }
    }
    return Infinity;
  }

  function measureSpurLength(passages, tip) {
    let length = 1;
    let previous = -1;
    let current = tip;
    while (true) {
      const forward = [...passages[current]].filter(n => n !== previous);
      if (forward.length !== 1) break;
      const next = forward[0];
      if (passages[next].size !== 2) break;
      previous = current;
      current = next;
      length++;
    }
    return length;
  }

  function maybeOpenPhiContact(cells, passages, visited, parent, current) {
    if (passages[current].size !== 1) return false;
    const spurLength = measureSpurLength(passages, current);
    const required = Math.ceil(Math.pow(spurLength, PHI));
    const { x, y } = xy(current);
    let best = null;

    for (const dir of DIRS) {
      const nx = x + dir.dx, ny = y + dir.dy;
      if (!inBounds(nx, ny)) continue;
      const neighbor = idx(nx, ny);
      if (!visited[neighbor]) continue;
      if (parent[current] === neighbor) continue;
      if (passages[current].has(neighbor)) continue;
      const distance = shortestPathDistance(passages, current, neighbor);
      if (!Number.isFinite(distance)) continue;
      const cycleLength = distance + 1;
      if (cycleLength < required) continue;
      if (!best || cycleLength > best.cycleLength || (cycleLength === best.cycleLength && dir.index < best.dir.index)) {
        best = { dir, neighbor, cycleLength, spurLength };
      }
    }

    if (!best) return false;
    carvePassage(cells, passages, current, best.neighbor, best.dir);
    return true;
  }

  for (const vertex of POLYTOPE_DATA.vertices) {
    const rng = mulberry32((0x120CE11 ^ seed ^ Math.imul(vertex.id, 2654435761)) >>> 0);
    const cells = Array.from({ length: SIZE * SIZE }, () => WALL.N | WALL.E | WALL.S | WALL.W);
    const visited = Array.from({ length: SIZE * SIZE }, () => false);
    const parent = Array.from({ length: SIZE * SIZE }, () => -1);
    const passages = Array.from({ length: SIZE * SIZE }, () => new Set());
    const start = idx(7, 7);
    const stack = [start];
    visited[start] = true;

    while (stack.length) {
      const current = stack[stack.length - 1];
      const { x, y } = xy(current);
      const unvisited = [];
      for (const dir of DIRS) {
        const nx = x + dir.dx, ny = y + dir.dy;
        if (!inBounds(nx, ny)) continue;
        const next = idx(nx, ny);
        if (!visited[next]) unvisited.push({ dir, next });
      }

      if (unvisited.length) {
        const choice = shuffle(unvisited, rng)[0];
        carvePassage(cells, passages, current, choice.next, choice.dir);
        parent[choice.next] = current;
        visited[choice.next] = true;
        stack.push(choice.next);
      } else {
        maybeOpenPhiContact(cells, passages, visited, parent, current);
        stack.pop();
      }
    }

    const rot = (vertex.id + (seed & 3)) % 4;
    const rotated = sides.slice(rot).concat(sides.slice(0, rot));
    const doors = vertex.doors.map((d, i) => {
      const side = rotated[i];
      const cell = fixedDoorCell[side];
      cells[idx(cell.x, cell.y)] &= ~DIR_BY_NAME[side].bit;
      return { ...d, side, x: cell.x, y: cell.y, outward: [DIR_BY_NAME[side].dx, DIR_BY_NAME[side].dy] };
    });
    mazes.push({ vertex_id: vertex.id, floor_color: floorColorForVertex(vertex.id), size: SIZE, cells, doors });
  }
  return mazes;
}

function markerForVertex(markers, vertex) { return markers[vertex]; }
function randomSquareAvoidingMarker(rng, marker) {
  for (let tries = 0; tries < 1000; tries++) {
    const x = randInt(rng, SIZE), y = randInt(rng, SIZE);
    if (!marker || marker.x !== x || marker.y !== y) return { x, y };
  }
  return { x: 0, y: 0 };
}
function generateMarkers(seed) {
  return POLYTOPE_DATA.vertices.map(v => {
    const rng = mulberry32((0x4D41524B ^ seed ^ Math.imul(v.id + 1, 2246822519)) >>> 0);
    return { vertex: v.id, x: randInt(rng, SIZE), y: randInt(rng, SIZE), touched: false };
  });
}
function generateGold(seed, markers) {
  const rng = mulberry32((0x601D ^ seed) >>> 0);
  const gold = [];
  for (let i = 0; i < 7200; i++) {
    const vertex = randInt(rng, 600);
    const sq = randomSquareAvoidingMarker(rng, markers[vertex]);
    gold.push({ id: i, vertex, x: sq.x + 0.5, y: sq.y + 0.5, active: true });
  }
  return gold;
}
function generateEnemies(seed) {
  return POLYTOPE_DATA.vertices.map(v => {
    const rng = mulberry32((0xE11E4E59 ^ seed ^ Math.imul(v.id + 3, 3266489917)) >>> 0);
    return {
      id: v.id, birthVertex: v.id, currentVertex: v.id,
      x: randInt(rng, SIZE), y: randInt(rng, SIZE),
      prevDir: null, angle: rng() * TAU, removedUntil: 0
    };
  });
}
function computeFarthestVertices() {
  const farthest = [];
  for (const start of POLYTOPE_DATA.vertices) {
    const dist = Array(600).fill(-1);
    const q = [start.id]; dist[start.id] = 0;
    for (let head = 0; head < q.length; head++) {
      const id = q[head];
      for (const n of POLYTOPE_DATA.vertices[id].neighbors) if (dist[n] < 0) { dist[n] = dist[id] + 1; q.push(n); }
    }
    let best = start.id, bestDist = -1;
    for (let i = 0; i < dist.length; i++) if (dist[i] > bestDist) { bestDist = dist[i]; best = i; }
    farthest[start.id] = best;
  }
  return farthest;
}
const FARTHEST_VERTEX = computeFarthestVertices();

let state;
const input = { left: false, right: false, joystickX: 0, jumpQueued: false, jumpHeld: false, jumpReleased: false, defendQueued: false };
const jumpKeysDown = new Set();
let jumpTouchActive = null;
let lastFrame = performance.now();
let saveTimer = 0;
let messageTimer = 0;
let paused = false;

function newState(seed) {
  const mazes = generateMazeData(seed);
  const markers = generateMarkers(seed);
  return {
    seed, mazes,
    currentVertex: 0, orientation: 0, entryClosed: false,
    player: { x: 7.5, y: 7.5, vx: 0, vy: 0, angle: 0, angularVelocity: 0, grounded: false, usedDoubleJump: false, invulnerableUntil: 0 },
    discovered: new Set(), lastMarker: null,
    markers,
    gold: generateGold(seed, markers), goldStored: 0,
    enemies: generateEnemies(seed), enemyTimer: 0,
    defense: null,
    transition: null,
    startedAt: Date.now(), transitions: 0, deaths: 0,
    mapFilter: 'all', focusMode: 0,
    rngCounter: 0,
    won: false
  };
}
function makeRuntimeRng(salt = 0) {
  state.rngCounter = (state.rngCounter + 1) >>> 0;
  return mulberry32((state.seed ^ 0xA37E120 ^ Math.imul(state.rngCounter + salt, 1103515245)) >>> 0);
}
function currentMaze() { return state.mazes[state.currentVertex]; }
function goldCapacity() { return Math.round(state.discovered.size / 50); }
function displayDoors(maze, q) {
  return maze.doors.map(door => ({ ...door, displaySide: sideAfterRotation(door.side, q), displayCell: canonCellToDisplay(door.x, door.y, q) }));
}
function doorForDisplaySide(maze, q, side) { return displayDoors(maze, q).find(d => d.displaySide === side); }
function returnDoorInMaze(maze, fromVertex) { return maze.doors.find(d => d.destination_vertex_id === fromVertex); }
function setMessage(text, seconds = 2.2) { els.message.textContent = text || ''; messageTimer = text ? seconds : 0; }

function stateForSave() {
  const now = performance.now();
  return {
    seed: state.seed,
    currentVertex: state.currentVertex,
    orientation: state.orientation,
    entryClosed: state.entryClosed,
    player: { ...state.player, invulnerableRemaining: Math.max(0, state.player.invulnerableUntil - now), invulnerableUntil: 0 },
    discovered: [...state.discovered],
    lastMarker: state.lastMarker,
    markers: state.markers.map(m => ({ vertex: m.vertex, x: m.x, y: m.y, touched: m.touched })),
    gold: state.gold,
    goldStored: state.goldStored,
    enemies: state.enemies.map(e => ({ ...e, removedRemaining: Math.max(0, e.removedUntil - now), removedUntil: 0 })),
    enemyTimer: state.enemyTimer,
    startedAt: state.startedAt,
    transitions: state.transitions,
    deaths: state.deaths,
    mapFilter: state.mapFilter,
    focusMode: state.focusMode,
    rngCounter: state.rngCounter,
    won: state.won
  };
}
function applySave(payload) {
  const seed = normalizeSeed(payload?.seed);
  if (seed == null) throw new Error('Save is missing a valid seed.');
  const next = newState(seed);
  next.currentVertex = Number.isInteger(payload.currentVertex) ? Math.max(0, Math.min(599, payload.currentVertex)) : 0;
  next.orientation = Number.isInteger(payload.orientation) ? ((payload.orientation % 4) + 4) % 4 : 0;
  next.entryClosed = !!payload.entryClosed;
  if (payload.player) {
    next.player = { ...next.player, ...payload.player };
    next.player.invulnerableUntil = performance.now() + Math.max(0, Number(payload.player.invulnerableRemaining) || 0);
  }
  next.discovered = new Set(Array.isArray(payload.discovered) ? payload.discovered.filter(n => Number.isInteger(n) && n >= 0 && n < 600) : []);
  next.lastMarker = payload.lastMarker || null;
  if (Array.isArray(payload.markers) && payload.markers.length === 600) next.markers = payload.markers.map((m, i) => ({ vertex: i, x: Math.max(0, Math.min(14, m.x|0)), y: Math.max(0, Math.min(14, m.y|0)), touched: !!m.touched }));
  if (Array.isArray(payload.gold)) next.gold = payload.gold.map((g, i) => ({ id: Number.isInteger(g.id) ? g.id : i, vertex: g.vertex|0, x: Number(g.x), y: Number(g.y), active: !!g.active }));
  next.goldStored = Math.max(0, Number(payload.goldStored) || 0);
  if (Array.isArray(payload.enemies) && payload.enemies.length === 600) next.enemies = payload.enemies.map((e, i) => ({
    id: i, birthVertex: e.birthVertex|0, currentVertex: e.currentVertex|0, x: e.x|0, y: e.y|0,
    prevDir: e.prevDir || null, angle: Number(e.angle) || 0,
    removedUntil: performance.now() + Math.max(0, Number(e.removedRemaining) || 0)
  }));
  next.enemyTimer = Number(payload.enemyTimer) || 0;
  next.startedAt = Number(payload.startedAt) || Date.now();
  next.transitions = Number(payload.transitions) || 0;
  next.deaths = Number(payload.deaths) || 0;
  if (['all','visited','unvisited'].includes(payload.mapFilter)) next.mapFilter = payload.mapFilter;
  if (Number.isInteger(payload.focusMode)) next.focusMode = Math.max(0, Math.min(2, payload.focusMode));
  next.rngCounter = Number(payload.rngCounter) || 0;
  next.won = !!payload.won;
  state = next;
  syncSeedInput(); updateHUD(); setMessage('Save imported.');
}
function saveNow() { if (state) saveLocal(stateForSave()); }
function syncSeedInput() { els.seedInput.value = String(state.seed >>> 0); }

function canvasMetrics(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const w = Math.max(1, Math.floor(rect.width));
  const h = Math.max(1, Math.floor(rect.height));
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
  }
  return { w, h, dpr };
}

function wallSegmentsForMaze(maze, q, entryClosed = false) {
  const segs = [];
  for (let cy = 0; cy < SIZE; cy++) {
    for (let cx = 0; cx < SIZE; cx++) {
      const display = canonCellToDisplay(cx, cy, q);
      const bits = rotateWallBits(maze.cells[cy * SIZE + cx], q);
      const x = display.x, y = display.y;
      if (bits & WALL.N) segs.push({ x1: x, y1: y, x2: x + 1, y2: y, side: 'N' });
      if (bits & WALL.E) segs.push({ x1: x + 1, y1: y, x2: x + 1, y2: y + 1, side: 'E' });
      if (bits & WALL.S) segs.push({ x1: x + 1, y1: y + 1, x2: x, y2: y + 1, side: 'S' });
      if (bits & WALL.W) segs.push({ x1: x, y1: y + 1, x2: x, y2: y, side: 'W' });
    }
  }
  if (entryClosed) segs.push({ x1: 7, y1: SIZE, x2: 8, y2: SIZE, side: 'S', entryGate: true });
  return segs;
}
function resolveCircle(pos, vel, segments, radius) {
  let grounded = false;
  for (let iter = 0; iter < 4; iter++) {
    for (const s of segments) {
      const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
      const len2 = dx * dx + dy * dy;
      const t = Math.max(0, Math.min(1, ((pos.x - s.x1) * dx + (pos.y - s.y1) * dy) / len2));
      const cx = s.x1 + dx * t, cy = s.y1 + dy * t;
      let nx = pos.x - cx, ny = pos.y - cy;
      let dist = Math.hypot(nx, ny);
      if (dist > 0 && dist < radius) {
        nx /= dist; ny /= dist;
        const push = radius - dist + 0.0001;
        pos.x += nx * push; pos.y += ny * push;
        const dot = vel.vx * nx + vel.vy * ny;
        if (dot < 0) { vel.vx -= dot * nx; vel.vy -= dot * ny; }
        if (ny < -0.55) grounded = true;
      }
    }
  }
  return grounded;
}
function sweepCircleAgainstWalls(prev, pos, vel, segments, radius) {
  const EPS = 1e-7;
  let remainingX = pos.x - prev.x;
  let remainingY = pos.y - prev.y;
  if (Math.abs(remainingX) < EPS && Math.abs(remainingY) < EPS) return false;

  let x = prev.x;
  let y = prev.y;
  let grounded = false;

  const findHit = (rx, ry) => {
    let hit = null;
    const recordHit = (t, axis, clamp, groundedHit) => {
      if (t < -EPS || t > 1 + EPS) return;
      const clampedT = Math.max(0, Math.min(1, t));
      if (!hit || clampedT < hit.t) hit = { t: clampedT, axis, clamp, grounded: groundedHit };
    };

    for (const s of segments) {
      const vertical = Math.abs(s.x1 - s.x2) < EPS;
      const horizontal = Math.abs(s.y1 - s.y2) < EPS;
      if (vertical && Math.abs(rx) > EPS) {
        const wallX = s.x1;
        const yMin = Math.min(s.y1, s.y2), yMax = Math.max(s.y1, s.y2);
        if (rx > 0) {
          const clampX = wallX - radius;
          if (x <= clampX + EPS && x + rx > clampX + EPS) {
            const t = (clampX - x) / rx;
            const yAtHit = y + ry * t;
            if (yAtHit >= yMin - EPS && yAtHit <= yMax + EPS) recordHit(t, 'x', clampX, false);
          }
        } else {
          const clampX = wallX + radius;
          if (x >= clampX - EPS && x + rx < clampX - EPS) {
            const t = (clampX - x) / rx;
            const yAtHit = y + ry * t;
            if (yAtHit >= yMin - EPS && yAtHit <= yMax + EPS) recordHit(t, 'x', clampX, false);
          }
        }
      } else if (horizontal && Math.abs(ry) > EPS) {
        const wallY = s.y1;
        const xMin = Math.min(s.x1, s.x2), xMax = Math.max(s.x1, s.x2);
        if (ry > 0) {
          const clampY = wallY - radius;
          if (y <= clampY + EPS && y + ry > clampY + EPS) {
            const t = (clampY - y) / ry;
            const xAtHit = x + rx * t;
            if (xAtHit >= xMin - EPS && xAtHit <= xMax + EPS) recordHit(t, 'y', clampY, true);
          }
        } else {
          const clampY = wallY + radius;
          if (y >= clampY - EPS && y + ry < clampY - EPS) {
            const t = (clampY - y) / ry;
            const xAtHit = x + rx * t;
            if (xAtHit >= xMin - EPS && xAtHit <= xMax + EPS) recordHit(t, 'y', clampY, false);
          }
        }
      }
    }
    return hit;
  };

  for (let iter = 0; iter < 3; iter++) {
    if (Math.abs(remainingX) < EPS && Math.abs(remainingY) < EPS) break;
    const hit = findHit(remainingX, remainingY);
    if (!hit) {
      x += remainingX;
      y += remainingY;
      remainingX = 0;
      remainingY = 0;
      break;
    }

    x += remainingX * hit.t;
    y += remainingY * hit.t;
    const leftover = 1 - hit.t;

    if (hit.axis === 'x') {
      x = hit.clamp;
      remainingX = 0;
      remainingY *= leftover;
      vel.vx = 0;
    } else {
      y = hit.clamp;
      remainingX *= leftover;
      remainingY = 0;
      vel.vy = 0;
      grounded = grounded || hit.grounded;
    }
  }

  pos.x = x;
  pos.y = y;
  return grounded;
}
function playerOverlapsEntrySquare() {
  const p = state.player;
  const left = 7, right = 8, top = SIZE - 1, bottom = SIZE;
  return p.x + PLAYER_R > left && p.x - PLAYER_R < right && p.y + PLAYER_R > top && p.y - PLAYER_R < bottom;
}
function setJumpHeld(held) {
  const wasHeld = input.jumpHeld;
  input.jumpHeld = held;
  if (wasHeld && !held) input.jumpReleased = true;
}
function refreshJumpHeld() {
  setJumpHeld(jumpKeysDown.size > 0 || jumpTouchActive !== null);
}
function jump() {
  const p = state.player;
  if (p.grounded) {
    p.vy = -JUMP_V;
    p.grounded = false;
    p.usedDoubleJump = false;
    p.angularVelocity += (input.left ? -1 : input.right ? 1 : 0) * 2.2;
  } else if (!p.usedDoubleJump) {
    p.vy = -JUMP_V;
    p.usedDoubleJump = true;
    p.angularVelocity += (input.left ? -1 : input.right ? 1 : 0) * 3.0;
  }
}
function updatePlayer(dt) {
  const p = state.player;
  if (input.jumpQueued) { jump(); input.jumpQueued = false; }
  if (input.jumpReleased) {
    if (!input.jumpHeld && p.vy < 0) p.vy *= JUMP_RELEASE_MULT;
    input.jumpReleased = false;
  }

  const estimatedVx = Math.max(Math.abs(p.vx), MOVE_SPEED);
  const estimatedVy = Math.max(Math.abs(p.vy), Math.abs(Math.min(18, p.vy + GRAVITY * dt)));
  const estimatedDistance = Math.hypot(estimatedVx, estimatedVy) * dt;
  const steps = Math.max(1, Math.ceil(estimatedDistance / PLAYER_MAX_SUBSTEP));
  const subDt = dt / steps;

  let grounded = false;
  for (let i = 0; i < steps; i++) {
    const left = input.left || input.joystickX < -0.25;
    const right = input.right || input.joystickX > 0.25;
    const dir = (right ? 1 : 0) - (left ? 1 : 0);
    const joyMag = Math.min(1, Math.abs(input.joystickX));
    const speedMul = (input.left || input.right) ? 1 : joyMag;
    const targetVx = dir * MOVE_SPEED * speedMul;
    const accel = p.grounded ? GROUND_ACCEL : AIR_ACCEL;
    const dv = targetVx - p.vx;
    const maxDv = accel * subDt;
    p.vx += Math.max(-maxDv, Math.min(maxDv, dv));
    p.vy = Math.min(18, p.vy + GRAVITY * subDt);

    const prev = { x: p.x, y: p.y };
    const pos = { x: p.x + p.vx * subDt, y: p.y + p.vy * subDt };
    const vel = { vx: p.vx, vy: p.vy };
    const segments = wallSegmentsForMaze(currentMaze(), state.orientation, state.entryClosed);
    const sweptGrounded = sweepCircleAgainstWalls(prev, pos, vel, segments, PLAYER_R);
    const resolvedGrounded = resolveCircle(pos, vel, segments, PLAYER_R);
    p.x = pos.x; p.y = pos.y; p.vx = vel.vx; p.vy = vel.vy;
    grounded = sweptGrounded || resolvedGrounded;
    p.grounded = grounded;
    if (state.entryClosed && !playerOverlapsEntrySquare()) state.entryClosed = false;
    checkExitTransition();
    if (state.transition) break;
  }

  if (p.grounded) {
    p.usedDoubleJump = false;
    p.angularVelocity *= 0.65;
    const stable = TAU / 5;
    p.angle += (Math.round(p.angle / stable) * stable - p.angle) * Math.min(1, dt * 18);
  } else {
    p.angle += p.angularVelocity * dt;
    p.angularVelocity += p.vx * dt * 0.85;
  }
}

function checkExitTransition() {
  if (state.transition) return;
  const p = state.player;
  let side = null;
  if (p.x < -PLAYER_R) side = 'W';
  else if (p.x > SIZE + PLAYER_R) side = 'E';
  else if (p.y < -PLAYER_R) side = 'N';
  else if (p.y > SIZE + PLAYER_R) side = 'S';
  if (!side) return;
  const door = doorForDisplaySide(currentMaze(), state.orientation, side);
  if (!door) return;
  startTransition(door, side);
}
function startTransition(door, side) {
  const fromVertex = state.currentVertex;
  const toVertex = door.destination_vertex_id;
  const destMaze = state.mazes[toVertex];
  const returnDoor = returnDoorInMaze(destMaze, fromVertex);
  const toOrientation = orientationForDoorAsSide(returnDoor.side, 'S');
  const borderOrientation = orientationForDoorAsSide(returnDoor.side, OPPOSITE[side]);
  const dx = side === 'E' ? 1 : side === 'W' ? -1 : 0;
  const dy = side === 'S' ? 1 : side === 'N' ? -1 : 0;
  state.transition = { fromVertex, fromOrientation: state.orientation, toVertex, toOrientation, borderOrientation, side, dx, dy, start: performance.now(), duration: TRANSITION_MS };
  state.transitions++;
}
function completeTransition() {
  const t = state.transition;
  state.currentVertex = t.toVertex;
  state.orientation = t.toOrientation;
  state.transition = null;
  state.entryClosed = true;
  Object.assign(state.player, { x: 7.5, y: SIZE - PLAYER_R - 0.02, vx: 0, vy: 0, grounded: true, usedDoubleJump: false });
  saveNow();
}

function markerDisplayPosition(marker, q) {
  return canonPointToDisplay(marker.x + 0.5, marker.y + 0.5, q);
}
function goldCapacityClamped() { return Math.max(0, goldCapacity()); }
function checkCollectibles() {
  const p = state.player;
  const marker = markerForVertex(state.markers, state.currentVertex);
  const mp = markerDisplayPosition(marker, state.orientation);
  if (Math.hypot(p.x - mp.x, p.y - mp.y) < PLAYER_R + MARKER_R) {
    if (!marker.touched) {
      marker.touched = true;
      state.discovered.add(state.currentVertex);
      setMessage(`Discovered maze ${vertexLabel(state.currentVertex)}.`);
    }
    state.lastMarker = { vertex: state.currentVertex, orientation: state.orientation };
    if (state.discovered.size >= 600 && !state.won) {
      state.won = true;
      setMessage('All 600 markers discovered. You win.', 8);
    }
  }
  const cap = goldCapacityClamped();
  for (const g of state.gold) {
    if (!g.active || g.vertex !== state.currentVertex) continue;
    const gp = canonPointToDisplay(g.x, g.y, state.orientation);
    if (Math.hypot(p.x - gp.x, p.y - gp.y) < PLAYER_R + GOLD_R) {
      g.active = false;
      if (state.goldStored < cap) state.goldStored++;
    }
  }
}
function addGoldRandom(vertex, count = 1) {
  const rng = makeRuntimeRng(vertex + count);
  const marker = state.markers[vertex];
  for (let i = 0; i < count; i++) {
    const sq = randomSquareAvoidingMarker(rng, marker);
    state.gold.push({ id: state.gold.length, vertex, x: sq.x + 0.5, y: sq.y + 0.5, active: true });
  }
}
function scatterStoredGold(vertex) {
  const count = state.goldStored;
  if (count <= 0) return;
  addGoldRandom(vertex, count);
  state.goldStored = 0;
}

function enemyValidMoves(enemy) {
  const maze = state.mazes[enemy.currentVertex];
  const moves = [];
  const walls = maze.cells[enemy.y * SIZE + enemy.x];
  for (const d of DIRS) {
    if (walls & d.bit) continue;
    const nx = enemy.x + d.dx, ny = enemy.y + d.dy;
    if (nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE) {
      moves.push({ dir: d.name, vertex: enemy.currentVertex, x: nx, y: ny });
    } else {
      const door = maze.doors.find(dd => dd.x === enemy.x && dd.y === enemy.y && dd.side === d.name);
      if (door) {
        const destMaze = state.mazes[door.destination_vertex_id];
        const back = returnDoorInMaze(destMaze, enemy.currentVertex);
        moves.push({ dir: d.name, vertex: door.destination_vertex_id, x: back.x, y: back.y });
      }
    }
  }
  const frozen = !!state.transition;
  if (frozen) {
    const playerCell = displayCellToCanon(Math.floor(state.player.x), Math.floor(state.player.y), state.orientation);
    return moves.filter(m => !(m.vertex === state.currentVertex && m.x === playerCell.x && m.y === playerCell.y));
  }
  return moves;
}
function moveEnemiesStep() {
  const now = performance.now();
  const rng = makeRuntimeRng(0xE11);
  for (const e of state.enemies) {
    if (e.removedUntil) {
      if (now >= e.removedUntil) respawnEnemy(e);
      else continue;
    }
    let moves = enemyValidMoves(e);
    if (!moves.length) continue;
    if (e.prevDir) {
      const reverse = OPPOSITE[e.prevDir];
      const nonReverse = moves.filter(m => m.dir !== reverse);
      if (nonReverse.length) moves = nonReverse;
    }
    const m = moves[randInt(rng, moves.length)];
    e.currentVertex = m.vertex; e.x = m.x; e.y = m.y; e.prevDir = m.dir;
    e.angle += ENEMY_ROTATIONS[randInt(rng, ENEMY_ROTATIONS.length)];
  }
}
function randomMazeAmongRespawnBorder(vertex) {
  const choices = [vertex, ...POLYTOPE_DATA.vertices[vertex].neighbors];
  const rng = makeRuntimeRng(vertex ^ 0x601D);
  return choices[randInt(rng, choices.length)];
}
function respawnEnemy(e) {
  const rng = makeRuntimeRng(e.birthVertex ^ 0xDEFEA7);
  const vertex = FARTHEST_VERTEX[e.birthVertex];
  e.currentVertex = vertex;
  e.x = randInt(rng, SIZE); e.y = randInt(rng, SIZE);
  e.prevDir = null; e.removedUntil = 0;
  const goldVertex = randomMazeAmongRespawnBorder(vertex);
  addGoldRandom(goldVertex, 3);
}
function enemyDisplayPosition(e, currentVertex = state.currentVertex, q = state.orientation) {
  if (e.currentVertex === currentVertex) {
    const p = canonPointToDisplay(e.x + 0.5, e.y + 0.5, q);
    return { ...p, visible: true };
  }
  return null;
}
function checkEnemyCollision() {
  if (state.transition || performance.now() < state.player.invulnerableUntil) return;
  const p = state.player;
  for (const e of state.enemies) {
    if (e.removedUntil || e.currentVertex !== state.currentVertex) continue;
    const ep = enemyDisplayPosition(e);
    if (ep && Math.hypot(p.x - ep.x, p.y - ep.y) < PLAYER_R + ENEMY_R) {
      killPlayer();
      return;
    }
  }
}
function killPlayer(force = false) {
  if (!state) return;
  if (!force && performance.now() < state.player.invulnerableUntil) return;
  const deathVertex = state.currentVertex;
  scatterStoredGold(deathVertex);
  state.deaths++;
  if (state.lastMarker) {
    state.currentVertex = state.lastMarker.vertex;
    state.orientation = state.lastMarker.orientation;
    const marker = state.markers[state.currentVertex];
    const mp = markerDisplayPosition(marker, state.orientation);
    Object.assign(state.player, { x: mp.x, y: mp.y, vx: 0, vy: 0, grounded: false, usedDoubleJump: false });
  } else {
    state.currentVertex = 0; state.orientation = 0;
    Object.assign(state.player, { x: 7.5, y: 7.5, vx: 0, vy: 0, grounded: false, usedDoubleJump: false });
  }
  state.entryClosed = false;
  state.transition = null;
  state.player.invulnerableUntil = performance.now() + INVULNERABLE_MS;
  setMessage('Respawned.', 2);
  saveNow();
}

function defend() {
  if (state.transition || state.goldStored <= 0) return;
  const g = state.goldStored;
  state.goldStored = 0;
  const defense = { x: state.player.x, y: state.player.y, angle: state.player.angle + 36 * Math.PI / 180, radius: g / 3, until: performance.now() + DEFENSE_MS };
  state.defense = defense;
  const vertices = regularPolygon(defense.x, defense.y, defense.radius, 5, defense.angle);
  for (const e of state.enemies) {
    if (e.removedUntil) continue;
    const p = enemyWorldPositionForDefense(e);
    if (!p) continue;
    if (pointInPolygon(p.x, p.y, vertices)) e.removedUntil = performance.now() + 5000;
  }
}
function enemyWorldPositionForDefense(e) {
  if (e.currentVertex === state.currentVertex) return canonPointToDisplay(e.x + 0.5, e.y + 0.5, state.orientation);
  for (const d of displayDoors(currentMaze(), state.orientation)) {
    if (d.destination_vertex_id !== e.currentVertex) continue;
    const side = d.displaySide;
    const destMaze = state.mazes[e.currentVertex];
    const back = returnDoorInMaze(destMaze, state.currentVertex);
    const desired = OPPOSITE[side];
    const q = orientationForDoorAsSide(back.side, desired);
    const p = canonPointToDisplay(e.x + 0.5, e.y + 0.5, q);
    const off = side === 'N' ? { x: 0, y: -SIZE } : side === 'S' ? { x: 0, y: SIZE } : side === 'E' ? { x: SIZE, y: 0 } : { x: -SIZE, y: 0 };
    return { x: p.x + off.x, y: p.y + off.y };
  }
  return null;
}
function regularPolygon(cx, cy, r, n, angle) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = angle - Math.PI / 2 + i * TAU / n;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}
function pointInPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
    if (((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function update(dt) {
  if (messageTimer > 0) { messageTimer -= dt; if (messageTimer <= 0) els.message.textContent = ''; }
  if (paused) return;
  state.enemyTimer += dt;
  while (state.enemyTimer >= 1) { state.enemyTimer -= 1; moveEnemiesStep(); }
  if (state.transition) {
    if (performance.now() - state.transition.start >= state.transition.duration) completeTransition();
  } else {
    updatePlayer(dt);
    if (input.defendQueued) { if (state.goldStored > 0) defend(); input.defendQueued = false; }
    checkCollectibles();
    checkEnemyCollision();
  }
  if (state.defense && performance.now() > state.defense.until) state.defense = null;
  saveTimer += dt;
  if (saveTimer > 2) { saveTimer = 0; saveNow(); }
}

function drawMazeBoard(ctx, maze, q, cellPx, offsetX, offsetY, options = {}) {
  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.fillStyle = colorForCell(maze.floor_color, options.current ? 0.14 : 0.075);
  ctx.fillRect(0, 0, SIZE * cellPx, SIZE * cellPx);
  ctx.strokeStyle = options.current ? 'rgba(225,235,255,0.62)' : 'rgba(225,235,255,0.25)';
  ctx.lineWidth = Math.max(1.2, cellPx * 0.055);
  ctx.lineCap = 'round';
  const segments = wallSegmentsForMaze(maze, q, options.current && state.entryClosed);
  ctx.beginPath();
  for (const s of segments) {
    ctx.moveTo(s.x1 * cellPx, s.y1 * cellPx);
    ctx.lineTo(s.x2 * cellPx, s.y2 * cellPx);
  }
  ctx.stroke();

  if (options.items) drawItemsAndEnemies(ctx, maze.vertex_id, q, cellPx);
  ctx.restore();
}
function drawItemsAndEnemies(ctx, vertex, q, cellPx) {
  const marker = state.markers[vertex];
  const mp = markerDisplayPosition(marker, q);
  drawMarker(ctx, mp.x * cellPx, mp.y * cellPx, cellPx, vertex, marker.touched);
  for (const g of state.gold) {
    if (!g.active || g.vertex !== vertex) continue;
    const gp = canonPointToDisplay(g.x, g.y, q);
    drawGold(ctx, gp.x * cellPx, gp.y * cellPx, cellPx);
  }
  for (const e of state.enemies) {
    if (e.removedUntil || e.currentVertex !== vertex) continue;
    const ep = canonPointToDisplay(e.x + 0.5, e.y + 0.5, q);
    drawEnemy(ctx, ep.x * cellPx, ep.y * cellPx, cellPx, e);
  }
}
function drawMarker(ctx, x, y, cellPx, vertex, touched) {
  const r = MARKER_R * cellPx;
  ctx.save();
  if (touched) {
    ctx.strokeStyle = 'rgba(255,255,255,0.96)'; ctx.lineWidth = Math.max(2, cellPx * 0.10);
    ctx.shadowColor = 'rgba(255,255,255,0.75)'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(x, y, r * 1.38, 0, TAU); ctx.stroke();
    ctx.shadowBlur = 0;
  }
  ctx.fillStyle = colorForCell(floorColorForVertex(vertex), 0.95);
  ctx.shadowColor = colorForCell(floorColorForVertex(vertex), 1); ctx.shadowBlur = 16;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  ctx.font = `800 ${Math.max(8, cellPx * 0.22)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(vertexLabel(vertex), x, y);
  ctx.restore();
}
function drawGold(ctx, x, y, cellPx) {
  const r = GOLD_R * cellPx;
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = GOLD_COLOR; ctx.shadowColor = 'rgba(255,216,74,0.85)'; ctx.shadowBlur = 12;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + i * TAU / 6;
    const px = Math.cos(a) * r, py = Math.sin(a) * r;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = Math.max(1, cellPx * 0.025); ctx.stroke();
  ctx.restore();
}
function drawEnemy(ctx, x, y, cellPx, e) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(e.angle);
  const r = ENEMY_R * cellPx;
  ctx.fillStyle = inverseColorForVertex(e.birthVertex, 0.98);
  ctx.shadowColor = inverseColorForVertex(e.birthVertex, 0.85); ctx.shadowBlur = 13;
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + i * TAU / 3;
    const px = Math.cos(a) * r, py = Math.sin(a) * r;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = Math.max(1, cellPx * 0.04); ctx.stroke();
  ctx.restore();
}
function drawPlayer(ctx, cellPx, alpha = 1) {
  const p = state.player;
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(p.x * cellPx, p.y * cellPx); ctx.rotate(p.angle);
  const r = PLAYER_R * cellPx;
  ctx.fillStyle = 'rgba(255,255,255,0.98)'; ctx.shadowColor = 'white'; ctx.shadowBlur = 14;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + i * TAU / 5;
    const px = Math.cos(a) * r, py = Math.sin(a) * r;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(0,0,0,0.78)'; ctx.lineWidth = Math.max(1, cellPx * 0.04); ctx.stroke();
  ctx.restore();
}
function drawDefense(ctx, cellPx) {
  if (!state.defense) return;
  const d = state.defense;
  ctx.save(); ctx.translate(d.x * cellPx, d.y * cellPx); ctx.rotate(d.angle);
  const r = d.radius * cellPx;
  ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.strokeStyle = 'rgba(255,255,255,0.60)'; ctx.lineWidth = Math.max(1.5, cellPx * 0.035);
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + i * TAU / 5;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
}
function neighborInfoForSide(side) {
  const door = doorForDisplaySide(currentMaze(), state.orientation, side);
  if (!door) return null;
  const destMaze = state.mazes[door.destination_vertex_id];
  const back = returnDoorInMaze(destMaze, state.currentVertex);
  const q = orientationForDoorAsSide(back.side, OPPOSITE[side]);
  const offset = side === 'N' ? { x: 0, y: -SIZE } : side === 'S' ? { x: 0, y: SIZE } : side === 'E' ? { x: SIZE, y: 0 } : { x: -SIZE, y: 0 };
  return { maze: destMaze, q, offset };
}
function drawScene() {
  const { w, h, dpr } = canvasMetrics(els.maze);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const boardPx = Math.min(w, h) * 0.70;
  const cellPx = boardPx / SIZE;
  const cx = w / 2, cy = h / 2;
  const originX = cx - boardPx / 2, originY = cy - boardPx / 2;
  const gradient = ctx.createRadialGradient(cx, cy, boardPx * 0.10, cx, cy, Math.max(w, h) * 0.65);
  gradient.addColorStop(0, colorForCell(currentMaze().floor_color, 0.20));
  gradient.addColorStop(1, '#070b14');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, boardPx * (Math.SQRT1_2 + Math.SQRT2 / 60), 0, TAU); ctx.clip();

  let tx = 0, ty = 0;
  let transitionEase = 0;
  if (state.transition) {
    const tr = state.transition;
    const t = Math.min(1, (performance.now() - tr.start) / tr.duration);
    transitionEase = 1 - Math.pow(1 - t, 3);
    tx = -tr.dx * boardPx * transitionEase; ty = -tr.dy * boardPx * transitionEase;
  }
  ctx.translate(originX + tx, originY + ty);
  if (state.transition) {
    const tr = state.transition;
    let quarterDelta = ((tr.toOrientation - tr.borderOrientation + 2) % 4) - 2;
    const targetCx = (SIZE / 2 + tr.dx * SIZE) * cellPx;
    const targetCy = (SIZE / 2 + tr.dy * SIZE) * cellPx;
    ctx.translate(targetCx, targetCy);
    ctx.rotate(quarterDelta * Math.PI / 2 * transitionEase);
    ctx.translate(-targetCx, -targetCy);
  }

  for (const side of ['N', 'E', 'S', 'W']) {
    const n = neighborInfoForSide(side);
    if (!n) continue;
    drawMazeBoard(ctx, n.maze, n.q, cellPx, n.offset.x * cellPx, n.offset.y * cellPx, { items: true });
  }
  drawMazeBoard(ctx, currentMaze(), state.orientation, cellPx, 0, 0, { current: true, items: true });
  drawDefense(ctx, cellPx);
  const blink = performance.now() < state.player.invulnerableUntil && Math.floor(performance.now() / 500) % 2 === 0;
  if (!blink) drawPlayer(ctx, cellPx);
  ctx.restore();

  ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1;
  ctx.strokeRect(originX, originY, boardPx, boardPx);
  if (paused) drawPauseOverlay(ctx, w, h, cx, cy, boardPx);
}

function drawPauseOverlay(ctx, w, h, cx, cy, boardPx) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, boardPx * (Math.SQRT1_2 + Math.SQRT2 / 60), 0, TAU);
  ctx.clip();
  ctx.fillStyle = 'rgba(2,5,12,0.38)';
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  ctx.save();
  ctx.font = `900 ${Math.max(36, boardPx * 0.16)}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.strokeStyle = 'rgba(0,0,0,0.58)';
  ctx.lineWidth = Math.max(4, boardPx * 0.015);
  ctx.strokeText('PAUSED', cx, cy);
  ctx.fillText('PAUSED', cx, cy);
  ctx.restore();
}

const mapRenderer = new MapRenderer({ stateProvider: () => state, onModeButtonUpdate: updateMapControlButtons });
mapRenderer.attach(els.map); mapRenderer.attach(els.fullMap);
function drawMaps() {
  mapRenderer.render(els.map, false);
  if (!els.mapOverlay.classList.contains('hidden')) mapRenderer.render(els.fullMap, true);
}

function updateHUD() {
  const cap = goldCapacityClamped();
  if (state.goldStored > cap) state.goldStored = cap;
  els.goldCounter.textContent = `${state.goldStored}/${cap}`;
  const width = Math.max(10, cap * 18);
  els.goldBar.style.setProperty('--gold-bar-width', `${width}px`);
  els.goldFill.style.width = cap > 0 ? `${Math.min(100, 100 * state.goldStored / cap)}%` : '0%';
  updateDefendControlState(cap);
  const activeGold = state.gold.reduce((n, g) => n + (g.active ? 1 : 0), 0);
  els.status.innerHTML = `
    <strong>Maze ${vertexLabel(state.currentVertex)}</strong><br>
    Discovered: ${state.discovered.size} / 600<br>
    Markers remaining: ${600 - state.discovered.size}<br>
    Gold on board: ${activeGold}<br>
    Transitions: ${state.transitions}<br>
    Deaths: ${state.deaths}<br>
    Time: ${formatElapsed(Date.now() - state.startedAt)}<br>
    Map: ${state.mapFilter} · ${focusLabel()}${mapRenderer.view.autoRotate ? '' : ' · map paused'}${paused ? ' · game paused' : ''}<br>
    Seed: ${state.seed}
  `;
  updateMapControlButtons();
}

function updateDefendControlState(cap = goldCapacityClamped()) {
  const visible = cap > 0;
  els.mobileDefend.classList.toggle('hidden', !visible);
  els.mobileDefend.disabled = visible && state.goldStored <= 0;
  els.mobileDefend.setAttribute('aria-disabled', String(!visible || state.goldStored <= 0));
}
function togglePauseGame(force) {
  paused = force ?? !paused;
  els.pauseGame.textContent = paused ? 'Resume game (Esc)' : 'Pause game (Esc)';
}

function focusLabel() { return state.focusMode === 0 ? 'focus off' : state.focusMode === 1 ? 'current cell focus' : '2D cell focus'; }
function updateMapControlButtons() {
  const filterText = state.mapFilter === 'all' ? 'Map: all' : state.mapFilter === 'visited' ? 'Map: discovered' : 'Map: undiscovered';
  const focusText = state.focusMode === 0 ? 'Focus: off' : state.focusMode === 1 ? 'Focus: 4D cell' : 'Focus: 2D cell';
  els.visitedMode.textContent = filterText;
  els.cellFocus.textContent = focusText;
  document.querySelectorAll('[data-map-action="visited"]').forEach(b => b.textContent = filterText);
  document.querySelectorAll('[data-map-action="cell"]').forEach(b => b.textContent = focusText);
  document.querySelectorAll('[data-map-action="pause"]').forEach(b => b.textContent = mapRenderer.view.autoRotate ? 'Pause map rotation' : 'Resume map rotation');
}
function cycleMapFilter() {
  state.mapFilter = state.mapFilter === 'all' ? 'visited' : state.mapFilter === 'visited' ? 'unvisited' : 'all';
  updateMapControlButtons();
}
function cycleFocus() {
  state.focusMode = (state.focusMode + 1) % 3;
  updateMapControlButtons();
}

function isTextEntryTarget(target) {
  return target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function setupInput() {
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (isTextEntryTarget(e.target)) return;
    if (['arrowleft','arrowright',' ','arrowup','w','z','a','d','x','m','v','c','escape','k'].includes(k)) e.preventDefault();
    if (k === 'a' || k === 'arrowleft') input.left = true;
    if (k === 'd' || k === 'arrowright') input.right = true;
    if (JUMP_KEYS.has(k)) {
      if (!jumpKeysDown.has(k) && !e.repeat) input.jumpQueued = true;
      jumpKeysDown.add(k);
      refreshJumpHeld();
    }
    if (k === 'x') { if (!e.repeat && state.goldStored > 0) input.defendQueued = true; }
    if (k === 'k') { if (!e.repeat) killPlayer(true); }
    if (k === 'm' && !e.repeat) toggleFullMap();
    if (k === 'v' && !e.repeat) cycleMapFilter();
    if (k === 'c' && !e.repeat) cycleFocus();
    if (k === 'escape' && !e.repeat) {
      if (!els.mapOverlay.classList.contains('hidden')) closeFullMap();
      else togglePauseGame();
    }
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'a' || k === 'arrowleft') input.left = false;
    if (k === 'd' || k === 'arrowright') input.right = false;
    if (JUMP_KEYS.has(k)) {
      jumpKeysDown.delete(k);
      refreshJumpHeld();
    }
  });
  els.maze.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button === 0 && state.goldStored > 0) input.defendQueued = true;
  });
  els.mobileJump.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    jumpTouchActive = e.pointerId;
    els.mobileJump.setPointerCapture?.(e.pointerId);
    input.jumpQueued = true;
    refreshJumpHeld();
  });
  const endJumpTouch = (e) => {
    if (e.pointerId !== jumpTouchActive) return;
    jumpTouchActive = null;
    refreshJumpHeld();
  };
  els.mobileJump.addEventListener('pointerup', endJumpTouch);
  els.mobileJump.addEventListener('pointercancel', endJumpTouch);
  els.mobileDefend.addEventListener('pointerdown', (e) => { e.preventDefault(); if (!els.mobileDefend.disabled && state.goldStored > 0) input.defendQueued = true; });
  setupStick();
}
function setupStick() {
  const base = els.stickBase, thumb = els.stickThumb;
  let active = null;
  function setFromEvent(e) {
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const max = rect.width * 0.32;
    const dx = Math.max(-max, Math.min(max, e.clientX - cx));
    input.joystickX = dx / max;
    thumb.style.transform = `translateX(${dx}px)`;
  }
  base.addEventListener('pointerdown', e => { e.preventDefault(); active = e.pointerId; base.setPointerCapture?.(active); setFromEvent(e); });
  base.addEventListener('pointermove', e => { if (e.pointerId === active) setFromEvent(e); });
  const end = e => { if (e.pointerId === active) { active = null; input.joystickX = 0; thumb.style.transform = 'translateX(0px)'; } };
  base.addEventListener('pointerup', end); base.addEventListener('pointercancel', end);
}

function toggleFullMap() { els.mapOverlay.classList.toggle('hidden'); }
function closeFullMap() { els.mapOverlay.classList.add('hidden'); }
function bindUI() {
  els.pauseGame.addEventListener('click', () => togglePauseGame());
  els.killPlayerButton.addEventListener('click', () => killPlayer(true));
  els.fullMapButton.addEventListener('click', toggleFullMap);
  els.closeMap.addEventListener('click', closeFullMap);
  els.resetMapView.addEventListener('click', () => mapRenderer.resetView());
  els.visitedMode.addEventListener('click', cycleMapFilter);
  els.cellFocus.addEventListener('click', cycleFocus);
  document.querySelectorAll('[data-map-action]').forEach(btn => btn.addEventListener('click', () => {
    const action = btn.dataset.mapAction;
    if (action === 'pause') mapRenderer.togglePause();
    if (action === 'reset') mapRenderer.resetView();
    if (action === 'visited') cycleMapFilter();
    if (action === 'cell') cycleFocus();
  }));
  els.reset.addEventListener('click', () => { if (confirm('Reset progress for this seed?')) { clearLocal(); state = newState(state.seed); paused = false; togglePauseGame(false); syncSeedInput(); setMessage('Progress reset.'); } });
  els.newMazeSet.addEventListener('click', () => { if (confirm('Start a new game with new mazes?')) { clearLocal(); state = newState(randomMazeSeed()); paused = false; togglePauseGame(false); syncSeedInput(); setMessage('New game started.'); } });
  els.seededNewGame.addEventListener('click', () => {
    const seed = normalizeSeed(els.seedInput.value);
    if (seed == null) { setMessage('Enter a valid non-negative numeric seed.'); return; }
    if (confirm(`Start a new game from seed ${seed}?`)) { clearLocal(); state = newState(seed); paused = false; togglePauseGame(false); syncSeedInput(); setMessage('Seeded game started.'); }
  });
  els.exportSave.addEventListener('click', () => {
    const text = encodeSave(stateForSave());
    els.saveExport.value = text;
    els.saveExport.classList.remove('hidden'); els.copySave.classList.remove('hidden');
    setMessage('Save exported.');
  });
  els.copySave.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(els.saveExport.value); setMessage('Save copied.'); }
    catch { els.saveExport.select(); document.execCommand('copy'); setMessage('Save copied.'); }
  });
  els.importSave.addEventListener('click', () => {
    try { applySave(decodeSave(els.saveImport.value)); saveNow(); }
    catch (err) { setMessage(err.message || 'Import failed.'); }
  });
}

function mainLoop(now) {
  const dt = Math.min(0.033, (now - lastFrame) / 1000 || 0);
  lastFrame = now;
  update(dt);
  drawScene(); drawMaps(); updateHUD();
  requestAnimationFrame(mainLoop);
}
function boot() {
  setupInput(); bindUI();
  const saved = loadLocal();
  if (saved) {
    try { applySave(saved); }
    catch { state = newState(randomMazeSeed()); syncSeedInput(); }
  } else {
    state = newState(randomMazeSeed()); syncSeedInput();
  }
  document.title = `120-cell-adventure ${GAME_VERSION}`;
  togglePauseGame(false);
  els.loading.classList.add('hidden');
  lastFrame = performance.now();
  requestAnimationFrame(mainLoop);
}

boot();

})();
