import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SqlQueryResponse from "./SqlQueryResponse";
import QueryResult from "./QueryResult";
import { formatSqlValue, groupAccessRows, layoutSql, parseSqlToolResponse, sqlParameterBindings, structureSqlBriefing, structureSqlMembers, tokenizeSql } from "./sqlResponse";

const query = "SELECT o.nome AS operatore, d.nome AS deposito, a.codice, a.stato, a.valido_fino\nFROM accessi a JOIN operatori o ON o.id = a.operatore_id JOIN depositi d ON d.id = a.deposito_id\nWHERE o.nome = ? AND d.nome = ? AND d.settore = ? AND a.pratica = ? AND a.stato = 'attivo' AND a.valido_fino >= ?";
const parameters = ["Dario Neri", "Pozzo Freddo", "F2", "RV384", "2031-10-12 06:00"];
const columns = ["operatore", "deposito", "codice", "stato", "valido_fino"];
const row = ["Dario Neri", "Pozzo Freddo", "000742", "attivo", "2031-10-12 23:59"];
const response = (rows) => `🔎 TOOL SQL · GIORNO 4\n\n✅ RISPOSTA:\nEsito della verifica.\n\nQUERY ESEGUITA:\n${query}\nPARAMETRI:\n${JSON.stringify(parameters)}\nRIGHE RESTITUITE:\n${JSON.stringify({ colonne: columns, righe: rows })}\n\n📌 FONTE: accessi.sqlite · apertura in sola lettura`;

test("lays a one-line query out on separate clauses without touching strings", () => {
  const flat = `SELECT tabelle FROM (SELECT COUNT(*) AS tabelle, COALESCE(SUM(n), 0) AS righe FROM (SELECT COUNT(*) AS n FROM "r03" UNION ALL SELECT COUNT(*) AS n FROM "r11"))`;
  const laid = layoutSql(flat);
  expect(laid).toBe([
    "SELECT tabelle",
    "FROM (",
    "  SELECT COUNT(*) AS tabelle, COALESCE(SUM(n), 0) AS righe",
    "  FROM (",
    "    SELECT COUNT(*) AS n",
    "    FROM \"r03\"",
    "    UNION ALL",
    "    SELECT COUNT(*) AS n",
    "    FROM \"r11\"",
    "  )",
    ")",
  ].join("\n"));
  expect(laid).not.toMatch(/UNION ALL SELECT/);
  const kept = layoutSql("SELECT 'UNION ALL SELECT' AS testo FROM \"r11\" WHERE nota = 'AND ?' -- UNION\nAND pratica = ?");
  expect(kept).toContain("'UNION ALL SELECT'");
  expect(kept).toContain("'AND ?'");
  expect(kept).toContain("-- UNION");
  expect(tokenizeSql(kept).filter((token) => token.type === "parameter")).toHaveLength(1);
  const html = renderToStaticMarkup(<SqlQueryResponse text={response([row]).replace(query, flat)} />);
  expect(html).toContain("&quot;r03&quot;");
  expect(html).toContain("UNION");
  expect(html).not.toContain("UNION ALL SELECT");
  expect(layoutSql(query)).toBe([
    "SELECT o.nome AS operatore, d.nome AS deposito, a.codice, a.stato, a.valido_fino",
    "FROM accessi a",
    "JOIN operatori o ON o.id = a.operatore_id",
    "JOIN depositi d ON d.id = a.deposito_id",
    "WHERE o.nome = ?",
    "  AND d.nome = ?",
    "  AND d.settore = ?",
    "  AND a.pratica = ?",
    "  AND a.stato = 'attivo'",
    "  AND a.valido_fino >= ?",
  ].join("\n"));
});

test("preserves the original query, parameter values and leading zeroes in authorization codes", () => {
  const parsed = parseSqlToolResponse(response([row]));
  expect(parsed.query).toBe(query);
  expect(parsed.parameters).toEqual(parameters);
  expect(parsed.rows.righe[0][2]).toBe("000742");
  expect(sqlParameterBindings(query, parameters).map((binding) => binding.label)).toEqual(["Operatore", "Deposito", "Settore", "Pratica", "Valido al"]);
});

test("question marks in quoted strings and comments are never assigned to parameters", () => {
  const sql = "SELECT 'perché?', 'D''Angelo?', \"campo?\" FROM accessi -- ? commento\nWHERE a.pratica = ? /* ? */ AND a.valido_fino >= ?";
  const placeholders = tokenizeSql(sql).filter((token) => token.type === "parameter");
  expect(placeholders.map((token) => token.parameter)).toEqual([0, 1]);
  expect(sqlParameterBindings(sql, ["RV384", "2031-10-12 06:00"]).map((binding) => binding.label)).toEqual(["Pratica", "Valido al"]);
  expect(tokenizeSql(sql).map((token) => token.text).join("")).toBe(sql);
});

