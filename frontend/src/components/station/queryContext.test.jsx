import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import QueryShortcuts from "./QueryShortcuts";
import { firstReportedQuery, matchingQueryLog, queryDestinations, queryDocuments } from "./queryContext";

const documents = [{ id: "G1-01", title: "Messaggio della centrale" }];
const query = { id: "local-one", question: "Che cosa è successo?", answer: "La centrale lo conferma [G1-01].", session_id: "session-one", created_at: "2026-10-22T10:00:00Z", source_ids: ["G1-01"] };
const sqlAnswer = '🔎 TOOL SQL · GIORNO 4\n\n✅ RISPOSTA:\nNessun record.\n\nQUERY ESEGUITA:\nSELECT codice FROM accessi WHERE id = ?\nPARAMETRI:\n[42]\nRIGHE RESTITUITE:\n{"colonne":["codice"],"righe":[]}\n\n📌 FONTE: accessi.sqlite';

test("disables every shortcut before a reply and during a failed reply", () => {
  expect(queryDestinations(null, documents)).toEqual({ archivio: false, database: false, timeline: false });
  expect(queryDestinations({ ...query, failed: true }, documents)).toEqual({ archivio: false, database: false, timeline: false });
  const html = renderToStaticMarkup(<QueryShortcuts query={null} documents={documents} />);
  expect(html.match(/disabled=""/g)).toHaveLength(3);
});

test("enables only destinations backed by the current reply, including actual inline citations", () => {
  expect(queryDestinations(query, documents)).toEqual({ archivio: true, database: false, timeline: true });
  expect(queryDestinations({ ...query, source_ids: ["UNKNOWN"], answer: "Nessuna fonte" }, documents).archivio).toBe(false);
  expect(queryDestinations({ ...query, answer: "Non ho usato prove in questa risposta.", source_ids: ["G1-01"] }, documents).archivio).toBe(false);
  expect(queryDocuments({ ...query, answer: "Nessuna prova.\nFONTI RECUPERATE:\n[G1-01] recuperata ma non usata come prova." }, documents)).toEqual([]);
  expect(queryDocuments({ ...query, source_ids: [], answer: "Riscontro [g1-01] e [INESISTENTE]." }, documents)).toEqual(documents);
  expect(queryDestinations({ ...query, answer: "Consulta il database accessi.sqlite", source_ids: ["accessi.sqlite"] }, documents).database).toBe(false);
});

test("opens a database result only for an executed SQL trace, including zero rows", () => {
  expect(queryDestinations({ ...query, answer: sqlAnswer, source_ids: ["accessi.sqlite"] }, documents)).toEqual({ archivio: false, database: true, timeline: true });
  expect(queryDestinations({ ...query, answer: "🔎 TOOL SQL · GIORNO 4\n\n✅ RISPOSTA:\nServono altri parametri." }, documents).database).toBe(false);
  expect(queryDestinations({ ...query, answer: sqlAnswer.replace('"righe":[]', '"righe":"bad"') }, documents).database).toBe(false);
});

test("resolves bracketed file paths without mixing up mission files from different days", () => {
  const missions = [1, 5].map((day) => ({ id: `giorno_${day}/missioni/Missione.xlsx`, title: `Missione ${day}` }));
  const reply = { ...query, source_ids: [], answer: "Le istruzioni sono in [giorno_5/missioni/Missione.xlsx]." };
  expect(queryDocuments(reply, missions)).toEqual([missions[1]]);
  expect(queryDestinations(reply, missions).archivio).toBe(true);
  expect(queryDocuments({ ...reply, answer: "Nessuna prova.\nFONTI:\n[giorno_5/missioni/Missione.xlsx]" }, missions)).toEqual([]);
});

