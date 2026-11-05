// The corpus map is one single projection. Every document keeps the 3D
// coordinates computed by the catalogue builder (TF-IDF + LSA): positions are
// only translated to the origin and scaled by a constant, so the distance
// between two points is proportional to the distance between their embeddings.
// No category is moved to a reading anchor: a group is compact when its
// documents really are similar, and far away only when its words are.
export const CATEGORY_GROUPS = [
  { id: 'dossier', label: 'ARCH · dossier', color: '#69d5f5' },
  { id: 'g1', label: 'Missione G1', color: '#a5b5ff' },
  { id: 'g2', label: 'Missione G2', color: '#eea0cf' },
  { id: 'g4', label: 'Missione G4', color: '#7ee0c4' },
  { id: 'g5', label: 'Missione G5', color: '#f59f86' },
  { id: 'missioni', label: 'Missioni e consegne', color: '#c2a1ff' },
  { id: 'materiali', label: 'Materiali ricevuti', color: '#b6c9da' },
  { id: 'other', label: 'Altri documenti', color: '#b0b7bc' },
  { id: 'lazzaro', label: 'Lazzaro', color: '#f0c56b' },
  { id: 'enciclopedia', label: 'Wikipedia', color: '#57c99a' },
];

// One unit of embedding space becomes this many world units.
export const WORLD_SCALE = 250;

export const DAY_GROUPS = [
  { day: 1, color: '#d2e6df', label: 'Prime testimonianze' },
  { day: 2, color: '#9dbbad', label: 'Registri e imprevisti' },
  { day: 3, color: '#48d6aa', label: 'Archivio esteso' },
  { day: 4, color: '#7ee0c4', label: 'Accessi al varco' },
  { day: 5, color: '#f59f86', label: 'Ultima luce' },
];

const CATEGORY_BY_ID = new Map(CATEGORY_GROUPS.map((group) => [group.id, group]));

export function categoryOf(doc) {
  if (doc && CATEGORY_BY_ID.has(doc.category)) return doc.category;
  const identifier = String(doc?.id || '').toUpperCase();
  if (identifier.startsWith('ARCH-')) return 'dossier';
  if (identifier.startsWith('G1-')) return 'g1';
  if (identifier.startsWith('G2-')) return 'g2';
  if (identifier.startsWith('G4-')) return 'g4';
  if (identifier.startsWith('G5-')) return 'g5';
  if (identifier.startsWith('LX2-')) return 'lazzaro';
  if (identifier.startsWith('WIKI-')) return 'enciclopedia';
  return 'other';
}

export function categoryGroup(doc) {
  return CATEGORY_BY_ID.get(categoryOf(doc)) || CATEGORY_GROUPS[CATEGORY_GROUPS.length - 1];
}

export const normalizeSearch = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it');

export function prepareDocuments(documents) {
  return documents.map((doc) => ({ ...doc, category: categoryOf(doc), searchText: normalizeSearch([doc.id, doc.filename, doc.title, doc.content].join(' ')) }));
}

export function filterDocuments(documents, { query = '', day = 'all', dayMode = 'single', format = 'all', category = 'all' }) {
  const words = normalizeSearch(query).trim().split(/\s+/).filter(Boolean);
  return documents.filter((doc) => (day === 'all' || (dayMode === 'cumulative' ? doc.day <= Number(day) : doc.day === Number(day)))
    && (format === 'all' || doc.format === format)
    && (category === 'all' || categoryOf(doc) === category)
    && words.every((word) => doc.searchText.includes(word)));
}

// Deterministic jitter: two documents with the same embedding still get two
// distinct dots, without using Math.random.
function jitter(key) {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return [0, 1, 2].map((axis) => {
    hash ^= hash >>> 13;
    hash = Math.imul(hash, 1274126177);
    return ((hash >>> 0) % 1000) / 1000 * .5 - .25 + axis * 0.0001;
  });
}

function embeddingOf(doc) {
  const embedding = doc?.embedding;
  const values = Array.isArray(embedding) && embedding.length === 3
    ? embedding.map(Number)
    : null;
  return values && values.every(Number.isFinite) ? values : null;
}

// New live documents without a precomputed embedding still need a
// deterministic place: a Fibonacci sphere, so no distance is implied.
function fallbackPosition(index, count, radius = 120) {
  const y = 1 - 2 * ((index + .5) / Math.max(1, count));
  const angle = index * Math.PI * (3 - Math.sqrt(5));
  const shell = Math.sqrt(Math.max(0, 1 - y * y));
  return [Math.cos(angle) * shell * radius, y * radius, Math.sin(angle) * shell * radius];
}

export function buildPoints(documents) {
  const vectors = documents.map(embeddingOf);
  const valid = vectors.filter(Boolean);
  // A global translation only: relative distances are left untouched.
  const center = valid.length
    ? [0, 1, 2].map((axis) => valid.reduce((sum, vector) => sum + vector[axis], 0) / valid.length)
    : [0, 0, 0];
  const seen = new Set();

  return documents.map((doc, index) => {
    const vector = vectors[index];
    const group = CATEGORY_BY_ID.get(categoryOf(doc)) || CATEGORY_GROUPS[CATEGORY_GROUPS.length - 1];
    let position = vector
      ? vector.map((value, axis) => (value - center[axis]) * WORLD_SCALE)
      : fallbackPosition(index, documents.length);
    // Only coincident points are nudged apart; distances stay as they are.
    const bucket = position.map((value) => Math.round(value * 100) / 100).join(',');
    if (seen.has(bucket)) {
      const offset = jitter(doc.key || doc.id || String(index));
      position = position.map((value, axis) => value + offset[axis]);
    }
    seen.add(position.map((value) => Math.round(value * 100) / 100).join(','));
    return { key: doc.key, doc, category: group, color: group.color, position };
  });
}