test("supports saved Python literals and keeps malformed result data available for inspection", () => {
  const legacy = response([row]).replace(JSON.stringify(parameters), "['Dario Neri', 'Pozzo Freddo', 'F2', 'RV384', '2031-10-12 06:00']").replace(JSON.stringify({ colonne: columns, righe: [row] }), "{'colonne': ['codice', 'stato'], 'righe': [['000742', None]]}");
  expect(parseSqlToolResponse(legacy).rows.righe).toEqual([["000742", null]]);
  const malformed = response([row]).replace(JSON.stringify({ colonne: columns, righe: [row] }), '{"colonne": ["codice"], "righe": ["bad row"]}');
  expect(parseSqlToolResponse(malformed).rows).toBeNull();
  expect(renderToStaticMarkup(<SqlQueryResponse text={malformed} />)).toContain("Risultati originali");
});

test("a single result has one readable record, while multiple results have one table", () => {
  const html = renderToStaticMarkup(<QueryResult query={{ question: "Quale permesso?", answer: response([row]), source_ids: ["accessi.sqlite"] }} />);
  expect(html).toContain('aria-label="Record restituito"');
  expect(html).toContain("000742");
  expect(html).toContain("12/10/2031, 23:59");
  expect(html).not.toContain("<table");
  expect(html).not.toContain("fl-source-chips");
  const multiple = renderToStaticMarkup(<SqlQueryResponse text={response([row, [...row.slice(0, 2), "000743", ...row.slice(3)]])} />);
  expect(multiple.match(/<table/g)).toHaveLength(1);
  expect(multiple).toContain("2 record trovati");
});

test("an incomplete authorization offers the missing fields already known", () => {
  const text = `🔎 TOOL SQL · GIORNO 4\n\n✅ RISPOSTA:\nPer cercare l’autorizzazione servono: settore.\n\nCAMPI MANCANTI:\n${JSON.stringify({ mancanti: ["settore"], noti: { persona: "Dario Neri", deposito: "Pozzo Freddo", settore: null, pratica: "RV384" } })}\n\n📌 FONTE: accessi.sqlite · apertura in sola lettura`;
  const parsed = parseSqlToolResponse(text);
  expect(parsed.answer).toBe("Per cercare l’autorizzazione servono: settore.");
  expect(parsed.fields).toEqual({ missing: ["settore"], known: { persona: "Dario Neri", deposito: "Pozzo Freddo", settore: "", pratica: "RV384" } });
  const html = renderToStaticMarkup(<SqlQueryResponse text={text} onAsk={() => {}} />);
  expect(html).toContain("Dati mancanti");
  expect(html).toContain('value="Dario Neri"');
  expect(html).toContain('value="Pozzo Freddo"');
  expect(html).toContain('value="RV384"');
  expect(html).toContain('placeholder="Da inserire"');
  expect(html).toContain("Cerca nel database");
  expect(html).not.toContain('class="sql-query-code"');
});

test("empty and incomplete queries do not claim to have found an authorization", () => {
  const empty = renderToStaticMarkup(<SqlQueryResponse text={response([])} />);
  expect(empty).toContain("0 record trovati");
  expect(empty).not.toContain('class="sql-query-code"');
  const incomplete = renderToStaticMarkup(<SqlQueryResponse text={"🔎 TOOL SQL · GIORNO 4\n\n✅ RISPOSTA:\nServono persona e deposito.\n\n📌 FONTE: accessi.sqlite"} />);
  expect(incomplete).toContain("Servono persona e deposito.");
  expect(incomplete).not.toContain("record trovato");
  expect(formatSqlValue("2031-10-12 06:00", "Valido al")).toBe("12/10/2031, 06:00");
});

const briefingAnswer = [
  "Controllo alle 2026-11-04 12:00, Archivio Stige, varco V-29.",
  "Parametri presi dalla missione perché la domanda non li indica: archivio Archivio Stige, varco V-29, istante 2026-11-04 12:00.",
  "Operatori autorizzati: Elena Mori (SANITARIO, PX-406412, Unità 2-Ardesia); Fabio Rota (SICUREZZA, PX-609279, Unità 2-Ardesia).",
  "Un rinnovo sovrapposto della stessa persona conta una sola volta. I due ruoli restano di due persone diverse.",
  "Terminali con finestra aperta e chiave valida: terminale 5970908, Canale Sigma, chiave 779882; terminale 1118747, Canale Theta, chiave 187264.",
  "Il canale del lettore del veicolo non è nell'archivio recuperato: i terminali restano tutti candidati.",
  "Candidati esclusi: Unità 2-Arenaria: permesso SANITARIO in stato BLOCCATO | Unità 2-Ossidiana: permesso SANITARIO valido dalle 2026-11-04 12:30; permesso SICUREZZA valido dalle 2026-11-04 12:30 | Unità 2-Porfido: manca il permesso SANITARIO | permesso SICUREZZA non indicato.",
  "L'autorizzazione usa permessi, abilitazioni, squadra, sospensioni, revoche, terminale, finestra e chiave. Copie dei registri e accessi passati restano fonti storiche.",
].join(" ");

