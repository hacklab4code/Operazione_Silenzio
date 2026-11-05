const round = (value) => Math.round(value * 10) / 10;

export function chooseSides(from, to) {
  const dx = (to.x + to.width / 2) - (from.x + from.width / 2);
  const dy = (to.y + to.height / 2) - (from.y + from.height / 2);
  const stacked = Math.abs(dx) < Math.max(from.width, to.width) * 0.55 && Math.abs(dy) > 8;
  if (stacked) {
    const down = dy >= 0;
    return { fromSide: down ? "bottom" : "top", toSide: down ? "top" : "bottom" };
  }
  const right = dx >= 0;
  return { fromSide: right ? "right" : "left", toSide: right ? "left" : "right" };
}

function point(box, side, lane = 0, lanes = 1) {
  const span = side === "left" || side === "right" ? box.height : box.width;
  const gap = lanes <= 1 ? 0 : Math.min(16, Math.max(8, (span - 28) / lanes));
  const delta = (lane - (lanes - 1) / 2) * gap;
  if (side === "top") return [box.x + box.width / 2 + delta, box.y];
  if (side === "bottom") return [box.x + box.width / 2 + delta, box.y + box.height];
  if (side === "left") return [box.x, box.y + box.height / 2 + delta];
  return [box.x + box.width, box.y + box.height / 2 + delta];
}

function port(box, side, lane) {
  const [x, y] = point(box, side, lane.lane, lane.lanes);
  const gap = 12;
  if (side === "top") return { anchor: [x, y], outside: [x, y - gap] };
  if (side === "bottom") return { anchor: [x, y], outside: [x, y + gap] };
  if (side === "left") return { anchor: [x, y], outside: [x - gap, y] };
  return { anchor: [x, y], outside: [x + gap, y] };
}

function crosses(a, b, rect) {
  if (a[0] === b[0]) return a[0] > rect.left && a[0] < rect.right && Math.max(Math.min(a[1], b[1]), rect.top) < Math.min(Math.max(a[1], b[1]), rect.bottom);
  return a[1] > rect.top && a[1] < rect.bottom && Math.max(Math.min(a[0], b[0]), rect.left) < Math.min(Math.max(a[0], b[0]), rect.right);
}

function route(start, finish, boxes, excluded) {
  const clearance = 10;
  const obstacles = Object.entries(boxes).filter(([id]) => !excluded.has(id)).map(([, box]) => ({
    left: box.x - clearance, right: box.x + box.width + clearance,
    top: box.y - clearance, bottom: box.y + box.height + clearance,
  }));
  const xs = [...new Set([start[0], finish[0], ...obstacles.flatMap((box) => [box.left, box.right])])].sort((a, b) => a - b);
  const ys = [...new Set([start[1], finish[1], ...obstacles.flatMap((box) => [box.top, box.bottom])])].sort((a, b) => a - b);
  const key = (xi, yi, direction) => `${xi},${yi},${direction}`;
  const coordinates = (xi, yi) => [xs[xi], ys[yi]];
  const startX = xs.indexOf(start[0]); const startY = ys.indexOf(start[1]);
  const finishX = xs.indexOf(finish[0]); const finishY = ys.indexOf(finish[1]);
  const open = [{ xi: startX, yi: startY, direction: "", cost: 0, estimate: Math.abs(start[0] - finish[0]) + Math.abs(start[1] - finish[1]), id: key(startX, startY, "") }];
  const best = new Map([[open[0].id, 0]]);
  const previous = new Map();
  let end = null;

  while (open.length) {
    open.sort((a, b) => b.estimate - a.estimate);
    const current = open.pop();
    if (current.cost !== best.get(current.id)) continue;
    if (current.xi === finishX && current.yi === finishY) { end = current; break; }
    const here = coordinates(current.xi, current.yi);
    for (const [dx, dy, direction] of [[1, 0, "h"], [-1, 0, "h"], [0, 1, "v"], [0, -1, "v"]]) {
      const xi = current.xi + dx; const yi = current.yi + dy;
      if (xi < 0 || xi >= xs.length || yi < 0 || yi >= ys.length) continue;
      const there = coordinates(xi, yi);
      if (obstacles.some((obstacle) => crosses(here, there, obstacle))) continue;
      const step = Math.abs(there[0] - here[0]) + Math.abs(there[1] - here[1]) + (current.direction && current.direction !== direction ? 24 : 0);
      const cost = current.cost + step;
      const id = key(xi, yi, direction);
      if (cost >= (best.get(id) ?? Infinity)) continue;
      best.set(id, cost);
      previous.set(id, current.id);
      open.push({ xi, yi, direction, cost, estimate: cost + Math.abs(there[0] - finish[0]) + Math.abs(there[1] - finish[1]), id });
    }
  }
  if (!end) return [start, finish];

  const points = [];
  for (let id = end.id; id; id = previous.get(id)) {
    const [xi, yi] = id.split(",").map(Number);
    points.unshift(coordinates(xi, yi));
  }
  return points.filter((current, index) => index === 0 || index === points.length - 1 ||
    (current[0] - points[index - 1][0]) * (points[index + 1][1] - current[1]) !==
    (current[1] - points[index - 1][1]) * (points[index + 1][0] - current[0]));
}

function orthogonalPath(from, to, fromSide, toSide, fromLane, toLane, boxes, fromId, toId) {
  const source = port(from, fromSide, fromLane);
  const target = port(to, toSide, toLane);
  const middle = route(source.outside, target.outside, boxes, new Set([fromId, toId]));
  const points = [source.anchor, ...middle, target.anchor].filter((point, index, list) => index === 0 || point[0] !== list[index - 1][0] || point[1] !== list[index - 1][1]);
  return {
    d: points.map((coordinates, index) => `${index ? "L" : "M"} ${round(coordinates[0])} ${round(coordinates[1])}`).join(" "),
    labelX: round((source.anchor[0] + target.anchor[0]) / 2),
    labelY: round((source.anchor[1] + target.anchor[1]) / 2),
  };
}

export function layoutSchemaPaths(boxes, relations) {
  const drafts = relations.map((relation) => {
    const from = boxes[relation.from_table];
    const to = boxes[relation.to_table];
    if (!from || !to) return null;
    return { relation, from, to, ...chooseSides(from, to) };
  }).filter(Boolean);

  const groups = new Map();
  drafts.forEach((draft, index) => {
    [["from", draft.fromSide, draft.relation.from_table], ["to", draft.toSide, draft.relation.to_table]].forEach(([end, side, table]) => {
      const key = `${table}:${side}`;
      const list = groups.get(key) || [];
      list.push({ index, end });
      groups.set(key, list);
    });
  });
  const lanes = {};
  groups.forEach((list) => {
    list.forEach((item, lane) => {
      lanes[`${item.index}:${item.end}`] = { lane, lanes: list.length };
    });
  });

  return drafts.map((draft, index) => ({
    ...draft.relation,
    ...orthogonalPath(draft.from, draft.to, draft.fromSide, draft.toSide, lanes[`${index}:from`], lanes[`${index}:to`], boxes, draft.relation.from_table, draft.relation.to_table),
  }));
}
