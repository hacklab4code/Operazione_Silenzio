import { chooseSides, layoutSchemaPaths } from "./schemaLayout";

test("connects stacked tables from bottom to top", () => {
  const from = { x: 10, y: 10, width: 120, height: 80 };
  const to = { x: 14, y: 140, width: 120, height: 80 };
  expect(chooseSides(from, to)).toEqual({ fromSide: "bottom", toSide: "top" });
  const [path] = layoutSchemaPaths(
    { a: from, b: to },
    [{ id: "a.k1->b", from_table: "a", to_table: "b", from_column: "k1" }],
  );
  expect(path.d.startsWith("M 70 90")).toBe(true);
  expect(path.d.endsWith("74 140")).toBe(true);
});

test("connects side-by-side tables from right to left and separates shared anchors", () => {
  const boxes = {
    a: { x: 0, y: 0, width: 100, height: 80 },
    b: { x: 220, y: 0, width: 100, height: 80 },
    c: { x: 220, y: 120, width: 100, height: 80 },
  };
  const paths = layoutSchemaPaths(boxes, [
    { id: "one", from_table: "a", to_table: "b", from_column: "k1" },
    { id: "two", from_table: "a", to_table: "c", from_column: "k2" },
  ]);
  expect(chooseSides(boxes.a, boxes.b)).toEqual({ fromSide: "right", toSide: "left" });
  expect(paths[0].d).not.toBe(paths[1].d);
  expect(paths[0].d.startsWith("M 100")).toBe(true);
  expect(paths[1].d.startsWith("M 100")).toBe(true);
});