test("a recovered-archive briefing is split into people, terminals and exclusions", () => {
  const briefing = structureSqlBriefing(briefingAnswer);
  expect(briefing.archive).toBe("Archivio Stige");
  expect(briefing.operators.map((person) => person.name)).toEqual(["Elena Mori", "Fabio Rota"]);
  expect(briefing.terminals.map((terminal) => terminal.id)).toEqual(["5970908", "1118747"]);
  expect(briefing.exclusions.find((item) => item.subject === "Unità 2-Ossidiana").reasons).toEqual([
    "permesso SANITARIO valido dalle 2026-11-04 12:30",
    "permesso SICUREZZA valido dalle 2026-11-04 12:30",
  ]);
  expect(briefing.exclusions.find((item) => item.subject === "Unità 2-Porfido").reasons).toEqual([
    "manca il permesso SANITARIO",
    "permesso SICUREZZA non indicato",
  ]);
  expect(structureSqlBriefing("Esito della verifica.")).toBeNull();
  expect(structureSqlBriefing("Controllo alle 2026-11-04 12:00, Archivio Stige, varco V-29. Operatori autorizzati: testo libero.")).toBeNull();

  const columns = ["tipo", "ruolo", "nome", "codice_px", "squadra", "terminale_id", "canale", "chiave"];
  const rows = [
    ["operatore", "SANITARIO", "Elena Mori", "PX-406412", "Unità 2-Ardesia", null, null, null],
    ["operatore", "SICUREZZA", "Fabio Rota", "PX-609279", "Unità 2-Ardesia", null, null, null],
    ["terminale", null, null, null, null, "5970908", "Canale Sigma", "779882"],
    ["terminale", null, null, null, null, "1118747", "Canale Theta", "187264"],
  ];
  expect(groupAccessRows(columns, rows).operators).toHaveLength(2);
  const html = renderToStaticMarkup(<SqlQueryResponse text={`🔎 TOOL SQL · GIORNO 4\n\n✅ RISPOSTA:\n${briefingAnswer}\n\nQUERY ESEGUITA:\nSELECT 1\nPARAMETRI:\n[]\nRIGHE RESTITUITE:\n${JSON.stringify({ colonne: columns, righe: rows })}\n\n📌 FONTE: archivio_recuperato.sqlite · apertura in sola lettura`} />);
  expect(html).toContain("2 operatori autorizzati · 2 terminali candidati");
  expect(html).toContain("04/11/2026, 12:00");
  expect(html).toContain("PX-406412");
  expect(html).toContain("779882");
  expect(html).toContain("permesso SANITARIO in stato BLOCCATO");
  expect(html).toContain("Parametri dalla missione, perché la domanda non li indica: archivio, varco, istante.");
  expect(html).not.toContain("Operatori autorizzati:");
  expect(html).not.toContain("<table");
  expect(html).not.toContain(" | ");
});

const membersAnswer = [
  "Alle 2026-11-04 12:00, Archivio Stige, varco V-29, nelle squadre con entrambi i permessi validi.",
  "Parametri presi dalla missione perché la domanda non li indica: archivio Archivio Stige, varco V-29.",
  "Persone in squadra alle 12:00, con abilitazione valida e senza sospensione: Elena Mori (SANITARIO, PX-406412, Unità 2-Ardesia); Fabio Rota (SICUREZZA, PX-609279, Unità 2-Ardesia); Hilda Fontana (SANITARIO,SICUREZZA, PX-468219, Unità 2-Tufo).",
  "Nella squadra ma escluse: Alma Doria (sospensione attiva, Unità 2-Basalto); Gemma Grassi (nessuna abilitazione valida, Unità 2-Granito).",
].join(" ");