export function categorySummary(points) {
  return CATEGORY_GROUPS.map((group) => ({
    ...group,
    count: points.filter((point) => point.category.id === group.id).length,
  })).filter((group) => group.count > 0);
}

export function clusterRadius(count) {
  return count > 1 ? Math.min(20, 16 + Math.floor(Math.log2(count) / 2)) : 4;
}

// Clustering happens after projection: embeddings and individual screen
// positions remain intact, so zooming can reveal every original document.
export function clusterProjectedPoints(points, { distance = 18 } = {}) {
  const threshold = Number.isFinite(distance) && distance > 0 ? distance : 18;
  const byKey = (a, b) => String(a.key) < String(b.key) ? -1 : String(a.key) > String(b.key) ? 1 : 0;
  const ordered = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)).sort(byKey);
  const cells = new Map();
  const groups = [];
  const cellKey = (x, y) => `${x},${y}`;
  const neighbours = (grid, x, y, visit) => {
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        grid.get(cellKey(x + dx, y + dy))?.forEach(visit);
      }
    }
  };
  const place = (group) => {
    group.cell = cellKey(Math.floor(group.x / threshold), Math.floor(group.y / threshold));
    if (!cells.has(group.cell)) cells.set(group.cell, new Set());
    cells.get(group.cell).add(group);
  };

  // A spatial hash keeps dense clouds cheap: a new point checks nearby
  // group centroids rather than comparing with all previous documents.
  ordered.forEach((point) => {
    let nearest = null, best = threshold ** 2;
    neighbours(cells, Math.floor(point.x / threshold), Math.floor(point.y / threshold), (group) => {
      const squared = (point.x - group.x) ** 2 + (point.y - group.y) ** 2;
      if (squared < best || (squared === best && (!nearest || byKey(group.members[0], nearest.members[0]) < 0))) {
        nearest = group;
        best = squared;
      }
    });
    if (nearest) {
      cells.get(nearest.cell).delete(nearest);
      nearest.members.push(point);
      nearest.sumX += point.x;
      nearest.sumY += point.y;
      nearest.x = nearest.sumX / nearest.members.length;
      nearest.y = nearest.sumY / nearest.members.length;
      place(nearest);
    } else {
      const group = { x: point.x, y: point.y, sumX: point.x, sumY: point.y, members: [point] };
      groups.push(group);
      place(group);
    }
  });

  const radiusOf = (group) => group.members.length > 1 ? clusterRadius(group.members.length) : group.members[0].radius || 4;
  let clusters = groups;
  // Count badges are larger than dots. Merge their overlapping circles and
  // repeat after centroid changes, so a dense cloud does not become a stack
  // of overlapping badges. Each pass strictly reduces the number of groups.
  while (clusters.length > 1) {
    const grid = new Map();
    const parent = clusters.map((_, index) => index);
    const root = (index) => {
      while (parent[index] !== index) {
        parent[index] = parent[parent[index]];
        index = parent[index];
      }
      return index;
    };
    const cellSize = Math.max(threshold, 2 * Math.max(...clusters.map(radiusOf)) + 4);
    let merged = false;
    clusters.forEach((group, index) => {
      const cellX = Math.floor(group.x / cellSize), cellY = Math.floor(group.y / cellSize);
      neighbours(grid, cellX, cellY, (otherIndex) => {
        const other = clusters[otherIndex];
        const separation = Math.max(threshold, radiusOf(group) + radiusOf(other) + 4);
        if ((group.x - other.x) ** 2 + (group.y - other.y) ** 2 <= separation ** 2) {
          const first = root(index), second = root(otherIndex);
          if (first !== second) {
            parent[Math.max(first, second)] = Math.min(first, second);
            merged = true;
          }
        }
      });
      const key = cellKey(cellX, cellY);
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(index);
    });
    if (!merged) break;
    const combined = new Map();
    clusters.forEach((group, index) => {
      const key = root(index);
      if (!combined.has(key)) combined.set(key, { members: [], sumX: 0, sumY: 0 });
      const target = combined.get(key);
      target.members.push(...group.members);
      target.sumX += group.sumX;
      target.sumY += group.sumY;
    });
    clusters = [...combined.values()].map((group) => ({
      ...group,
      x: group.sumX / group.members.length,
      y: group.sumY / group.members.length,
    }));
  }

  return clusters.map((group) => {
    const members = group.members.sort(byKey);
    return {
      key: members.length === 1 ? members[0].key : `cluster:${JSON.stringify(members.map((point) => point.key))}`,
      x: group.x, y: group.y, members, radius: radiusOf(group),
    };
  }).sort((a, b) => byKey(a.members[0], b.members[0]));
}

export function projectPoint([x, y, z], camera, width, height) {
  const rx = x * Math.cos(camera.yaw) + z * Math.sin(camera.yaw);
  const rz = -x * Math.sin(camera.yaw) + z * Math.cos(camera.yaw);
  const ry = y * Math.cos(camera.pitch) - rz * Math.sin(camera.pitch);
  const depth = y * Math.sin(camera.pitch) + rz * Math.cos(camera.pitch);
  const perspective = 760 / (760 + depth);
  const scale = Math.min(width / 640, height / 490) * camera.zoom;
  return { x: width / 2 + rx * perspective * scale, y: height / 2 + ry * perspective * scale,
    depth, scale: perspective * scale };
}
