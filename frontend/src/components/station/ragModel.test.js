import { buildPoints, categoryOf, clusterProjectedPoints, clusterRadius, filterDocuments, prepareDocuments, projectPoint, WORLD_SCALE } from './ragModel';

const catalogFile = require('../../../public/rag/catalog.json');
const catalogue = catalogFile.documents;
const documents = prepareDocuments(catalogue);

test('the catalogue includes every day 3 file, without classification-based exclusions', () => {
  expect(documents).toHaveLength(1529);
  expect(new Set(documents.map((doc) => doc.key)).size).toBe(1529);
  const day3 = filterDocuments(documents, { day: '3' });
  expect(day3).toHaveLength(1505);
  expect(day3.filter((doc) => doc.format === 'TXT')).toHaveLength(752);
  for (const format of ['HTML', 'JSON', 'XML']) expect(day3.filter((doc) => doc.format === format)).toHaveLength(251);
  expect(filterDocuments(documents, { day: '1' })).toHaveLength(3);
  expect(filterDocuments(documents, { day: '2' })).toHaveLength(15);
});

test('day 4 sources can be found by day, category, ID and full text', () => {
  const day4 = filterDocuments(documents, { day: '4', category: 'g4', format: 'TXT' });
  expect(day4.map((doc) => doc.id)).toEqual(['G4-01', 'G4-02', 'G4-03']);
  expect(categoryOf({ id: 'G4-01' })).toBe('g4');
  expect(filterDocuments(documents, { query: 'G4-02' }).map((doc) => doc.id)).toEqual(['G4-02']);
  expect(filterDocuments(documents, { day: '4', query: 'Anna' }).map((doc) => doc.id)).toContain('G4-01');
  expect(filterDocuments(documents, { day: '4', dayMode: 'cumulative' })).toHaveLength(1526);
});

test('cumulative day views show the corpus available by the end of each day', () => {
  expect(filterDocuments(documents, { day: '1', dayMode: 'cumulative' })).toHaveLength(3);
  expect(filterDocuments(documents, { day: '2', dayMode: 'cumulative' })).toHaveLength(18);
  expect(filterDocuments(documents, { day: '3', dayMode: 'cumulative' })).toHaveLength(1523);
  expect(filterDocuments(documents, { day: 'all', dayMode: 'cumulative' })).toHaveLength(1529);
  expect(filterDocuments(documents, { day: 'all', dayMode: 'single' })).toHaveLength(1529);

  const day2 = filterDocuments(documents, { day: '2', dayMode: 'cumulative' });
  expect(day2.every((doc) => doc.day <= 2)).toBe(true);
  expect(day2.filter((doc) => doc.day === 1)).toHaveLength(3);
  expect(filterDocuments(documents, { day: '2', dayMode: 'single' })).toEqual(filterDocuments(documents, { day: '2' }));
});

test('cumulative days intersect search, category, and format filters', () => {
  const options = { day: '2', dayMode: 'cumulative', query: 'G1-01', category: 'g1', format: 'TXT' };
  expect(filterDocuments(documents, options).map((doc) => doc.id)).toEqual(['G1-01']);
  expect(filterDocuments(documents, { ...options, dayMode: 'single' })).toEqual([]);
  expect(filterDocuments(documents, { ...options, category: 'g2' })).toEqual([]);
  expect(filterDocuments(documents, { ...options, format: 'HTML' })).toEqual([]);
  expect(filterDocuments(documents, { day: '2', dayMode: 'cumulative', category: 'lazzaro', format: 'TXT' })).toHaveLength(8);
  expect(filterDocuments(documents, { day: '2', dayMode: 'cumulative', category: 'enciclopedia', format: 'HTML' })).toEqual([]);
});

test('category filters select exactly the documents of that group', () => {
  expect(filterDocuments(documents, { category: 'lazzaro' })).toHaveLength(508);
  expect(filterDocuments(documents, { category: 'dossier' })).toHaveLength(5);
  expect(filterDocuments(documents, { day: '3', category: 'enciclopedia' })).toHaveLength(1000);
  expect(filterDocuments(documents, { category: 'missione' })).toHaveLength(0);
});

