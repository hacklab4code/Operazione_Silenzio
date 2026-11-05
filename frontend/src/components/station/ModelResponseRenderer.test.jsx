import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import ModelResponseRenderer, { parseModelResponse } from "./ModelResponseRenderer";

const hasEmoji = (value) => /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u.test(value);

test("renders archived report sections as vector icons while preserving source IDs and reliability", () => {
  const text = "📢 RAPPORTO RADIO // A.N.I.M.A.\n\n✅ RISPOSTA:\nA.N.I.M.A. confronta i registri disponibili.\n\n⚠️ COSA MANCA:\n- La conferma della centrale.\n\n📌 FONTI & ATTENDIBILITÀ:\n- 🟢 [G1-01] Documento verificato.\n- 🟡 [G1-02] Dichiarazione da riscontrare.\n- 🔴 [G1-03] Fonte contestata.\n- ⚫ [G1-04] Documento non disponibile.";
  const before = text;
  const parsed = parseModelResponse(text);
  expect(parsed.sources.map(({ id, type }) => [id, type])).toEqual([
    ["G1-01", "verified"], ["G1-02", "unconfirmed"], ["G1-03", "disputed"], ["G1-04", "missing"],
  ]);
  const html = renderToStaticMarkup(<ModelResponseRenderer text={text} />);
  expect(hasEmoji(html)).toBe(false);
  expect(html).toContain('aria-label="Risposta"');
  expect(html).toContain('aria-label="Cosa manca"');
  expect(html).toContain('aria-label="Fonti e attendibilità"');
  expect(html).toContain("A.N.I.M.A. confronta i registri disponibili.");
  expect(html).toContain("La conferma della centrale.");
  expect(html).not.toContain("model-source-item");
  expect(html).toContain("lucide-triangle-alert");
  expect(text).toBe(before);
});

test("converts emoji inside plain text, bold text, joined symbols and keycaps without losing the report wording", () => {
  const text = "📻 Messaggio ricevuto.\n\n**✅ Contatto confermato**.\n\n- ⚠️ Restare fermi.\n- 🧑‍🔬 Analisi dei campioni.\n- 🇮🇹 Squadra in Italia.\n- 1️⃣ campione conservato.";
  const html = renderToStaticMarkup(<ModelResponseRenderer text={text} />);
  expect(hasEmoji(html)).toBe(false);
  expect(html).toContain("<strong>");
  ["Messaggio ricevuto.", "Contatto confermato", "Restare fermi.", "Analisi dei campioni.", "Squadra in Italia.", "1 campione conservato."].forEach((phrase) => expect(html).toContain(phrase));
  expect(html).toContain('role="img" aria-label="Attenzione"');
  expect(html).toContain("<svg");
});

test("converts confidence symbols and retains source descriptions for citation previews", () => {
  const text = "📢 RAPPORTO RADIO\n\n✅ RISPOSTA:\nAttendere il contatto.\n\nCERTEZZA:\nAlta ✅\n\n📌 FONTI:\n- 🟢 [G1-01] Registro **📄 originale**.";
  const html = renderToStaticMarkup(<ModelResponseRenderer text={text} />);
  expect(hasEmoji(html)).toBe(false);
  expect(parseModelResponse(text).sources[0].title).toBe("Registro **📄 originale**.");
  expect(html).toContain('aria-label="Fonti e attendibilità"');
  expect(html).toContain("Registro");
  expect(html).toContain("Grado di certezza");
  expect(html).toContain("Alta");
});

test("keeps reports without emoji readable and never invents sources from an answer", () => {
  const html = renderToStaticMarkup(<ModelResponseRenderer text={"RISPOSTA:\nIl messaggio cita [G1-99], senza fonti elencate."} respondent="team" />);
  expect(html).toContain("[G1-99]");
  expect(html).not.toContain("model-source-item");
  expect(hasEmoji(html)).toBe(false);
});

test("separates the answer, document links and provenance without losing the preamble", () => {
  const parsed = parseModelResponse("RAPPORTO RADIO\nNota iniziale.\n\n**Sintesi:**\nDiego Neri (T283) compare in [LX2-8204].\n\n## Collegamenti tra documenti\n- T247: [LX2-8204] → [LX2-2987]\n\nPROVENIENZA DEI RISCONTRI:\nUna misura diretta e una copia.\n\n⚠️ ELEMENTI MANCANTI / DA VERIFICARE:\nLa destinazione finale.");
  expect(parsed.lead).toBe("Nota iniziale.");
  expect(parsed.answer).toBe("Diego Neri (T283) compare in [LX2-8204].");
  expect(parsed.links).toBe("- T247: [LX2-8204] → [LX2-2987]");
  expect(parsed.provenance).toBe("Una misura diretta e una copia.");
  expect(parsed.missing).toBe("La destinazione finale.");
  const html = renderToStaticMarkup(<ModelResponseRenderer text={parsed.raw} />);
  expect(html).toContain("Nota iniziale.");
  expect(html).toContain('aria-label="Collegamenti tra documenti"');
  expect(html).not.toContain('aria-label="Provenienza dei riscontri"');
});