test("matches the exact answer when a session repeats a question", () => {
  const earlier = { ...query, id: "earlier", answer: "Risposta precedente." };
  const saved = { ...query, id: "saved" };
  expect(matchingQueryLog(query, [earlier, saved])).toBe(saved);
  expect(queryDestinations({ ...query, id: "saved" }, documents, [saved]).timeline).toBe(true);
  expect(queryDestinations({ ...query, id: "unknown" }, documents, [earlier]).timeline).toBe(false);
});

test("prefers the saved ID when identical questions and answers occur more than once", () => {
  const earlier = { ...query, id: "earlier" };
  const saved = { ...query, id: "saved", created_at: "2026-10-22T11:00:00Z" };
  expect(matchingQueryLog(saved, [earlier, saved])).toBe(saved);
});

test("matches a local reply to its occurrence by time when the content repeats", () => {
  const earlier = { ...query, id: "earlier", created_at: "2026-10-22T09:00:00Z" };
  const saved = { ...query, id: "saved", created_at: "2026-10-22T09:59:59Z" };
  const later = { ...query, id: "later", created_at: "2026-10-22T11:00:00Z" };
  expect(matchingQueryLog(query, [later, earlier, saved])).toBe(saved);
});

test("timeline finds the earliest actual citation across questions and sessions", () => {
  const first = { ...query, id: "first", session_id: "other-session", question: "Prima domanda", answer: "Primo riscontro [g1-01].", created_at: "2026-10-20T09:00:00Z" };
  const second = { ...query, id: "second", created_at: "2026-10-21T09:00:00Z" };
  const retrievedOnly = { ...first, id: "unused", answer: "Nessun dato.\nFONTI RECUPERATE:\n[G1-01]", created_at: "2026-10-19T09:00:00Z" };
  const unrelated = { ...first, id: "unrelated", answer: "Altra prova [G2-01].", created_at: "2026-10-18T09:00:00Z" };
  expect(firstReportedQuery(query, [second, query, retrievedOnly, unrelated, first])).toBe(first);
});

test("a focused citation finds its first report instead of the first report of another source", () => {
  const firstOther = { ...query, id: "other", answer: "Prima prova [G2-01].", created_at: "2026-10-20T09:00:00Z" };
  const firstFocused = { ...query, id: "focused", created_at: "2026-10-21T09:00:00Z" };
  const reply = { ...query, answer: "Riscontri [G2-01] e [G1-01]." };
  expect(firstReportedQuery(reply, [firstFocused, firstOther])).toBe(firstOther);
  expect(firstReportedQuery({ ...reply, focus_id: "g1-01" }, [firstFocused, firstOther])).toBe(firstFocused);
});

test("without citations, timeline finds the first identical answer even for a different question", () => {
  const reply = { ...query, answer: "Il codice è ST-2089." };
  const first = { ...reply, id: "first", question: "Quale codice?", session_id: "older-session", created_at: "2026-10-20T09:00:00Z" };
  const unrelated = { ...first, id: "unrelated", answer: "Il codice non è noto.", created_at: "2026-10-19T09:00:00Z" };
  expect(firstReportedQuery(reply, [unrelated, first])).toBe(first);
});

test("timeline falls back to the current reply and excludes future, failed and undated reports", () => {
  const future = { ...query, id: "future", created_at: "2026-10-23T09:00:00Z" };
  const failed = { ...query, id: "failed", failed: true, created_at: "2026-10-20T09:00:00Z" };
  const undated = { ...query, id: "undated", created_at: "invalid" };
  expect(firstReportedQuery(query, [future, failed, undated])).toBe(query);
  const saved = { ...query, id: "saved", created_at: "2026-10-22T09:59:59Z" };
  expect(firstReportedQuery(query, [future, saved])).toBe(saved);
  expect(firstReportedQuery(null)).toBeNull();
});

test("busy state disables even destinations that have valid references", () => {
  const html = renderToStaticMarkup(<QueryShortcuts query={query} documents={documents} disabled />);
  expect(html.match(/disabled=""/g)).toHaveLength(3);
});