test("a squad-members answer becomes colored people and exclusions instead of one paragraph", () => {
  const members = structureSqlMembers(membersAnswer);
  expect(members.people.map((person) => [person.name, person.roles, person.code])).toEqual([
    ["Elena Mori", ["SANITARIO"], "PX-406412"],
    ["Fabio Rota", ["SICUREZZA"], "PX-609279"],
    ["Hilda Fontana", ["SANITARIO", "SICUREZZA"], "PX-468219"],
  ]);
  expect(members.excluded.map((person) => person.reason)).toEqual(["sospensione attiva", "nessuna abilitazione valida"]);
  expect(structureSqlMembers("Esito della verifica.")).toBeNull();
  expect(structureSqlMembers("Alle 2026-11-04 12:00, Archivio Stige, varco V-29, nelle squadre con entrambi i permessi validi. Persone in squadra alle 12:00, con abilitazione valida e senza sospensione: testo libero.")).toBeNull();

  const columns = ["squadra", "nome", "codice_px", "abilitazione"];
  const rows = [
    ["Unità 2-Ardesia", "Elena Mori", "PX-406412", "SANITARIO"],
    ["Unità 2-Ardesia", "Fabio Rota", "PX-609279", "SICUREZZA"],
    ["Unità 2-Tufo", "Hilda Fontana", "PX-468219", "SANITARIO,SICUREZZA"],
  ];
  const html = renderToStaticMarkup(<SqlQueryResponse text={`🔎 TOOL SQL · GIORNO 4\n\n✅ RISPOSTA:\n${membersAnswer}\n\nQUERY ESEGUITA:\nSELECT 1\nPARAMETRI:\n[]\nRIGHE RESTITUITE:\n${JSON.stringify({ colonne: columns, righe: rows })}\n\n📌 FONTE: archivio_recuperato.sqlite · apertura in sola lettura`} />);
  expect(html).toContain("3 persone in squadra");
  expect(html).toContain("sql-role-sanitario");
  expect(html).toContain("sql-role-sicurezza");
  expect(html).toContain("is-suspended");
  expect(html).toContain("is-unqualified");
  expect(html).toContain("Alma Doria");
  expect(html).toContain("04/11/2026, 12:00");
  expect(html).not.toContain("Persone in squadra alle");
  expect(html).not.toContain("<table");
});

test("a negative recovered-archive briefing stays readable without inventing records", () => {
  const answer = "Controllo alle 2026-11-04 12:00, Archivio Stige, varco V-29. Nessuna coppia SANITARIO e SICUREZZA soddisfa insieme squadra, abilitazione, permesso attivo, revoche e sospensioni. Terminale 1004687, Canale Ferro, chiave 440011. L'autorizzazione usa permessi, abilitazioni, squadra, sospensioni, revoche, terminale, finestra e chiave. Copie dei registri e accessi passati restano fonti storiche.";
  const briefing = structureSqlBriefing(answer);
  expect(briefing.operators).toEqual([]);
  expect(briefing.noOperators).toContain("Nessuna coppia");
  expect(briefing.terminals).toEqual([{ id: "1004687", channel: "Canale Ferro", key: "440011" }]);
  const html = renderToStaticMarkup(<SqlQueryResponse text={`🔎 TOOL SQL · GIORNO 4\n\n✅ RISPOSTA:\n${answer}\n\n📌 FONTE: archivio_recuperato.sqlite`} />);
  expect(html).toContain("1 terminale candidato");
  expect(html).toContain("Nessuna coppia SANITARIO e SICUREZZA");
  expect(html).not.toContain("sql-query-answer");
});

test("renders documentary sections inside SQL replies with the site's report components", () => {
  const answer = `**  
**Nessuna prova documentale conferma gli operatori.**

⚠️ COSA MANCA:
- **Verifica** dei record in \`accessi\` per il varco V-29.
- Conferma della centrale.

📌 FONTI & ATTENDIBILITÀ:
- 🟢 [MISSIONE_imprevisti_g4] Destinazione dell'archivio.
- 🟡 [giorno_4/database/accessi.sqlite] Schema ancora da verificare.
- 🟡`;
  const text = response([]).replace("Esito della verifica.", answer);
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(<SqlQueryResponse text={text} />);
  const report = container.querySelector(".sql-query-report");
  expect(report.querySelector('[aria-label="Cosa manca"]')).not.toBeNull();
  expect(report.querySelector('[aria-label="Fonti e attendibilità"]')).not.toBeNull();
  expect(report.querySelectorAll(".section-missing li")).toHaveLength(2);
  expect(report.querySelector("strong").textContent).toBe("Nessuna prova documentale conferma gli operatori.");
  expect(report.querySelector("code").textContent).toBe("accessi");
  expect(report.querySelectorAll(".model-citation-chip")).toHaveLength(2);
  expect(/\p{Extended_Pictographic}/u.test(container.textContent)).toBe(false);
  expect(container.textContent).not.toMatch(/\*\*|`|FONTI & ATTENDIBILITÀ:/);
  expect(parseSqlToolResponse(text).answer).toBe(answer);
});