test('text search works across the full corpus, independent of file ID or source', () => {
  expect(filterDocuments(documents, { query: 'DINORNIS' }).some((doc) => doc.filename === 'documento_0001.html')).toBe(true);
  expect(filterDocuments(documents, { query: 'ARCH-3097' }).map((doc) => doc.filename)).toContain('documento_0057.html');
  const keyword = catalogue.find((doc) => doc.filename === 'documento_0001.html').content.split(' ').find((word) => word.length > 10);
  expect(filterDocuments(documents, { query: keyword }).some((doc) => doc.filename === 'documento_0001.html')).toBe(true);
  expect(filterDocuments(documents, { query: 'no_matching_source_zz12345' })).toEqual([]);
  expect(filterDocuments(documents, { query: '   ' })).toHaveLength(1529);
  expect(filterDocuments(documents, { day: '3', format: 'XML' })).toHaveLength(251);
});

test('the catalogue carries a 3D embedding and a category for every document', () => {
  expect(catalogFile.version).toBe(2);
  expect(catalogFile.embedding.method).toBe('tf-idf+lsa');
  expect(catalogFile.embedding.documents).toBe(1529);
  expect(documents.every((doc) => doc.embedding.length === 3 && doc.embedding.every(Number.isFinite))).toBe(true);
  // Repeated wording can produce coincident lexical vectors. The renderer
  // keeps a separate point for each source (checked below).
  expect(new Set(documents.map((doc) => doc.embedding.join(','))).size).toBeGreaterThan(1);
  const counts = documents.reduce((total, doc) => ({ ...total, [doc.category]: (total[doc.category] || 0) + 1 }), {});
  expect(counts).toEqual({ dossier: 5, g1: 3, g2: 7, g4: 3, g5: 3, lazzaro: 508, enciclopedia: 1000 });
  expect(categoryOf({ id: 'LX2-2422' })).toBe('lazzaro');
});

test('positions come from one global embedding projection, with real distances', () => {
  const points = buildPoints(documents);
  expect(points).toHaveLength(1529);
  expect(new Set(points.map((point) => point.position.join(','))).size).toBe(1529);
  expect(points.every((point) => point.position.length === 3 && point.position.every(Number.isFinite))).toBe(true);

  // The map applies a translation and one constant scale: for every pair, the
  // ratio between point distance and embedding distance is the same.
  const byKey = new Map(points.map((point) => [point.key, point]));
  const samples = [...documents.slice(0, 6), ...documents.slice(400, 404), ...documents.slice(900, 903)];
  const ratios = [];
  samples.forEach((first, index) => samples.slice(index + 1).forEach((second) => {
    const a = byKey.get(first.key).position, b = byKey.get(second.key).position;
    const embeddingDistance = Math.hypot(...first.embedding.map((value, axis) => value - second.embedding[axis]));
    const pointDistance = Math.hypot(...a.map((value, axis) => value - b[axis]));
    if (embeddingDistance > 0) ratios.push(pointDistance / embeddingDistance);
  }));
  expect(ratios.length).toBeGreaterThan(30);
  ratios.forEach((ratio) => expect(ratio).toBeCloseTo(WORLD_SCALE, 2));

  // Group shapes change when documents are imported. Every point must still
  // come from the same projection, with at most a small collision offset.
  const center = [0, 1, 2].map((axis) => documents.reduce((sum, doc) => sum + doc.embedding[axis], 0) / documents.length);
  points.forEach((point) => point.position.forEach((value, axis) => {
    expect(Math.abs(value - (point.doc.embedding[axis] - center[axis]) * WORLD_SCALE)).toBeLessThan(.251);
  }));
});

test('every document has a unique finite 3D location, with perspective affected by orbit and zoom', () => {
  const points = buildPoints(documents);
  const camera = { yaw: -.16, pitch: -.13, zoom: 1 };
  const first = projectPoint(points[0].position, camera, 900, 500);
  const turned = projectPoint(points[0].position, { ...camera, yaw: .8 }, 900, 500);
  expect(first.x).not.toBe(turned.x);
  const zoomed = projectPoint(points[0].position, { ...camera, zoom: 2 }, 900, 500);
  expect(Math.abs(zoomed.x - 450)).toBeGreaterThan(Math.abs(first.x - 450));
});

test('documents without an embedding still get a deterministic position', () => {
  const sparse = [{ key: 'x/1', id: 'G1-01', day: 1, title: 'Uno', content: 'testo', format: 'TXT' }, { key: 'x/2', id: 'G1-02', day: 1, title: 'Due', content: 'testo', format: 'TXT' }];
  const prepared = prepareDocuments(sparse);
  const first = buildPoints(prepared).map((point) => point.position);
  const second = buildPoints(prepared).map((point) => point.position);
  expect(first).toEqual(second);
  expect(new Set(first.map((position) => position.join(','))).size).toBe(2);
  expect(first.every((position) => position.every(Number.isFinite))).toBe(true);
});

