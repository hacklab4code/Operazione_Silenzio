import React, { act } from "react";
import { createRoot } from "react-dom/client";
import FieldlinkTimeline from "./FieldlinkTimeline";
import FieldlinkArchive from "./FieldlinkArchive";
import { useFieldlinkData } from "./FieldlinkData";

jest.mock("./FieldlinkData", () => ({ useFieldlinkData: jest.fn(), formatFieldlinkDate: (value) => value }));
jest.mock("./RagSpace", () => ({ __esModule: true, default: () => <div>Mappa</div> }));
const docs = [
  { id: "G1-01", key: "one.txt", title: "Primo riscontro", content: "Testo originale della prima prova", day: 1, bytes: 30, filename: "one.txt", format: "TXT" },
  { id: "G2-01", key: "two.txt", title: "Secondo riscontro", content: "Testo originale della seconda prova", day: 2, bytes: 30, filename: "two.txt", format: "TXT" },
  { id: "G3-01", key: "unrelated.txt", title: "Documento non citato", content: "Contenuto estraneo alla risposta", day: 3, bytes: 30, filename: "unrelated.txt", format: "TXT" },
];
const query = { id: "local-one", question: "Quali riscontri?", answer: "Risposta esatta [G2-01] e [G1-01].", session_id: "s1", created_at: "2026-10-22T10:00:00Z", source_ids: ["G3-01", "G1-01", "G2-01"], reference_documents: docs.slice(0, 2) };
let root, container;
const originalResizeObserver = global.ResizeObserver;
const originalFetch = global.fetch;
beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; global.ResizeObserver = class { observe() {} disconnect() {} }; });
afterAll(() => { global.ResizeObserver = originalResizeObserver; global.fetch = originalFetch; });
beforeEach(() => {
  window.localStorage.clear();
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ documents: docs }) });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

test("timeline selects the exact saved communication, opens its proof, and does not duplicate it", async () => {
  const earlier = { ...query, id: "earlier", answer: "Risposta precedente", created_at: "2026-10-22T09:00:00Z" };
  const saved = { ...query, id: "saved" };
  useFieldlinkData.mockReturnValue({ documents: docs, radio_logs: [earlier, saved], board: null, loading: false });
  await act(async () => root.render(<section className="fieldlink-section-page"><FieldlinkTimeline query={query} onOpen={jest.fn()} /></section>));
  expect(container.querySelector('[aria-current="step"]').closest("li").getAttribute("data-query-target")).toBe("true");
  expect(container.querySelectorAll('[data-query-target="true"][data-kind="radio"]')).toHaveLength(1);
  expect(container.querySelector('.fl-timeline-track-caption').textContent).toBe("05 / 05");
  expect(container.querySelector('.fl-timeline-transcript').textContent).toContain("Risposta esatta");
  expect(container.querySelector('.fl-timeline-sources').textContent).not.toContain("G3-01");
  expect(container.querySelectorAll('.fl-timeline-sources details[open]')).toHaveLength(2);
});

test("archive opens the first cited source, scopes the view to cited files, and supports switching proofs", async () => {
  await act(async () => root.render(<FieldlinkArchive latestQuery={query} />));
  const inspector = () => container.querySelector('[data-testid="rag-inspector"]');
  expect(inspector().textContent).toContain("Secondo riscontro");
  expect(container.querySelector('.fl-query-source-strip').textContent).not.toContain("Documento non citato");
  expect(container.querySelector('.rag-resultbar').textContent).toContain("2 / 3 file");
  const firstSource = [...container.querySelectorAll('.fl-query-source-strip button')].find((button) => button.textContent.includes("G1-01"));
  await act(async () => firstSource.click());
  expect(inspector().textContent).toContain("Testo originale della prima prova");
  expect(firstSource.getAttribute("aria-pressed")).toBe("true");
});

test.each(["saved", "local-one"])("a cited source opens its first communication (%s) when the reply repeats", async (id) => {
  const earlier = { ...query, id: "earlier", created_at: "2026-10-22T09:00:00Z" };
  const saved = { ...query, id: "saved" };
  const later = { ...query, id: "later", created_at: "2026-10-22T11:00:00Z" };
  const updatedDocs = docs.map((doc) => ({ ...doc, updated_at: "2026-10-23T12:00:00Z" }));
  useFieldlinkData.mockReturnValue({ documents: updatedDocs, radio_logs: [later, saved, earlier], board: null, loading: false });
  await act(async () => root.render(<section className="fieldlink-section-page"><FieldlinkTimeline query={{ ...query, id, focus_id: "G1-01" }} /></section>));
  const active = container.querySelector('[aria-current="step"]').closest("li");
  expect(active.getAttribute("data-kind")).toBe("radio");
  expect(active.getAttribute("data-query-target")).toBe("true");
  expect(container.querySelector('.fl-timeline-track-caption').textContent).toBe("01 / 06");
  const inspector = container.querySelector('.fl-timeline-inspector');
  expect(inspector.textContent).toContain(new Date(earlier.created_at).toISOString());
  const proofs = [...inspector.querySelectorAll('.fl-timeline-sources details[open]')];
  expect(proofs).toHaveLength(1);
  expect(proofs[0].textContent).toContain("G1-01");
});

test("the general timeline shortcut selects the first report and keeps that report's own sources", async () => {
  const earlier = { ...query, id: "first", session_id: "older-session", question: "Prima segnalazione", answer: "Primo dato [G1-01].", created_at: "2026-10-20T09:00:00Z" };
  const saved = { ...query, id: "saved" };
  const data = { documents: docs, radio_logs: [], board: null, loading: false };
  useFieldlinkData.mockReturnValue(data);
  const render = () => root.render(<section className="fieldlink-section-page"><FieldlinkTimeline query={query} /></section>);
  await act(async () => render());
  expect(container.querySelector('.fl-timeline-transcript').textContent).toContain("Risposta esatta");
  useFieldlinkData.mockReturnValue({ ...data, radio_logs: [saved, earlier] });
  await act(async () => render());
  expect(container.querySelector('.fl-timeline-track-caption').textContent).toBe("04 / 05");
  const inspector = container.querySelector('.fl-timeline-inspector');
  expect(inspector.getAttribute("data-query-target")).toBe("true");
  expect(inspector.textContent).toContain("Prima segnalazione");
  expect(container.querySelector('.fl-timeline-transcript').textContent).toContain("Primo dato");
  expect(container.querySelector('.fl-timeline-sources').textContent).not.toContain("G2-01");
  expect(container.querySelectorAll('.fl-timeline-sources details[open]')).toHaveLength(1);
});

test("archive opens the clicked file and keeps its proof selected", async () => {
  await act(async () => root.render(<FieldlinkArchive latestQuery={{ ...query, focus_id: "G1-01" }} />));
  const inspector = container.querySelector('[data-testid="rag-inspector"]');
  expect(inspector.textContent).toContain("Primo riscontro");
  const focused = [...container.querySelectorAll('.fl-query-source-strip button')].find((button) => button.textContent.includes("G1-01"));
  expect(focused.getAttribute("aria-pressed")).toBe("true");
});
