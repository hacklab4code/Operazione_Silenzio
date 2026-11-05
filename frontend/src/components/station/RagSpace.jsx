import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Focus, Layers3, Maximize2, Minus, Pause, Play, Plus, RotateCcw, Search, X } from 'lucide-react';
import { buildPoints, CATEGORY_GROUPS, clusterProjectedPoints, normalizeSearch, projectPoint } from './ragModel';

const initialCamera = () => ({ yaw: -.16, pitch: -.13, zoom: 1, target: [0, 0, 0] });
const VIEW_PRESETS = [
  { id: '3d', label: '3D', yaw: -.16, pitch: -.13 },
  { id: 'front', label: 'Frontale', yaw: 0, pitch: 0 },
  { id: 'top', label: 'Dall’alto', yaw: 0, pitch: -Math.PI / 2 },
];
const MIN_ZOOM = .45;
const MAX_ZOOM = 28;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const SHAPES = { TXT: 'dot', HTML: 'ring', JSON: 'square', XML: 'diamond' };
const IDLE_BEFORE_ROTATION = 8000;
const CLUSTER_PAGE_SIZE = 20;

const prefersReducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

const rgba = (hex, alpha) => {
  const value = String(hex).replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const number = parseInt(full, 16);
  if (!Number.isFinite(number)) return `rgba(72,214,170,${alpha})`;
  return `rgba(${(number >> 16) & 255},${(number >> 8) & 255},${number & 255},${alpha})`;
};

// Radius follows the file size on a log scale, normalised over this corpus.
function sizeRange(points) {
  const values = points.map((point) => Math.log10((Number(point.doc.bytes) || point.doc.content?.length || 400) + 10));
  return { low: Math.min(...values), high: Math.max(...values) };
}

function drawShape(context, x, y, radius, shape) {
  context.beginPath();
  if (shape === 'square') {
    const side = radius * 1.55, corner = radius * .42;
    if (context.roundRect) context.roundRect(x - side / 2, y - side / 2, side, side, corner);
    else context.rect(x - side / 2, y - side / 2, side, side);
  } else if (shape === 'diamond') {
    context.moveTo(x, y - radius * 1.35);
    context.lineTo(x + radius * 1.25, y);
    context.lineTo(x, y + radius * 1.35);
    context.lineTo(x - radius * 1.25, y);
    context.closePath();
  } else {
    context.arc(x, y, radius, 0, Math.PI * 2);
  }
}

function withSelectedPointVisible(entries, selectedKey, grouping) {
  if (!grouping || !selectedKey) return entries;
  let revealed = null;
  const next = entries.flatMap((entry) => {
    if (entry.members.length < 2 || !entry.members.some((point) => point.key === selectedKey)) return [entry];
    revealed = entry.members.find((point) => point.key === selectedKey);
    const members = entry.members.filter((point) => point.key !== selectedKey);
    if (members.length === 1) return [{ ...members[0], members }];
    return [{ ...entry, members }];
  });
  return revealed ? [...next, { ...revealed, members: [revealed] }] : entries;
}