test('screen clusters keep nearby documents together, separate distant groups, and use their exact centroids', () => {
  const projected = [
    { key: 'b', x: 10, y: 6, radius: 2 },
    { key: 'd', x: 110, y: 106, radius: 3 },
    { key: 'a', x: 0, y: 4, radius: 2 },
    { key: 'c', x: 100, y: 104, radius: 3 },
    { key: 'isolated', x: 300, y: 200, radius: 5 },
  ];
  const original = JSON.parse(JSON.stringify(projected));
  const clusters = clusterProjectedPoints(projected);
  expect(clusters.map((cluster) => cluster.members.map((point) => point.key))).toEqual([['a', 'b'], ['c', 'd'], ['isolated']]);
  expect(clusters.map(({ x, y }) => [x, y])).toEqual([[5, 5], [105, 105], [300, 200]]);
  expect(clusters.map(({ radius }) => radius)).toEqual([16, 16, 5]);
  expect(clusters.flatMap((cluster) => cluster.members.map((point) => point.key)).sort()).toEqual(projected.map((point) => point.key).sort());
  expect(clusters[0].members[0]).toBe(projected[2]);
  expect(projected).toEqual(original);
  expect(clusterProjectedPoints([...projected].reverse())).toEqual(clusters);
});

test('overlapping count badges merge after grouping rather than obscuring each other', () => {
  const projected = [
    { key: 'a', x: 0, y: 0 }, { key: 'b', x: 2, y: 0 },
    { key: 'c', x: 30, y: 0 }, { key: 'd', x: 32, y: 0 },
    { key: 'e', x: 100, y: 0 },
  ];
  const clusters = clusterProjectedPoints(projected);
  expect(clusters.map((cluster) => cluster.members.map((point) => point.key))).toEqual([['a', 'b', 'c', 'd'], ['e']]);
  expect(clusters[0].x).toBe(16);
  expect(clusters[0].radius).toBe(clusterRadius(4));
  for (let index = 0; index < clusters.length; index += 1) {
    clusters.slice(index + 1).forEach((other) => {
      expect(Math.hypot(clusters[index].x - other.x, clusters[index].y - other.y)).toBeGreaterThan(clusters[index].radius + other.radius);
    });
  }
});

test('a dense coincident corpus forms one complete stable badge without moving its documents', () => {
  const projected = documents.map((doc) => ({ key: doc.key, x: 280, y: 160, doc, radius: 2 }));
  const clusters = clusterProjectedPoints(projected);
  expect(clusters).toHaveLength(1);
  expect(clusters[0].members).toHaveLength(1529);
  expect(new Set(clusters[0].members.map((point) => point.key)).size).toBe(1529);
  expect(clusters[0]).toMatchObject({ x: 280, y: 160, radius: 20 });
  expect(clusterProjectedPoints([...projected].reverse())).toEqual(clusters);
  expect(projected.every((point) => point.x === 280 && point.y === 160)).toBe(true);
});

test('screen clusters respect the supplied filtered subset and exclude invalid projections', () => {
  const subset = filterDocuments(documents, { day: '2', dayMode: 'cumulative', category: 'lazzaro' });
  const projected = subset.map((doc, index) => ({ key: doc.key, x: index * 70, y: 50, doc }));
  const clusters = clusterProjectedPoints([...projected, { key: 'invalid-x', x: NaN, y: 0 }, { key: 'invalid-y', x: 0, y: Infinity }]);
  expect(clusters).toHaveLength(8);
  expect(clusters.flatMap((cluster) => cluster.members.map((point) => point.key)).sort()).toEqual(subset.map((doc) => doc.key).sort());
  expect(clusterProjectedPoints([])).toEqual([]);
});


test('day 5 sources are searchable by collection day, category and full content', () => {
  const sources = filterDocuments(documents, { day: '5', category: 'g5' });
  expect(sources.map((doc) => doc.id)).toEqual(['G5-01', 'G5-02', 'G5-03']);
  expect(filterDocuments(documents, { day: '5', query: 'sanificazione' }).map((doc) => doc.id)).toContain('G5-01');
  expect(categoryOf({ id: 'G5-02' })).toBe('g5');
});