test("keeps source usage separate from reliability and extracts compact titles", () => {
  const text = "RISPOSTA:\nDato [LX2-8204].\nFONTI:\n- 🟢 [LX2-8204] Registro personale · LX2_8204.txt — usato come prova\n- [LX2-2987] Registro ufficiale · LX2_2987.txt — recuperato dal dossier, non usato come prova\n- 🟡 [LX2-3135] Testimonianza da riscontrare — usato come prova";
  const { sources } = parseModelResponse(text);
  expect(sources.map(({ type, usage }) => [type, usage])).toEqual([
    ["verified", "evidence"], ["unconfirmed", "secondary"], ["unconfirmed", "evidence"],
  ]);
  expect(sources[0].title).toBe("Registro personale");
  expect(sources[0].details).toBe("LX2_8204.txt");
  const html = renderToStaticMarkup(<ModelResponseRenderer text={text} />);
  expect(html).toContain('class="model-citation-chip status-verified"');
  expect(html).not.toContain("model-secondary-sources");
  expect(html).not.toContain("model-source-item");
  expect(html).not.toContain("Testimonianza da riscontrare");
});

test("renders citation chips inside emphasis and preserves complete identifier suffixes", () => {
  const html = renderToStaticMarkup(<ModelResponseRenderer text={"RISPOSTA:\n**T283 [LX2-8204]** e _K291-081_ collegano [LX2_2987] e [LX2_3135]."} />);
  expect((html.match(/class="model-citation-chip/g) || [])).toHaveLength(3);
  expect(html).toContain('class="model-inline-code">T283</code>');
  expect(html).toContain('class="model-inline-code">K291-081</code>');
  expect(html).toContain("[LX2_2987]");
  expect(html).toContain("[LX2_3135]");
  expect(html).not.toContain("model-source-item");
});

test("supports retrieved source lists and does not treat negative verification as verified", () => {
  const { sources } = parseModelResponse("**Fonti recuperate:**\n1. [G2-01] Registro non confermato\n2. [G2-02] Trasporto non verificato");
  expect(sources.map(({ id, type, title }) => [id, type, title])).toEqual([
    ["G2-01", "unconfirmed", "Registro non confermato"],
    ["G2-02", "unconfirmed", "Trasporto non verificato"],
  ]);
});

test("keeps the team report title out of the answer body and accepts emphasized source IDs", () => {
  const parsed = parseModelResponse("🔎 SINTESI TEAM · ARCHIVIO COMPLETO\n\nRISPOSTA:\nIl lotto K291 arriva a Officina Selce.\n\nFONTI:\n- 🟢 **[LX2-5558]** Registro delle pratiche · LX2_5558.txt — usato come prova");
  expect(parsed.title).toBe("🔎 SINTESI TEAM · ARCHIVIO COMPLETO");
  expect(parsed.lead).toBe("");
  expect(parsed.sources[0].title).toBe("Registro delle pratiche");
  expect(parsed.sources[0].id).toBe("LX2-5558");
});

test("clicking a cited file opens that source in prove", async () => {
  const previous = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const onOpenSource = jest.fn(() => true);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const text = "RISPOSTA:\nLa direttiva è firmata [G4-03].\nFONTI:\n- 🟢 [G4-03] Ordine di prosecuzione · G4-03.txt — usato come prova";
  await act(async () => root.render(<ModelResponseRenderer text={text} onOpenSource={onOpenSource} />));
  const chip = container.querySelector(".model-citation-chip");
  await act(async () => chip.click());
  const openProof = document.querySelector(".model-citation-popover-action");
  expect(openProof.textContent).toContain("Apri nelle prove");
  await act(async () => openProof.click());
  expect(onOpenSource).toHaveBeenCalledWith("G4-03");
  await act(async () => root.unmount());
  container.remove();
  globalThis.IS_REACT_ACT_ENVIRONMENT = previous;
});

test("separates the archived documentary chain into four readable passages without changing its evidence", () => {
  const text = `📻 RAPPORTO RADIO // ARCHIVIO COMPLETO

✅ RISPOSTA:
Passaggi della catena documentale (leggere i codici completi e distinguere le consegne):
«Daria Neri — tesserino T247 — manutenzione radio.
Diego Neri — tesserino T283 — trasporto materiali.
I tesserini sono personali. In questo turno non risultano sostituzioni, furti o prestiti.» — [LX2-8204] LX2_8204.txt
««Ho visto D. Neri aprire la cabina. Non so il nome completo. Sul tesserino c’era T247. Non ho visto cosa ha fatto all’interno». L’ingresso da solo non prova un sabotaggio.» — [LX2-2987] LX2_2987.txt
«06:35 — ingresso con tesserino T247.
06:46 — uscita con lo stesso tesserino.
Il registro non indica quali azioni siano state svolte dentro la cabina.» — [LX2-3135] LX2_3135.txt
«Alle 06:30 è stato incaricato il tesserino T247 di verificare una batteria instabile nella cabina. Non è disponibile un rapporto conclusivo sull’intervento. Non è possibile stabilire da questi atti chi abbia causato il guasto.» — [LX2-9960] LX2_9960.txt

COLLEGAMENTI TRA DOCUMENTI:
- T247: [LX2-8204] → [LX2-2987] → [LX2-3135] → [LX2-9960]
- Dario Neri: [G1-02] → [G2-03] → [ARCH-3097] → [G2-02]

⚠️ COSA MANCA:
Nessuna lacuna rilevata nei passaggi usati: ogni frase è copiata da un file. Restano da confermare gli eventuali dati che i documenti non riportano. Altri 4 passaggi enciclopedici sono stati recuperati ma non usati come prova.

📌 FONTI & ATTENDIBILITÀ:
- 🟢 [LX2-8204] Registro del personale — giorno operativo 02 · LX2_8204.txt — usato come prova
- 🟢 [LX2-2987] Testimonianza raccolta — giorno operativo 02 · LX2_2987.txt — usato come prova
- 🟢 [LX2-3135] Registro ingresso cabina — giorno operativo 02 · LX2_3135.txt — usato come prova
- 🟡 [G1-02] Una voce dal quartiere · G1-02.txt — recuperato dal dossier, non usato come prova
- 🟡 [G2-03] Riassunto della centrale · G2-03.txt — recuperato dal dossier, non usato come prova
- 🟢 [LX2-9960] Ordine di intervento — giorno operativo 02 · LX2_9960.txt — usato come prova
- 🟡 [ARCH-3097] Verbale di opposizione · documento_0057.html — recuperato dal dossier, non usato come prova
- 🟡 [G2-02] Intervento manutenzione · G2-02.txt — recuperato dal dossier, non usato come prova`;
  const before = text;
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(<ModelResponseRenderer text={text} />);
  const passages = container.querySelector("ol.model-response-passages");
  expect(passages).not.toBeNull();
  const quotes = passages.querySelectorAll("blockquote");
  expect(quotes).toHaveLength(4);
  expect(quotes[0].textContent).toContain("Daria Neri — tesserino T247 — manutenzione radio.");
  expect(quotes[0].textContent).toContain("Diego Neri — tesserino T283 — trasporto materiali.");
  expect(quotes[0].textContent).toContain("In questo turno non risultano sostituzioni, furti o prestiti.");
  expect(quotes[1].textContent).toContain("«Ho visto D. Neri aprire la cabina.");
  expect(quotes[1].textContent).toContain("Non ho visto cosa ha fatto all’interno».");
  expect(quotes[1].textContent).toContain("L’ingresso da solo non prova un sabotaggio.");
  expect(quotes[2].textContent).toContain("06:35 — ingresso con tesserino T247.");
  expect(quotes[2].textContent).toContain("06:46 — uscita con lo stesso tesserino.");
  expect(quotes[2].textContent).toContain("Il registro non indica quali azioni siano state svolte dentro la cabina.");
  expect(quotes[3].textContent).toContain("Alle 06:30 è stato incaricato il tesserino T247");
  expect(quotes[3].textContent).toContain("Non è possibile stabilire da questi atti chi abbia causato il guasto.");
  const footers = passages.querySelectorAll("footer");
  expect(footers).toHaveLength(4);
  ["LX2-8204", "LX2-2987", "LX2-3135", "LX2-9960"].forEach((id, index) => {
    expect(footers[index].querySelector(".model-citation-chip").textContent).toBe(`[${id}]`);
    expect(footers[index].textContent).toContain(`${id.replace("-", "_")}.txt`);
  });
  expect(container.textContent).toContain("Passaggi della catena documentale (leggere i codici completi e distinguere le consegne):");
  expect(text).toBe(before);
});

test("keeps ordinary quoted prose without a source attribution in its paragraph", () => {
  const text = "RISPOSTA:\nLa testimone riferisce «Ho visto D. Neri aprire la cabina». Il nome completo resta da verificare.";
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(<ModelResponseRenderer text={text} />);
  expect(container.querySelector("ol.model-response-passages")).toBeNull();
  expect(container.querySelector("blockquote")).toBeNull();
  expect(container.querySelector("p").textContent).toBe("La testimone riferisce «Ho visto D. Neri aprire la cabina». Il nome completo resta da verificare.");
});

test("preserves a partial streaming quote after a completed cited passage", () => {
  const text = "RISPOSTA:\nIntroduzione alla verifica.\n«Passaggio confermato.» — [G2-01] G2-01.txt\n«Il secondo passaggio è ancora in arrivo e cita T247";
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(<ModelResponseRenderer text={text} pending />);
  const passages = container.querySelector("ol.model-response-passages");
  expect(passages).not.toBeNull();
  expect(passages.querySelectorAll("blockquote")).toHaveLength(1);
  expect(passages.querySelector("blockquote").textContent).toContain("Passaggio confermato.");
  expect(container.textContent).toContain("Introduzione alla verifica.");
  expect(container.textContent).toContain("«Il secondo passaggio è ancora in arrivo e cita T247");
  expect(passages.textContent).not.toContain("Il secondo passaggio");
});
