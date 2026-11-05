import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TimelineDocument, { parseTimelineDocument, timelineDocumentTokens } from "./TimelineDocument";

const title = "Registro di funzionamento — giorno operativo 01, ore 19:23";
const first = "Il turno batterie ha ricevuto una trasmissione regolare da Ripetitore Cripta. La prova è stata eseguita prima del cambio turno del giorno 01. Il segnale di riscontro è ST-2089. Sono state annotate alimentazione presente e ricezione stabile. Il quadro non è stato ricontrollato dopo questa prova.";
const second = "Una copia è rimasta al punto di partenza e una è stata inviata all’archivio. Le scorte sono conteggiate alla chiusura del turno, senza sommare quelle già spedite.";
const event = {
  id: "document:LX2-1123", day: 2, title,
  content: `ARCHIVIO LAZZARO — Unità 2\nDocumento: LX2-1123\n${title}\n\n${first}\n\n${second}`,
};

test("separates the source header, operational day and time without changing the collection day or document", () => {
  const original = JSON.stringify(event);
  expect(parseTimelineDocument(event)).toEqual({
    title: "Registro di funzionamento", sourceId: "LX2-1123", archive: "ARCHIVIO LAZZARO — Unità 2",
    operationalDay: "01", time: "19:23", paragraphs: [first, second],
  });
  expect(JSON.stringify(event)).toBe(original);
  const html = renderToStaticMarkup(<TimelineDocument event={event} />);
  expect(html).toContain("Giorno operativo 01");
  expect(html).not.toContain("Giorno operativo 02");
  expect(html).toContain("lucide-triangle-alert");
  expect(html).toContain('dateTime="19:23"');
});

test("highlights the actual references and missing check while preserving every body character", () => {
  const tokens = timelineDocumentTokens(first);
  expect(tokens.map(token => token.text).join("")).toBe(first);
  expect(tokens).toContainEqual({ kind: "code", text: "ST-2089" });
  expect(tokens).toContainEqual({ kind: "place", text: "Ripetitore Cripta" });
  expect(tokens).toContainEqual({ kind: "state", text: "ricezione stabile" });
  expect(tokens.find(token => token.kind === "warning").text.trim()).toBe("Il quadro non è stato ricontrollato dopo questa prova.");
  expect(timelineDocumentTokens("Non solo una copia: il codice ST-2089 è riportato alle ore 19:23.")
    .some(token => token.kind === "warning")).toBe(false);
});

test("keeps unknown archive wording and original paragraphs instead of treating them as metadata", () => {
  const content = "ARCHIVIO non è stato verificato.\n\nIl secondo paragrafo rimane visibile.";
  expect(parseTimelineDocument({ id: "document:other", title: "Nota", content })).toMatchObject({
    title: "Nota", archive: "", operationalDay: "", time: "",
    paragraphs: ["ARCHIVIO non è stato verificato.", "Il secondo paragrafo rimane visibile."],
  });
});

test("handles the original mission files and renders source markup as text", () => {
  const parsed = parseTimelineDocument({ id: "document:G1-01", title: "Centrale", content: "ID G1-01\nCentrale\n\nPrima riga.\nSeconda riga." });
  expect(parsed.paragraphs).toEqual(["Prima riga.\nSeconda riga."]);
  const html = renderToStaticMarkup(<TimelineDocument event={{ id: "document:G1-01", title: "Centrale", content: "<script>testo originale</script>" }} />);
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;testo originale&lt;/script&gt;");
});