export default function RagSpace({ documents, visibleKeys, selectedKey, onSelect, viewScope, scopeLabel = 'Tutto il corpus' }) {
  const canvasRef = useRef(null);
  const camera = useRef(initialCamera());
  const goal = useRef(initialCamera());
  const hits = useRef([]);
  const clusterEntries = useRef([]);
  const clusterCache = useRef({ signature: '', clusters: [] });
  const clusterSearchRef = useRef(null);
  const clusterListRef = useRef(null);
  const labels = useRef([]);
  const pointers = useRef(new Map());
  const drag = useRef(null);
  const pinch = useRef(null);
  const lastInteraction = useRef(0);
  const pointerInside = useRef(false);
  const spin = useRef({ yaw: 0, pitch: 0 });
  const size = useRef({ width: 640, height: 490 });
  const startedAt = useRef(0);
  const points = useMemo(() => buildPoints(documents), [documents]);
  const radii = useMemo(() => sizeRange(points), [points]);
  const [rotating, setRotating] = useState(false);
  const [hover, setHover] = useState(null);
  const [zoom, setZoom] = useState(100);
  const [focusCategory, setFocusCategory] = useState(null);
  const [view, setView] = useState('3d');
  const [grouping, setGrouping] = useState(false);
  const [cluster, setCluster] = useState(null);
  const [clusterQuery, setClusterQuery] = useState('');
  const [clusterPage, setClusterPage] = useState(0);
  const visiblePoints = useMemo(() => points.filter((point) => visibleKeys.has(point.key)), [points, visibleKeys]);
  const scene = useRef({});
  scene.current = { points, visibleKeys, selectedKey, rotating, hoverKey: hover?.key, hoverClusterKey: hover?.cluster?.key, focusCategory, view, grouping, clusterKey: cluster?.key };

  const radiusOf = useCallback((point) => {
    const value = Math.log10((Number(point.doc.bytes) || point.doc.content?.length || 400) + 10);
    const span = radii.high - radii.low || 1;
    return .62 + (value - radii.low) / span * 1.02;
  }, [radii]);

  const moveCamera = useCallback((next) => {
    goal.current = { ...goal.current, ...next };
  }, []);

  const changeZoom = useCallback((factor) => {
    setCluster(null);
    const next = clamp(goal.current.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    moveCamera({ zoom: next });
    setZoom(Math.round(next * 100));
    lastInteraction.current = performance.now();
  }, [moveCamera]);

  // Only the camera moves. The coordinates remain the same single embedding
  // projection when viewing a day, a category, or an individual document.
  const fitPoints = useCallback((members, orientation = {}) => {
    setCluster(null);
    if (!members.length) return;
    const target = [0, 1, 2].map((axis) => (
      Math.min(...members.map((point) => point.position[axis]))
      + Math.max(...members.map((point) => point.position[axis]))
    ) / 2);
    const next = { ...goal.current, ...orientation, target, zoom: 1 };
    const { width, height } = size.current;
    const projected = members.map((point) => projectPoint(point.position.map((value, axis) => value - target[axis]), next, width, height));
    const extentX = Math.max(1, ...projected.map((point) => Math.abs(point.x - width / 2)));
    const extentY = Math.max(1, ...projected.map((point) => Math.abs(point.y - height / 2)));
    const paddingX = width < 600 ? 44 : 92;
    const paddingY = height < 400 ? 76 : 96;
    const fittedZoom = clamp(Math.min((width / 2 - paddingX) / extentX, (height / 2 - paddingY) / extentY), MIN_ZOOM, MAX_ZOOM);
    moveCamera({ ...next, zoom: fittedZoom });
    setZoom(Math.round(fittedZoom * 100));
    spin.current = { yaw: 0, pitch: 0 };
    lastInteraction.current = performance.now();
  }, [moveCamera]);

  const fitVisible = useCallback(() => {
    const members = focusCategory ? visiblePoints.filter((point) => point.category.id === focusCategory) : visiblePoints;
    fitPoints(members);
  }, [fitPoints, focusCategory, visiblePoints]);

  const setPreset = useCallback((preset) => {
    setView(preset.id);
    setRotating(false);
    fitPoints(focusCategory ? visiblePoints.filter((point) => point.category.id === focusCategory) : visiblePoints, { yaw: preset.yaw, pitch: preset.pitch });
  }, [fitPoints, focusCategory, visiblePoints]);

  const reset = useCallback(() => {
    setView('3d');
    setRotating(false);
    setFocusCategory(null);
    setHover(null);
    fitPoints(visiblePoints, initialCamera());
  }, [fitPoints, visiblePoints]);

  const focusPoint = useCallback((point) => {
    if (!point) return;
    setFocusCategory((current) => current && current !== point.category.id ? null : current);
    moveCamera({
      target: [...point.position],
      zoom: Math.max(goal.current.zoom, 2.4),
    });
    setZoom(Math.round(Math.max(goal.current.zoom, 2.4) * 100));
    spin.current = { yaw: 0, pitch: 0 };
    lastInteraction.current = performance.now();
  }, [moveCamera]);

  const selectPoint = useCallback((point) => {
    if (!point) return;
    setCluster(null);
    focusPoint(point);
    onSelect(point.key);
  }, [focusPoint, onSelect]);

  const openCluster = useCallback((entry) => {
    if (!entry?.members?.length) return;
    if (entry.members.length === 1) { selectPoint(entry.members[0]); return; }
    setRotating(false);
    spin.current = { yaw: 0, pitch: 0 };
    setHover(null);
    setCluster(entry);
    setClusterQuery('');
    setClusterPage(0);
    lastInteraction.current = performance.now();
  }, [selectPoint]);

  const closeCluster = useCallback(() => {
    setCluster(null);
    canvasRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => { if (cluster) clusterSearchRef.current?.focus({ preventScroll: true }); }, [cluster]);
  useEffect(() => { if (clusterListRef.current) clusterListRef.current.scrollTop = 0; }, [cluster, clusterPage, clusterQuery]);

  const clusterCategories = useMemo(() => CATEGORY_GROUPS.map((group) => ({
    ...group,
    count: cluster?.members.filter((point) => point.category.id === group.id).length || 0,
  })).filter((group) => group.count), [cluster]);
  const clusterMatches = useMemo(() => {
    const words = normalizeSearch(clusterQuery).trim().split(/\s+/).filter(Boolean);
    return (cluster?.members || []).filter((point) => {
      const text = `${point.doc.searchText || normalizeSearch([point.doc.id, point.doc.title, point.doc.filename, point.doc.content].join(' '))} ${normalizeSearch(point.category.label)} ${normalizeSearch(point.doc.format)} ${point.doc.day}`;
      return words.every((word) => text.includes(word));
    });
  }, [cluster, clusterQuery]);
  const clusterPages = Math.max(1, Math.ceil(clusterMatches.length / CLUSTER_PAGE_SIZE));
  const safeClusterPage = Math.min(clusterPage, clusterPages - 1);
  const shownClusterMembers = clusterMatches.slice(safeClusterPage * CLUSTER_PAGE_SIZE, (safeClusterPage + 1) * CLUSTER_PAGE_SIZE);

  const focusGroup = useCallback((group) => {
    const next = focusCategory === group.id ? null : group.id;
    setFocusCategory(next);
    fitPoints(next ? visiblePoints.filter((point) => point.category.id === next) : visiblePoints);
  }, [fitPoints, focusCategory, visiblePoints]);

  // Nearest neighbours in the real embedding: they explain the shape of the cloud.
  const neighbourKeys = useMemo(() => {
    const key = hover?.key || selectedKey;
    if (!key) return [];
    const origin = visiblePoints.find((point) => point.key === key);
    if (!origin?.doc.embedding) return [];
    const vector = origin.doc.embedding.map(Number);
    return visiblePoints
      .filter((point) => point.key !== key && Array.isArray(point.doc.embedding))
      .map((point) => ({
        key: point.key,
        distance: point.doc.embedding.reduce((sum, value, axis) => sum + (Number(value) - vector[axis]) ** 2, 0),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3)
      .map((entry) => entry.key);
  }, [hover?.key, selectedKey, visiblePoints]);
  scene.current.neighbours = neighbourKeys;

  // A search that finds documents in another group must not leave them hidden
  // behind a cluster isolation the user forgot about.
  useEffect(() => {
    if (!focusCategory) return;
    const members = points.filter((point) => point.category.id === focusCategory);
    if (members.length && !members.some((point) => visibleKeys.has(point.key))) setFocusCategory(null);
  }, [focusCategory, points, visibleKeys]);

  // Compare actual keys, not only the count: changing days or finding another
  // equally sized set of results must still bring those documents into view.
  const matchSignature = useMemo(() => visiblePoints.map((point) => point.key).join('|'), [visiblePoints]);
  useEffect(() => {
    setFocusCategory(null);
    setHover(null);
    fitPoints(visiblePoints);
  }, [fitPoints, matchSignature, viewScope, visiblePoints]);

  const previousSelection = useRef(null);
  useEffect(() => {
    if (previousSelection.current === selectedKey) return;
    previousSelection.current = selectedKey;
    if (selectedKey) focusPoint(visiblePoints.find((point) => point.key === selectedKey));
  }, [focusPoint, selectedKey, visiblePoints]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    let width = 1, height = 1, frame, last = 0, inView = true;
    const wheel = (event) => { event.preventDefault(); changeZoom(Math.exp(-event.deltaY * .001)); };
    canvas.addEventListener('wheel', wheel, { passive: false });

    const resize = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width;
      height = entry.contentRect.height;
      size.current = { width, height };
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const state = scene.current;
      fitPoints(state.points.filter((point) => state.visibleKeys.has(point.key) && (!state.focusCategory || state.focusCategory === point.category.id)));
    });
    resize.observe(canvas);
    const intersection = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; });
    intersection.observe(canvas);
    startedAt.current = performance.now();

    const draw = (time) => {
      frame = requestAnimationFrame(draw);
      if (time - last < 16 || !inView || document.hidden || !width || !height) return;
      const dt = Math.min(time - last, 48);
      last = time;
      const state = scene.current;
      const reduced = prefersReducedMotion();

      // Smooth camera: the gesture writes the goal, the frame catches up.
      const ease = reduced ? 1 : 1 - Math.exp(-dt / 200);
      camera.current.yaw += (goal.current.yaw - camera.current.yaw) * ease;
      camera.current.pitch += (goal.current.pitch - camera.current.pitch) * ease;
      camera.current.zoom += (goal.current.zoom - camera.current.zoom) * ease;
      camera.current.target = camera.current.target.map((value, axis) => value + (goal.current.target[axis] - value) * ease);

      // Inertia after a drag: the cloud keeps turning briefly, then settles.
      if (!reduced && !drag.current && (Math.abs(spin.current.yaw) > .00004 || Math.abs(spin.current.pitch) > .00004)) {
        camera.current.yaw += spin.current.yaw * (dt / 16);
        camera.current.pitch = clamp(camera.current.pitch + spin.current.pitch * (dt / 16), -Math.PI / 2, Math.PI / 2);
        goal.current.yaw = camera.current.yaw;
        goal.current.pitch = camera.current.pitch;
        const decay = Math.exp(-dt / 170);
        spin.current.yaw *= decay;
        spin.current.pitch *= decay;
      }

      const idle = time - lastInteraction.current > IDLE_BEFORE_ROTATION;
      if (state.rotating && !reduced && idle && !pointerInside.current && !drag.current && !state.hoverKey && !state.focusCategory) {
        camera.current.yaw += dt * .000055;
        goal.current.yaw = camera.current.yaw;
      }

      context.clearRect(0, 0, width, height);

      const sky = context.createRadialGradient(width * .54, height * .48, 10, width * .54, height * .48, Math.max(width, height) * .78);
      sky.addColorStop(0, 'rgba(19,72,49,.30)');
      sky.addColorStop(.42, 'rgba(8,30,20,.16)');
      sky.addColorStop(1, 'rgba(3,12,8,0)');
      context.fillStyle = sky;
      context.fillRect(0, 0, width, height);

      const project = (position) => projectPoint(position.map((value, axis) => value - camera.current.target[axis]), camera.current, width, height);
      const line = (from, to, color, lineWidth = 1, dashed = false) => {
        const a = project(from), b = project(to);
        context.beginPath();
        if (dashed) context.setLineDash([3, 5]);
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.strokeStyle = color;
        context.lineWidth = lineWidth;
        context.stroke();
        if (dashed) context.setLineDash([]);
      };

      // Sparse floor grid, faded at the edges by the vignette drawn later.
      for (let i = -300; i <= 300; i += 100) {
        line([i, 196, -260], [i, 196, 260], 'rgba(72,214,170,.07)');
        line([-300, 196, i], [300, 196, i], 'rgba(72,214,170,.07)');
      }

      const visibleCount = state.points.reduce((total, point) => total + (state.visibleKeys.has(point.key) ? 1 : 0), 0);
      const dimmed = visibleCount !== state.points.length;
      const focus = state.focusCategory;
      const activeCount = focus ? state.points.filter((point) => state.visibleKeys.has(point.key) && point.category.id === focus).length : visibleCount;
      const focusPointEntry = state.points.find((point) => state.visibleKeys.has(point.key) && point.key === (state.hoverKey || state.selectedKey));

      const groupStats = CATEGORY_GROUPS.map((group) => {
        const projected = state.points
          .filter((point) => point.category.id === group.id && (!dimmed || state.visibleKeys.has(point.key)) && (!focus || point.category.id === focus))
          .map((point) => ({ point, screen: project(point.position) }));
        const count = projected.reduce((total, entry) => total + (state.visibleKeys.has(entry.point.key) ? 1 : 0), 0);
        const center = projected.length
          ? projected.reduce((sum, entry) => ({ x: sum.x + entry.screen.x / projected.length, y: sum.y + entry.screen.y / projected.length }), { x: 0, y: 0 })
          : { x: 0, y: 0 };
        // The guide follows the projected extent of the real cluster, not a
        // fixed radius: a tight group gets a small halo.
        const distances = projected
          .map((entry) => Math.hypot(entry.screen.x - center.x, entry.screen.y - center.y))
          .sort((a, b) => a - b);
        const spread = distances.length ? distances[Math.min(distances.length - 1, Math.floor(distances.length * .9))] : 0;
        return { group, count, center, haloRadius: clamp(Math.max(18, spread * 1.1), 18, Math.min(width, height) * .38) };
      });

      // Territory halos: a reading guide, gently sharper for the focused group.
      groupStats.forEach(({ group, count, center, haloRadius }) => {
        if (!count || center.x + haloRadius < 0 || center.x - haloRadius > width || center.y + haloRadius < 0 || center.y - haloRadius > height) return;
        const active = !focus || focus === group.id;
        const sparse = activeCount <= 24;
        const halo = context.createRadialGradient(center.x, center.y, 0, center.x, center.y, haloRadius);
        halo.addColorStop(0, rgba(group.color, active ? (sparse ? .025 : focus === group.id ? .16 : .08) : .02));
        halo.addColorStop(1, rgba(group.color, 0));
        context.fillStyle = halo;
        context.beginPath();
        context.arc(center.x, center.y, haloRadius, 0, Math.PI * 2);
        context.fill();
        context.beginPath();
        context.arc(center.x, center.y, haloRadius, 0, Math.PI * 2);
        context.setLineDash([2, 6]);
        context.strokeStyle = rgba(group.color, active ? (sparse ? .1 : .2) : .06);
        context.lineWidth = .8;
        context.stroke();
        context.setLineDash([]);
      });

      const appearFor = (index) => {
        if (reduced) return 1;
        const delay = index / Math.max(1, state.points.length) * 240;
        return clamp((time - startedAt.current - delay) / 440, 0, 1);
      };
      const projected = state.points.map((point, index) => ({ ...point, index, ...project(point.position) }))
        .filter((point) => point.x >= -32 && point.x <= width + 32 && point.y >= -32 && point.y <= height + 32 && point.depth > -700)
        .sort((a, b) => b.depth - a.depth);
      const active = projected.filter((point) => state.visibleKeys.has(point.key) && (!focus || point.category.id === focus)).map((point) => ({
        ...point,
        radius: clamp((activeCount <= 24 ? 3.8 : 1.9) * radiusOf(point) * clamp(point.scale, .8, 1.2), activeCount <= 24 ? 4 : 1.8, activeCount <= 24 ? 6 : 3.6),
      }));
      const signature = [width, height, camera.current.yaw.toFixed(4), camera.current.pitch.toFixed(4), camera.current.zoom.toFixed(4), ...camera.current.target.map((value) => value.toFixed(3)), focus].join('|');
      if (state.grouping && (clusterCache.current.signature !== signature || clusterCache.current.points !== state.points || clusterCache.current.visibleKeys !== state.visibleKeys)) {
        clusterCache.current = { signature, points: state.points, visibleKeys: state.visibleKeys, clusters: clusterProjectedPoints(active, { distance: 18 }) };
      }
      const clustered = state.grouping ? clusterCache.current.clusters : active.map((point) => ({ ...point, members: [point] }));
      const entries = withSelectedPointVisible(clustered, state.selectedKey, state.grouping);
      clusterEntries.current = state.grouping ? entries.filter((entry) => entry.members.length > 1) : [];
      const entryByKey = new Map();
      entries.forEach((entry) => entry.members.forEach((point) => entryByKey.set(point.key, entry)));
      hits.current = [];
      const fileLabels = [];

      // Quiet context stays behind the active files, without glows or rings.
      projected.forEach((point) => {
        if (state.visibleKeys.has(point.key) && (!focus || point.category.id === focus)) return;
        context.globalAlpha = (activeCount <= 24 ? .012 : .025) * appearFor(point.index);
        context.fillStyle = point.category.color;
        context.beginPath();
        context.arc(point.x, point.y, 1.2, 0, Math.PI * 2);
        context.fill();
      });
      context.globalAlpha = 1;

      // Connections terminate at the visible glyph representing each source.
      if (focusPointEntry && state.neighbours?.length) {
        const from = entryByKey.get(focusPointEntry.key);
        const connected = new Set();
        state.neighbours.forEach((key) => {
          const to = entryByKey.get(key);
          if (!from || !to || from === to || connected.has(to.key)) return;
          connected.add(to.key);
          context.beginPath();
          context.setLineDash([3, 4]);
          context.moveTo(from.x, from.y);
          context.lineTo(to.x, to.y);
          context.strokeStyle = rgba(focusPointEntry.category.color, .5);
          context.lineWidth = 1;
          context.stroke();
          context.setLineDash([]);
        });
      }

      entries.forEach((entry) => {
        if (entry.members.length > 1) {
          const selected = entry.members.some((point) => point.key === state.selectedKey);
          const highlighted = selected || state.hoverClusterKey === entry.key || state.clusterKey === entry.key;
          const appear = reduced ? 1 : clamp((time - startedAt.current) / 500, 0, 1);
          if (appear <= 0) return;
          context.globalAlpha = appear;
          context.beginPath();
          context.arc(entry.x, entry.y, entry.radius, 0, Math.PI * 2);
          context.fillStyle = '#07150f';
          context.fill();
          const categoryCounts = CATEGORY_GROUPS.map((group) => ({ ...group, count: entry.members.filter((point) => point.category.id === group.id).length })).filter((group) => group.count);
          let angle = -Math.PI / 2;
          const segment = Math.PI * 2 / categoryCounts.length;
          const gap = categoryCounts.length > 1 ? .045 : 0;
          categoryCounts.forEach((group) => {
            const end = angle + segment;
            context.beginPath();
            context.arc(entry.x, entry.y, entry.radius - 1.5, angle + gap / 2, end - gap / 2);
            context.strokeStyle = group.color;
            context.lineWidth = 3;
            context.stroke();
            angle = end;
          });
          if (highlighted) {
            context.beginPath();
            context.arc(entry.x, entry.y, entry.radius + 3, 0, Math.PI * 2);
            context.strokeStyle = '#f1fff9';
            context.lineWidth = 1.3;
            context.stroke();
          }
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.font = `${entry.members.length >= 1000 ? 10 : 11}px "JetBrains Mono", monospace`;
          context.fillStyle = '#f0fff7';
          context.fillText(entry.members.length.toLocaleString('it-IT'), entry.x, entry.y + .5);
          context.textBaseline = 'alphabetic';
          context.globalAlpha = 1;
          hits.current.push({ ...entry, radius: entry.radius + 5 });
          return;
        }
        const point = entry.members[0];
        const appear = appearFor(point.index);
        if (appear <= 0) return;
        const selected = point.key === state.selectedKey;
        const highlighted = selected || point.key === state.hoverKey;
        const shape = SHAPES[point.doc.format] || 'dot';
        context.globalAlpha = appear;
        context.fillStyle = point.category.color;
        context.strokeStyle = point.category.color;
        context.lineWidth = shape === 'ring' ? 1.5 : 1;
        drawShape(context, point.x, point.y, point.radius, shape);
        if (shape === 'ring') context.stroke();
        else context.fill();
        if (highlighted) {
          context.beginPath();
          context.arc(point.x, point.y, point.radius + 3, 0, Math.PI * 2);
          context.strokeStyle = '#f1fff9';
          context.lineWidth = 1.3;
          context.stroke();
        }
        context.globalAlpha = 1;
        hits.current.push({ ...point, radius: Math.max(9, point.radius + 5) });
        if (selected || activeCount <= 24) fileLabels.push({ ...point, selected });
      });

      // Small day collections can be read directly, with a label for each file.
      // The labels move in screen space; the document positions never change.
      const occupied = [];
      const reservedLabelTop = focus ? 148 : width < 900 ? 126 : 106;
      fileLabels.sort((a, b) => Number(b.selected) - Number(a.selected) || a.y - b.y).forEach((point) => {
        const title = String(point.doc.title || point.doc.filename || point.doc.id);
        const shortTitle = title.length > 31 ? `${title.slice(0, 30)}…` : title;
        context.font = '10px "JetBrains Mono", monospace';
        const labelWidth = Math.min(238, Math.max(context.measureText(point.doc.id).width, context.measureText(shortTitle).width) + 16);
        const labelHeight = 35;
        const candidates = [];
        [0, -42, 42, -84, 84].forEach((offset) => [1, -1].forEach((side) => candidates.push({
          x: clamp(point.x + (side === 1 ? 14 : -labelWidth - 14), 14, width - labelWidth - 14),
          y: clamp(point.y - 20 + offset, reservedLabelTop, height - 94),
        })));
        const intersects = (candidate) => occupied.some((other) => candidate.x < other.x + other.width + 6 && candidate.x + labelWidth + 6 > other.x && candidate.y < other.y + labelHeight + 4 && candidate.y + labelHeight + 4 > other.y)
          || entries.some((other) => {
            const margin = other.radius + 6;
            return other.x >= candidate.x - margin && other.x <= candidate.x + labelWidth + margin && other.y >= candidate.y - margin && other.y <= candidate.y + labelHeight + margin;
          });
        const spot = candidates.find((candidate) => !intersects(candidate));
        if (!spot) return;
        occupied.push({ ...spot, width: labelWidth, height: labelHeight });
        const edgeX = point.x < spot.x ? spot.x : point.x > spot.x + labelWidth ? spot.x + labelWidth : point.x;
        context.beginPath();
        context.moveTo(point.x, point.y);
        context.lineTo(edgeX, spot.y + labelHeight / 2);
        context.strokeStyle = rgba(point.category.color, .44);
        context.lineWidth = .8;
        context.stroke();
        context.fillStyle = 'rgba(4,16,11,.94)';
        context.fillRect(spot.x, spot.y, labelWidth, labelHeight);
        context.fillStyle = point.selected ? '#eafff6' : point.category.color;
        context.textAlign = 'left';
        context.font = '10px "JetBrains Mono", monospace';
        context.fillText(point.doc.id, spot.x + 8, spot.y + 12);
        context.font = '10px "Manrope", sans-serif';
        context.fillStyle = 'rgba(220,239,229,.85)';
        context.fillText(shortTitle, spot.x + 8, spot.y + 27, labelWidth - 16);
        hits.current.push({ ...point, labelBounds: { ...spot, width: labelWidth, height: labelHeight }, radius: point.radius + 5 });
      });

      // Cluster labels in screen space, above their halo, with a small leader line.
      const placed = [];
      labels.current = [];
      const currentLabels = groupStats
        .filter((entry) => entry.count > 0 && activeCount > 24)
        .map((entry) => ({ ...entry, text: `${entry.group.label.toUpperCase()} / ${entry.count.toLocaleString('it-IT')}` }))
        .sort((a, b) => a.center.y - b.center.y);
      currentLabels.forEach((label) => {
        // Try beside the cluster before stacking above it: four groups that sit
        // on the same spot stay readable without long leader lines.
        const baseY = label.center.y - label.haloRadius - 12;
        context.font = '10px "JetBrains Mono", monospace';
        const textWidth = context.measureText(label.text).width;
        const labelWidth = textWidth + 16;
        const spots = [];
        [0, -22, 22, -44, 44, -66, 66].forEach((dy) => {
          [0, labelWidth + 18, -labelWidth - 18, (labelWidth + 18) * 2, -(labelWidth + 18) * 2].forEach((dx) => spots.push({
            x: clamp(label.center.x + dx, labelWidth / 2 + 14, width - labelWidth / 2 - 14),
            y: clamp(baseY + dy, reservedLabelTop, height - 52),
          }));
        });
        const spot = spots.find((candidate) => !placed.some((other) => Math.abs(other.x - candidate.x) < (other.width + labelWidth) / 2 + 8 && Math.abs(other.y - candidate.y) < 22)
          && !entries.some((entry) => entry.x + entry.radius + 5 >= candidate.x - labelWidth / 2 && entry.x - entry.radius - 5 <= candidate.x + labelWidth / 2 && entry.y + entry.radius + 5 >= candidate.y - 12 && entry.y - entry.radius - 5 <= candidate.y + 8)) || spots[spots.length - 1];
        const { x, y } = spot;
        placed.push({ x, y, width: labelWidth });
        const active = !focus || focus === label.group.id;
        const hovered = state.focusCategory === label.group.id;
        context.globalAlpha = active ? 1 : .35;
        if (Math.hypot(x - label.center.x, y - label.center.y) > 34) {
          context.beginPath();
          context.setLineDash([2, 4]);
          context.moveTo(label.center.x, label.center.y - label.haloRadius * .35);
          context.lineTo(x, y + 3);
          context.strokeStyle = rgba(label.group.color, active ? .3 : .12);
          context.lineWidth = .6;
          context.stroke();
          context.setLineDash([]);
        }
        context.font = '10px "JetBrains Mono", monospace';
        context.textAlign = 'center';
        context.fillStyle = 'rgba(4,14,9,.94)';
        context.beginPath();
        if (context.roundRect) context.roundRect(x - textWidth / 2 - 7, y - 9, textWidth + 14, 15, 3);
        else context.rect(x - textWidth / 2 - 7, y - 9, textWidth + 14, 15);
        context.fill();
        context.fillStyle = rgba(label.group.color, active ? .98 : .45);
        context.fillText(label.text, x, y);
        context.globalAlpha = 1;
        labels.current.push({ id: label.group.id, x: x - textWidth / 2 - 8, y: y - 12, width: textWidth + 16, height: 20, hovered });
      });
      labels.current = labels.current.slice(-currentLabels.length);

      const origin = [width - 46, height - 42];
      [['X', [33, 0, 0]], ['Y', [0, -33, 0]], ['Z', [0, 0, 33]]].forEach(([label, vector]) => {
        const p = projectPoint(vector, { ...camera.current, zoom: 1 }, 640, 490);
        const x = origin[0] + p.x - 320, y = origin[1] + p.y - 245;
        context.beginPath();
        context.moveTo(...origin);
        context.lineTo(x, y);
        context.strokeStyle = 'rgba(94,138,118,.55)';
        context.lineWidth = .8;
        context.stroke();
        context.fillStyle = 'rgba(138,175,159,.8)';
        context.font = '9px monospace';
        context.textAlign = 'center';
        context.fillText(label, x, y - 5);
      });
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      intersection.disconnect();
      canvas.removeEventListener('wheel', wheel);
    };
  }, [changeZoom, fitPoints, radiusOf]);

  const pointAt = (event) => {
    const bounds = canvasRef.current.getBoundingClientRect();
    const x = event.clientX - bounds.left, y = event.clientY - bounds.top;
    const labelled = hits.current.find((point) => point.labelBounds && x >= point.labelBounds.x && x <= point.labelBounds.x + point.labelBounds.width && y >= point.labelBounds.y && y <= point.labelBounds.y + point.labelBounds.height);
    if (labelled) return labelled;
    let nearest = null, distance = Infinity;
    hits.current.forEach((point) => {
      const next = Math.hypot(point.x - x, point.y - y);
      if (next <= point.radius && next < distance) { nearest = point; distance = next; }
    });
    return nearest;
  };

  const labelAt = (event) => {
    const bounds = canvasRef.current.getBoundingClientRect();
    const x = event.clientX - bounds.left, y = event.clientY - bounds.top;
    return labels.current.find((label) => x >= label.x && x <= label.x + label.width && y >= label.y && y <= label.y + label.height) || null;
  };

  const distanceBetweenPointers = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null;
  };

  const onPointerDown = (event) => {
    if (event.button !== 0) return;
    setCluster(null);
    spin.current = { yaw: 0, pitch: 0 };
    canvasRef.current.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) { pinch.current = distanceBetweenPointers(); if (drag.current) drag.current.moved = true; }
    else drag.current = { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
    lastInteraction.current = performance.now();
    setHover(null);
  };

  const onPointerMove = (event) => {
    const bounds = canvasRef.current.getBoundingClientRect();
    if (!pointers.current.has(event.pointerId)) {
      const overLabel = labelAt(event);
      const point = overLabel ? null : pointAt(event);
      const grouped = point?.members?.length > 1;
      canvasRef.current.style.cursor = overLabel ? 'pointer' : point ? 'pointer' : 'grab';
      const x = event.clientX - bounds.left, y = event.clientY - bounds.top;
      setHover((current) => {
        if (!point && !overLabel) return null;
        if (current?.targetKey === point?.key && current?.label === overLabel?.id) return { ...current, x, y };
        return { targetKey: point?.key || null, key: grouped ? null : point?.key || null, label: overLabel?.id || null, point: grouped ? null : point, cluster: grouped ? point : null, x, y };
      });
      return;
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const distance = distanceBetweenPointers();
      if (pinch.current > 0) changeZoom(distance / pinch.current);
      pinch.current = distance;
    } else if (drag.current) {
      const current = drag.current;
      const deltaYaw = (event.clientX - current.x) * .006;
      const deltaPitch = (event.clientY - current.y) * .005;
      camera.current.yaw += deltaYaw;
      goal.current.yaw = camera.current.yaw;
      camera.current.pitch = clamp(camera.current.pitch + deltaPitch, -Math.PI / 2, Math.PI / 2);
      goal.current.pitch = camera.current.pitch;
      spin.current = { yaw: deltaYaw * .55, pitch: deltaPitch * .5 };
      if (Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > 5) {
        current.moved = true;
        if (view !== 'free') setView('free');
      }
      current.x = event.clientX;
      current.y = event.clientY;
      lastInteraction.current = performance.now();
    }
  };

  const release = (event, cancelled = false) => {
    if (!cancelled && drag.current && !drag.current.moved && pointers.current.size === 1) {
      const label = labelAt(event);
      if (label) {
        const group = CATEGORY_GROUPS.find((item) => item.id === label.id);
        if (group) focusGroup(group);
      } else {
        const point = pointAt(event);
        if (point?.members?.length > 1) openCluster(point);
        else if (point) selectPoint(point);
      }
    }
    pointers.current.delete(event.pointerId);
    if (canvasRef.current.hasPointerCapture(event.pointerId)) canvasRef.current.releasePointerCapture(event.pointerId);
    if (!pointers.current.size) { drag.current = null; pinch.current = null; }
    else {
      const remaining = [...pointers.current.values()][0];
      drag.current = { ...remaining, startX: remaining.x, startY: remaining.y, moved: true };
    }
  };

  const keyboard = (event) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', 'Home', 'Escape', 'PageDown', 'PageUp', 'Enter'].includes(event.key)) event.preventDefault();
    const step = .14;
    if (event.key === 'ArrowLeft') moveCamera({ yaw: goal.current.yaw - step });
    if (event.key === 'ArrowRight') moveCamera({ yaw: goal.current.yaw + step });
    if (event.key === 'ArrowUp') moveCamera({ pitch: clamp(goal.current.pitch - step, -Math.PI / 2, Math.PI / 2) });
    if (event.key === 'ArrowDown') moveCamera({ pitch: clamp(goal.current.pitch + step, -Math.PI / 2, Math.PI / 2) });
    if (event.key.startsWith('Arrow')) setView('free');
    if (event.key === '+' || event.key === '=') changeZoom(1.15);
    if (event.key === '-') changeZoom(1 / 1.15);
    if (event.key === 'Home') reset();
    if (event.key === 'Escape') {
      if (cluster) closeCluster();
      else { setFocusCategory(null); setHover(null); fitPoints(visiblePoints); }
    }
    if (event.key === 'Enter') {
      const entry = clusterEntries.current.find((candidate) => candidate.members.some((point) => point.key === selectedKey))
        || [...clusterEntries.current].sort((a, b) => b.members.length - a.members.length)[0];
      if (entry) openCluster(entry);
      else selectPoint(visiblePoints.find((point) => point.key === selectedKey) || visiblePoints[0]);
    }
    if (event.key === 'PageDown' || event.key === 'PageUp') {
      const current = visiblePoints.findIndex((point) => point.key === selectedKey);
      const index = (current + (event.key === 'PageDown' ? 1 : -1) + visiblePoints.length) % visiblePoints.length;
      selectPoint(visiblePoints[index]);
    }
    lastInteraction.current = performance.now();
  };

  const hoveredGroup = focusCategory ? CATEGORY_GROUPS.find((group) => group.id === focusCategory) : null;
  const currentViewLabel = VIEW_PRESETS.find((preset) => preset.id === view)?.label || 'Vista libera';

  return <div className="rag-space" data-testid="rag-space">
    <div className="rag-space-label"><span className="rag-live-dot" />MAPPA DEL CORPUS<span>{grouping ? 'NUMERO NEL CERCHIO = FILE VICINI' : '1 PUNTO PER FILE'} · EMBEDDING LSA</span></div>
    <div className="rag-view-presets" role="group" aria-label="Prospettiva della mappa">
      {VIEW_PRESETS.map((preset) => <button type="button" key={preset.id} aria-pressed={view === preset.id} onClick={() => setPreset(preset)}>{preset.label}</button>)}
      <button type="button" className="rag-fit-view" title="Inquadra tutti i documenti visibili" aria-label="Inquadra tutti i documenti visibili" onClick={fitVisible}><Focus size={13} /><span>Inquadra</span></button>
      <button type="button" className="rag-cluster-toggle" aria-label="Raggruppa punti vicini" title="Raggruppa punti vicini" aria-pressed={grouping} onClick={() => { setGrouping((value) => !value); setCluster(null); setHover(null); }}><Layers3 size={14} /><span>Raggruppa vicini</span></button>
    </div>
    <div className="rag-viewport-status" aria-live="polite"><strong>{scopeLabel}</strong><span>{visiblePoints.length.toLocaleString('it-IT')} file visibili · {currentViewLabel}</span></div>
    <canvas
      ref={canvasRef}
      tabIndex={0}
      role="img"
      aria-label={`Mappa del corpus: ${scopeLabel}, ${visiblePoints.length} documenti su ${documents.length}. Colore per gruppo, forma per formato, dimensione per lunghezza. ${grouping ? 'I numeri indicano documenti vicini: clicca un cerchio per consultarli; Invio apre il gruppo più numeroso.' : 'Clicca un punto per leggere il documento.'} Usa le frecce per ruotare, più e meno per lo zoom; Pagina giù e Pagina su per selezionare i documenti. I documenti sono accessibili anche nella vista Elenco.`}
      aria-haspopup={grouping ? 'dialog' : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerEnter={() => { pointerInside.current = true; }}
      onPointerUp={(event) => release(event)}
      onPointerCancel={(event) => release(event, true)}
      onPointerLeave={() => { pointerInside.current = false; setHover(null); canvasRef.current.style.cursor = 'grab'; }}
      onKeyDown={keyboard}
    />
    {hover?.point && <div
      className="rag-node-tooltip"
      style={{ left: Math.max(12, Math.min(hover.x + 16, (size.current.width || 0) - 306)), top: Math.max(12, Math.min(hover.y + 16, (size.current.height || 0) - 196)) }}
    >
      <span>{hover.point.doc.id} · {hover.point.doc.format} · GIORNO {hover.point.doc.day}</span>
      <strong>{hover.point.doc.title}</strong>
      <small>{hover.point.category.label} · {Number(hover.point.doc.bytes || 0).toLocaleString('it-IT')} byte · clicca per leggere il documento</small>
      {hover.point.doc.content && <p>{String(hover.point.doc.content).replace(/\s+/g, ' ').slice(0, 120)}…</p>}
    </div>}
    {hover?.cluster && !cluster && <div
      className="rag-node-tooltip rag-cluster-tooltip"
      style={{ left: Math.max(12, Math.min(hover.x + 16, (size.current.width || 0) - 306)), top: Math.max(12, Math.min(hover.y + 16, (size.current.height || 0) - 154)) }}
    >
      <span>DOCUMENTI VICINI SULLO SCHERMO</span>
      <strong>{hover.cluster.members.length.toLocaleString('it-IT')} file in questo cerchio</strong>
      <small>{CATEGORY_GROUPS.map((group) => {
        const count = hover.cluster.members.filter((point) => point.category.id === group.id).length;
        return count ? `${group.label}: ${count.toLocaleString('it-IT')}` : null;
      }).filter(Boolean).join(' · ')}</small>
      <p>Clicca per cercare e aprire tutti i file del gruppo.</p>
    </div>}
    {cluster && <section
      className="rag-cluster-panel"
      role="dialog"
      aria-label="Documenti vicini"
      onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeCluster(); } }}
    >
      <header className="rag-cluster-header"><div><span>DOCUMENTI VICINI</span><strong>{cluster.members.length.toLocaleString('it-IT')} file nel gruppo</strong></div><button type="button" onClick={closeCluster} aria-label="Chiudi gruppo di documenti"><X size={17} /></button></header>
      <div className="rag-cluster-meta">{clusterCategories.map((group) => <span key={group.id}><i style={{ background: group.color }} />{group.label}<strong>{group.count.toLocaleString('it-IT')}</strong></span>)}</div>
      <label className="rag-cluster-search"><Search size={15} /><input ref={clusterSearchRef} value={clusterQuery} onChange={(event) => { setClusterQuery(event.target.value); setClusterPage(0); }} placeholder={`Cerca nei ${cluster.members.length.toLocaleString('it-IT')} file…`} aria-label="Cerca in tutti i documenti del gruppo" />{clusterQuery && <button type="button" aria-label="Cancella ricerca nel gruppo" onClick={() => { setClusterQuery(''); setClusterPage(0); clusterSearchRef.current?.focus(); }}><X size={13} /></button>}</label>
      <div className="rag-cluster-results" aria-live="polite">{clusterMatches.length.toLocaleString('it-IT')} file{clusterQuery ? ' trovati' : ' consultabili'}{clusterMatches.length > CLUSTER_PAGE_SIZE ? ` · ${safeClusterPage * CLUSTER_PAGE_SIZE + 1}–${Math.min((safeClusterPage + 1) * CLUSTER_PAGE_SIZE, clusterMatches.length)}` : ''}</div>
      <div ref={clusterListRef} className="rag-cluster-list" aria-label="Documenti nel gruppo">{shownClusterMembers.map((point) => <button type="button" key={point.key} aria-label={`Apri ${point.doc.id}: ${point.doc.title}, ${point.category.label}, giorno ${point.doc.day}, formato ${point.doc.format}`} onClick={() => selectPoint(point)}><i style={{ background: point.category.color }} /><span><strong>{point.doc.title}</strong><small>{point.doc.id} · {point.category.label}</small></span><small>G{point.doc.day}<br />{point.doc.format}</small><ChevronRight size={13} /></button>)}{!clusterMatches.length && <p className="rag-cluster-empty">Nessun file trovato. Prova altre parole.</p>}</div>
      <footer className="rag-cluster-footer"><button type="button" className="rag-cluster-zoom" onClick={() => fitPoints(cluster.members)}><Focus size={14} />Avvicina questo gruppo</button><div><button type="button" aria-label="Pagina precedente del gruppo" disabled={safeClusterPage === 0} onClick={() => setClusterPage(safeClusterPage - 1)}><ChevronLeft size={15} /></button><span>{safeClusterPage + 1} / {clusterPages}</span><button type="button" aria-label="Pagina successiva del gruppo" disabled={safeClusterPage >= clusterPages - 1} onClick={() => setClusterPage(safeClusterPage + 1)}><ChevronRight size={15} /></button></div></footer>
    </section>}
    {hover?.label && !hover?.point && <div className="rag-space-note">Clicca l’etichetta per isolare il gruppo</div>}
    {hoveredGroup && <div className="rag-focus-badge">
      <span><i style={{ background: hoveredGroup.color }} />GRUPPO ISOLATO · {hoveredGroup.label}</span>
      <button type="button" onClick={() => { setFocusCategory(null); fitPoints(visiblePoints); }} aria-label="Mostra tutti i gruppi"><X size={12} />Tutti</button>
    </div>}
    <div className="rag-viewport-controls" aria-label="Controlli della vista 3D">
      <button type="button" title={prefersReducedMotion() ? 'Rotazione disattivata: movimento ridotto' : rotating ? 'Ferma rotazione' : 'Avvia rotazione'} aria-label={rotating ? 'Ferma rotazione' : 'Avvia rotazione'} aria-pressed={rotating} disabled={prefersReducedMotion()} onClick={() => { setRotating((value) => !value); setView('free'); lastInteraction.current = performance.now() - IDLE_BEFORE_ROTATION; }}>{rotating ? <Pause size={15} /> : <Play size={15} />}</button>
      <span className="rag-control-divider" />
      <button type="button" title="Riduci zoom" aria-label="Riduci zoom" onClick={() => changeZoom(1 / 1.2)}><Minus size={15} /></button><span>{zoom}%</span>
      <button type="button" title="Aumenta zoom" aria-label="Aumenta zoom" onClick={() => changeZoom(1.2)}><Plus size={15} /></button>
      <button type="button" title="Ripristina vista" aria-label="Ripristina vista" onClick={reset}><RotateCcw size={15} /></button>
    </div>
    <div className="rag-space-hint"><Maximize2 size={12} /><span>Trascina per ruotare · Scorri per zoomare · {grouping ? 'Clicca un cerchio per sfogliare i file' : 'Clicca un punto per leggere'}</span></div>
  </div>;
}
