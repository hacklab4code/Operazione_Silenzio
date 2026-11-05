import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { TextDecoder, TextEncoder } from "util";
import FieldlinkDashboard from "./FieldlinkDashboard";
import { useFieldlinkData } from "./FieldlinkData";
import { readCatalog } from "./FieldlinkSourcePreview";

jest.mock("./FieldlinkData", () => ({ useFieldlinkData: jest.fn(), notifyFieldlinkDataUpdated: jest.fn() }));
jest.mock("./FieldlinkSourcePreview", () => ({ readCatalog: jest.fn() }));
jest.mock("./LetterGlitch", () => () => null);
jest.mock("./AnimaBoot", () => () => null);
jest.mock("./FieldlinkRail", () => () => null);
jest.mock("./RadioTrace", () => ({ RadioTrace: () => null }));
jest.mock("./TopBar", () => ({ NAV: [{ id: "archivio", label: "Prove" }, { id: "timeline", label: "Timeline" }] }));
jest.mock("@/data/story", () => ({ DANGER_WORDS: [], OPENING: "Collegamento pronto." }), { virtual: true });
jest.mock("./FieldlinkSectionPage", () => ({ section, query }) => <div data-testid="destination" data-question={query?.question}>{section}|{query?.focus_id}</div>);

const originalFetch = global.fetch;
const originalDecoder = global.TextDecoder;
const originalMatchMedia = window.matchMedia;
const originalCrypto = window.crypto;
const originalResizeObserver = global.ResizeObserver;
const sourceId = "giorno_5/missioni/Missione.xlsx";
const answer = `RISPOSTA:\nConsulta [${sourceId}].\nFONTI:\n- 🟢 [${sourceId}] Missione del giorno 5 — usata come prova`;
let root, container;

function Dashboard() {
  const [section, setSection] = useState("radio");
  return <FieldlinkDashboard section={section} onOpen={setSection} quality={100} frequency={156.8} onDanger={() => {}} />;
}

beforeAll(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; });
beforeEach(() => {
  window.matchMedia = () => ({ matches: true });
  Object.defineProperty(window, "crypto", { configurable: true, value: { randomUUID: () => "test-session" } });
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  global.TextDecoder = TextDecoder;
  const documents = [{ id: sourceId, key: sourceId, title: "Missione del giorno 5" }];
  useFieldlinkData.mockReturnValue({ documents, radio_logs: [], archive: null });
  readCatalog.mockResolvedValue(documents);
  global.fetch = jest.fn(async (url) => {
    if (!url.endsWith("/api/radio")) return { ok: true, json: async () => ({}) };
    let sent = false;
    return { ok: true, body: { getReader: () => ({
      read: async () => {
        if (sent) return { done: true };
        sent = true;
        return { done: false, value: new TextEncoder().encode(`data: ${JSON.stringify({ t: answer })}\n\ndata: [END]\n\n`) };
      },
      releaseLock: () => {},
    }) } };
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  global.fetch = originalFetch;
  global.TextDecoder = originalDecoder;
  window.matchMedia = originalMatchMedia;
  Object.defineProperty(window, "crypto", { configurable: true, value: originalCrypto });
  global.ResizeObserver = originalResizeObserver;
});

test.each(["Apri nelle prove", "Apri nella timeline"])("%s navigates to the mission cited by file path", async (label) => {
  await act(async () => root.render(<Dashboard />));
  const input = container.querySelector('[data-testid="radio-input"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "Dove sono le istruzioni?");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => input.closest("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  const chip = container.querySelector(".model-citation-chip");
  expect(chip).not.toBeNull();
  await act(async () => chip.click());
  const action = [...document.querySelectorAll(".model-citation-popover-action")].find((button) => button.textContent.includes(label));
  await act(async () => action.click());
  const section = label === "Apri nelle prove" ? "archivio" : "timeline";
  expect(container.querySelector('[data-testid="destination"]').textContent).toBe(`${section}|${sourceId}`);
});

test("opening a citation in an older chat reply keeps that exchange instead of the latest reply", async () => {
  await act(async () => root.render(<Dashboard />));
  const input = container.querySelector('[data-testid="radio-input"]');
  for (const question of ["Prima citazione", "Citazione successiva"]) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, question);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => input.closest("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  }
  const replies = container.querySelectorAll('.fieldlink-message.marco');
  expect(replies).toHaveLength(3);
  await act(async () => replies[1].querySelector('.model-citation-chip').click());
  const action = [...document.querySelectorAll('.model-citation-popover-action')].find((button) => button.textContent.includes("Apri nella timeline"));
  await act(async () => action.click());
  const destination = container.querySelector('[data-testid="destination"]');
  expect(destination.textContent).toBe(`timeline|${sourceId}`);
  expect(destination.getAttribute('data-question')).toBe("Prima citazione");
});
