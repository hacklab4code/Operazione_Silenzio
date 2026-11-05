import React, { act } from "react";
import { createRoot } from "react-dom/client";
import FieldlinkSchema from "./FieldlinkSchema";

const schema = {
  database: "archivio_recuperato.sqlite",
  read_only: true,
  table_count: 3,
  relation_count: 2,
  row_count: 40,
  groups: [
    { id: "sedi", label: "Sedi e varchi", tables: ["r02", "r07"] },
    { id: "persone", label: "Persone", tables: ["r03"] },
  ],
  tables: [
    { id: "r02", name: "archivi", meaning: "Sedi degli archivi", group: "sedi", count: 4, columns: [{ name: "k0", label: "id", role: "pk", type: "INTEGER", references: null }] },
    { id: "r07", name: "varchi", meaning: "Varchi di una sede", group: "sedi", count: 6, columns: [
      { name: "k0", label: "id", role: "pk", type: "INTEGER", references: null },
      { name: "k1", label: "archivio", role: "fk", type: "INTEGER", references: "r02" },
    ] },
    { id: "r03", name: "persone", meaning: "Anagrafica degli operatori", group: "persone", count: 30, columns: [{ name: "k0", label: "id", role: "pk", type: "INTEGER", references: null }] },
  ],
  relations: [
    { id: "r07.k1->r02", from_table: "r07", from_column: "k1", from_label: "archivio", to_table: "r02", to_column: "k0", to_name: "archivi", cardinality: "N:1", matched: 6, distinct: 6 },
  ],
};

let root;
let container;
const originalResizeObserver = global.ResizeObserver;
const originalFetch = global.fetch;

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  global.ResizeObserver = class { observe() {} disconnect() {} };
});
afterAll(() => { global.ResizeObserver = originalResizeObserver; global.fetch = originalFetch; });
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => schema });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

async function renderSchema() {
  await act(async () => { root.render(<FieldlinkSchema />); });
  await act(async () => { await Promise.resolve(); });
}

test("loads the recovered schema and highlights the tables linked to the selection", async () => {
  await renderSchema();
  expect(container.querySelector(".fl-schema-head")).toBeNull();
  expect(container.querySelectorAll(".fl-schema-node")).toHaveLength(3);
  const gate = container.querySelector('[data-testid="schema-node-r07"]');
  await act(async () => { gate.click(); });
  expect(gate.getAttribute("aria-pressed")).toBe("true");
  expect(container.querySelector('[data-testid="schema-node-r02"]').className).toContain("is-linked");
  expect(container.querySelector('[data-testid="schema-node-r03"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="schema-node-r03"]').className).toContain("is-rest");
  expect(container.querySelector('[data-testid="schema-node-r03"]').className).not.toContain("is-dim");
  expect(container.querySelector(".fl-schema-wire").getAttribute("class")).toContain("is-active");
  expect(container.querySelector(".fl-schema-inspector").textContent).toContain("archivio");
});

test("a group spotlight keeps every table on the map", async () => {
  await renderSchema();
  const people = [...container.querySelectorAll(".fl-schema-groups button")].find((button) => button.textContent === "Persone");
  await act(async () => { people.click(); });
  expect(container.querySelectorAll(".fl-schema-node")).toHaveLength(3);
  expect(container.querySelector('[data-testid="schema-node-r03"]').className).toContain("is-linked");
  expect(container.querySelector('[data-testid="schema-node-r02"]').className).toContain("is-rest");
  expect(container.querySelector(".fl-schema-wire")).not.toBeNull();
});
