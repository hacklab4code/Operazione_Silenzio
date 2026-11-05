import React, { act } from "react";
import { createRoot } from "react-dom/client";
import FieldlinkBoard from "./FieldlinkBoard";
import { useFieldlinkData } from "./FieldlinkData";

jest.mock("./FieldlinkData", () => ({
  useFieldlinkData: jest.fn(),
  formatFieldlinkDate: (value) => String(value),
}));

jest.mock("./FieldlinkSourcePreview", () => {
  const React = require("react");
  return {
    SourceChips: ({ ids = [] }) => React.createElement("span", { className: "mock-source-chips" },
      ids.map((id) => React.createElement("button", { key: id, type: "button" }, id))),
  };
});

jest.mock("./ModelResponseRenderer", () => {
  const React = require("react");
  return { __esModule: true, default: ({ text }) => React.createElement("div", { "data-testid": "rendered-answer" }, text) };
});

const PIN_KEY = "fieldlink.board.pins.v1";
const sourceId = "LX2-8204-A_081";
const latestQuote = "La verifica del giorno operativo 01 è proseguita in città.";
const olderQuote = "Il collaudo del giorno operativo 03 era già stato raccolto.";
const fullAnswer = "Prima parte della comunicazione.\n\nLa trascrizione conserva anche il dettaglio intermedio.\n\nConferma-finale: attendere prima di procedere.";

function snapshot() {
  const items = [
    { key: "G2-01:0", source_id: "G2-01", day: 2, quote: olderQuote, type: "dichiarazione", reliability: "da verificare", people: [], places: [], times: [] },
    { key: `${sourceId}:0`, source_id: sourceId, day: 3, quote: latestQuote, type: "fatto riportato", reliability: "indizio tecnico", people: [], places: ["Officina Selce"], times: [] },
    { key: "LX2-8204-A_082:0", source_id: "LX2-8204-A_082", day: 3, quote: "La verifica è rimasta sospesa.", type: "dichiarazione", reliability: "da verificare", people: [], places: [], times: [] },
  ];
  return {
    documents: [],
    radio_logs: [{ id: "radio-1", created_at: "2026-10-21T11:10:00+00:00", question: "Quale controllo deve essere completato?", answer: fullAnswer, resolved_respondent_mode: "team", resolved_processing_mode: "documentary", source_ids: [sourceId, "G2-01"] }],
    archive: { available: true, total: 3, latest_day: 3, by_day: [{ day: 2, count: 1 }, { day: 3, count: 2 }] },
    board: { available: true, items, total: 3, covered_documents: 3, pending_documents: 0 },
    generated_at: "2026-10-21T11:15:00+00:00", loading: false, error: "", refreshing: false, refresh: jest.fn(),
  };
}

let container;
let root;
const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;

beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });
afterAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment; });
beforeEach(() => {
  window.localStorage.clear();
  useFieldlinkData.mockReturnValue(snapshot());
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  window.localStorage.clear();
});

const renderBoard = async () => { await act(async () => root.render(<FieldlinkBoard />)); };
const click = async (element) => { await act(async () => element.click()); };
const buttonWithText = (text) => [...container.querySelectorAll("button")].find((button) => button.textContent.includes(text));
const quotes = () => [...container.querySelectorAll(".fl-board-excerpts blockquote")].map((quote) => quote.textContent);
async function changeValue(element, value) {
  await act(async () => {
    const prototype = element.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value);
    element.dispatchEvent(new Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
}

test("filters by the document collection day without changing the operational day in its quotation", async () => {
  await renderBoard();
  expect(quotes()).toContain(latestQuote);
  expect(quotes()).not.toContain(olderQuote);
  expect(container.querySelector(".fl-board-excerpt-meta > span").textContent).toBe("G3");

  await changeValue(container.querySelector(".fl-board-filters select"), "2");
  expect(quotes()).toEqual([olderQuote]);
  expect(container.querySelector(".fl-board-excerpt-meta > span").textContent).toBe("G2");
  expect(container.querySelector(".fl-board-footnote").textContent).toContain("Il giorno indica la raccolta del documento.");
});

test("searches the whole collection with complete source suffixes and requires every search word", async () => {
  const data = snapshot();
  const fillers = Array.from({ length: 18 }, (_, index) => ({ ...data.board.items[2], key: `LX2-${1000 + index}:0`, source_id: `LX2-${1000 + index}`, quote: `Estratto ordinario ${index}.` }));
  data.board.items = [...fillers, ...data.board.items.slice(1)];
  data.board.total = data.board.items.length;
  useFieldlinkData.mockReturnValue(data);
  await renderBoard();
  expect(quotes()).not.toContain(latestQuote);

  const search = container.querySelector('input[type="search"]');
  await changeValue(search, `${sourceId.toLowerCase()} citta`);
  expect(quotes()).toEqual([latestQuote]);
  expect(container.querySelector(".mock-source-chips button").textContent).toBe(sourceId);

  await changeValue(search, `${sourceId} sospesa`);
  expect(quotes()).toEqual([]);
  expect(container.querySelector(".fl-board-empty h3").textContent).toBe("Nessun risultato");
});

test("persists pin toggles across remounts and renders metadata without empty separators", async () => {
  await renderBoard();
  const pinSelector = `.fl-board-excerpt-meta button[aria-label*="${sourceId}"]`;
  const sourceCard = container.querySelector(pinSelector).closest("li");
  expect(sourceCard.querySelector(".fl-board-excerpt-footer > span:last-child").textContent).toBe("Officina Selce");

  await click(container.querySelector(pinSelector));
  expect(JSON.parse(window.localStorage.getItem(PIN_KEY))).toEqual([`${sourceId}:0`]);
  await click(buttonWithText("In evidenza"));
  expect(quotes()).toEqual([latestQuote]);

  await act(async () => root.unmount());
  root = createRoot(container);
  await renderBoard();
  expect(container.querySelector(pinSelector).getAttribute("aria-pressed")).toBe("true");
  expect(container.querySelector(pinSelector).closest("li").classList.contains("is-pinned")).toBe(true);

  await click(container.querySelector(pinSelector));
  expect(container.querySelector(pinSelector).getAttribute("aria-pressed")).toBe("false");
  expect(JSON.parse(window.localStorage.getItem(PIN_KEY))).toEqual([]);
});

test("searches radio answers and expands the complete saved response with its original source IDs", async () => {
  await renderBoard();
  await click(buttonWithText("Comunicazioni"));
  await changeValue(container.querySelector('input[type="search"]'), `${sourceId} conferma-finale`);
  const toggle = container.querySelector(".fl-board-radio-toggle");
  expect(toggle).not.toBeNull();
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(container.querySelector('[data-testid="rendered-answer"]')).toBeNull();

  await click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  const panel = document.getElementById(toggle.getAttribute("aria-controls"));
  expect(panel.querySelector('[data-testid="rendered-answer"]').textContent).toBe(fullAnswer);
  expect([...panel.querySelectorAll(".mock-source-chips button")].map((button) => button.textContent)).toEqual([sourceId, "G2-01"]);

  await click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(document.getElementById(toggle.getAttribute("aria-controls"))).toBeNull();
});
