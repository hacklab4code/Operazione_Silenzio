/** Separate the Day 4 SQL tool trace from the user-facing answer. */
export function parseSqlToolResponse(text) {
  if (typeof text !== "string" || !/^🔎\s*TOOL SQL\s*·\s*GIORNO \d+/im.test(text.trim())) return null;
  const capture = (label, nextLabels = []) => {
    const start = text.search(new RegExp(`^${label}:\\s*`, "im"));
    if (start < 0) return "";
    const contentStart = text.indexOf(":", start) + 1;
    const tail = text.slice(contentStart).replace(/^\s*/, "");
    const ends = nextLabels.map((next) => tail.search(new RegExp(`^${next}:\\s*`, "im"))).filter((index) => index >= 0);
    return tail.slice(0, ends.length ? Math.min(...ends) : tail.length).trim();
  };
  const answer = capture("✅ RISPOSTA", ["QUERY ESEGUITA", "CAMPI MANCANTI", "📌 FONTE"]);
  const query = capture("QUERY ESEGUITA", ["PARAMETRI", "RIGHE RESTITUITE", "CAMPI MANCANTI", "📌 FONTE"]);
  const parametersRaw = capture("PARAMETRI", ["RIGHE RESTITUITE", "CAMPI MANCANTI", "📌 FONTE"]);
  const rowsRaw = capture("RIGHE RESTITUITE", ["CAMPI MANCANTI", "📌 FONTE"]);
  const fieldsRaw = capture("CAMPI MANCANTI", ["QUERY ESEGUITA", "📌 FONTE"]);
  const source = capture("📌 FONTE");
  const parseLiteral = (value) => {
    try { return JSON.parse(value); } catch { /* Support traces saved before the JSON format. */ }
    try {
      let json = "";
      for (let index = 0; index < value.length;) {
        const literal = value.slice(index).match(/^(None|True|False)\b/);
        if (literal) {
          json += { None: "null", True: "true", False: "false" }[literal[0]];
          index += literal[0].length;
          continue;
        }
        const quote = value[index];
        if (quote !== "'" && quote !== '"') { json += quote; index += 1; continue; }
        index += 1;
        let decoded = "";
        while (index < value.length && value[index] !== quote) {
          if (value[index] === "\\" && index + 1 < value.length) {
            const escaped = value[index + 1];
            const escapes = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" };
            decoded += escapes[escaped] ?? escaped;
            index += 2;
          } else { decoded += value[index]; index += 1; }
        }
        if (value[index] !== quote) return null;
        index += 1;
        json += JSON.stringify(decoded);
      }
      return JSON.parse(json);
    } catch { return null; }
  };
  const parameters = parseLiteral(parametersRaw);
  const rows = parseLiteral(rowsRaw);
  const fields = parseLiteral(fieldsRaw);
  const known = fields && fields.noti && typeof fields.noti === "object" && !Array.isArray(fields.noti) ? fields.noti : null;
  const missing = fields && Array.isArray(fields.mancanti) ? fields.mancanti.filter((name) => typeof name === "string") : [];
  return { answer, query, parameters: Array.isArray(parameters) ? parameters : null, parametersRaw, rows: rows && Array.isArray(rows.colonne) && rows.colonne.every((column) => typeof column === "string") && Array.isArray(rows.righe) && rows.righe.every(Array.isArray) ? rows : null, rowsRaw, source, fields: known && missing.length ? { missing, known: Object.fromEntries(Object.entries(known).map(([key, value]) => [key, value == null ? "" : String(value)])) } : null };
}

export const SQL_COLUMN_LABELS = {
  operatore: "Operatore", operatori: "Operatori", deposito: "Deposito", depositi: "Depositi", settore: "Settore", pratica: "Pratica", accessi: "Accessi",
  codice: "Codice di autorizzazione", stato: "Stato", valido_fino: "Valido fino",
  archivio: "Archivio", varco: "Varco", istante: "Istante",
  tipo: "Tipo", ruolo: "Ruolo", nome: "Nome", codice_px: "Codice persona", abilitazione: "Abilitazione",
  squadra: "Squadra", terminale_id: "Terminale", canale: "Canale", chiave: "Chiave",
  tabella: "Tabella", significato: "Significato", righe: "Righe", colonne: "Colonne", copertura: "Copertura",
};

export function sqlColumnLabel(column) {
  return SQL_COLUMN_LABELS[column] || column.replaceAll("_", " ");
}

// Keep quoted literals and comments intact: their question marks are not bindings.
/** Break a one-line query into readable clauses. Strings and comments stay intact. */
export function layoutSql(query = "") {
  const source = String(query ?? "");
  if (!source.trim()) return "";
  const clause = /^(?:UNION\s+ALL|INTERSECT|EXCEPT|UNION|GROUP\s+BY|ORDER\s+BY|LEFT\s+OUTER\s+JOIN|RIGHT\s+OUTER\s+JOIN|FULL\s+OUTER\s+JOIN|INNER\s+JOIN|CROSS\s+JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|FULL\s+JOIN|SELECT|FROM|WHERE|HAVING|LIMIT|JOIN|WITH|AND|OR)\b/i;
  let out = "";
  let depth = 0;
  const groups = [];
  let atLineStart = true;
  let lineHasContent = false;

  const nextSignificant = (index) => {
    let cursor = index;
    while (cursor < source.length) {
      const current = source[cursor];
      if (/\s/.test(current)) { cursor += 1; continue; }
      if (source.startsWith("--", cursor)) {
        const newline = source.indexOf("\n", cursor);
        cursor = newline < 0 ? source.length : newline + 1;
        continue;
      }
      if (source.startsWith("/*", cursor)) {
        const end = source.indexOf("*/", cursor + 2);
        cursor = end < 0 ? source.length : end + 2;
        continue;
      }
      if (current === "'" || current === '"') return "";
      return source.slice(cursor);
    }
    return "";
  };

  const breakLine = (extra = 0) => {
    out += `\n${"  ".repeat(Math.max(0, depth + extra))}`;
    atLineStart = true;
    lineHasContent = false;
  };

  const write = (text) => {
    if (!text) return;
    out += text;
    if (/\S/.test(text)) {
      lineHasContent = true;
      atLineStart = false;
    }
  };

  for (let index = 0; index < source.length;) {
    const current = source[index];
    if (current === "'" || current === '"') {
      let end = index + 1;
      while (end < source.length) {
        if (source[end] === current && source[end + 1] === current) { end += 2; continue; }
        if (source[end] === current) { end += 1; break; }
        end += 1;
      }
      const literal = source.slice(index, end);
      write(literal);
      if (literal.includes("\n")) {
        const tail = literal.slice(literal.lastIndexOf("\n") + 1);
        atLineStart = tail.trim() === "";
        lineHasContent = !atLineStart;
      }
      index = end;
      continue;
    }
    if (source.startsWith("--", index)) {
      const newline = source.indexOf("\n", index);
      const end = newline < 0 ? source.length : newline;
      write(source.slice(index, end));
      index = end;
      continue;
    }
    if (source.startsWith("/*", index)) {
      const end = source.indexOf("*/", index + 2);
      const stop = end < 0 ? source.length : end + 2;
      write(source.slice(index, stop));
      index = stop;
      continue;
    }
    if (current === "\n") {
      breakLine();
      index += 1;
      while (source[index] === " " || source[index] === "\t") index += 1;
      continue;
    }
    if (current === "(") {
      const rest = nextSignificant(index + 1);
      const isGroup = /^(?:SELECT|WITH|UNION|INTERSECT|EXCEPT)\b/i.test(rest) || rest.startsWith("(");
      write("(");
      if (isGroup) {
        groups.push(true);
        depth += 1;
        breakLine();
      } else groups.push(false);
      index += 1;
      continue;
    }
    if (current === ")") {
      if (groups.pop()) {
        depth = Math.max(0, depth - 1);
        if (lineHasContent) breakLine();
        write(")");
      } else write(")");
      index += 1;
      continue;
    }
    if (atLineStart && (current === " " || current === "\t")) { index += 1; continue; }
    const match = source.slice(index).match(clause);
    const atBoundary = index === 0 || /[\s(]/.test(source[index - 1]);
    if (match && atBoundary) {
      const keyword = match[0];
      if (lineHasContent) breakLine(/^(?:AND|OR)$/i.test(keyword) ? 1 : 0);
      write(keyword);
      index += keyword.length;
      continue;
    }
    write(current);
    index += 1;
  }

  return out.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
}

export function tokenizeSql(query = "") {
  const pattern = /'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*|\/\*[\s\S]*?\*\/|\?|\b(?:SELECT|FROM|JOIN|INNER|LEFT|RIGHT|OUTER|ON|WHERE|AND|OR|AS|ORDER|GROUP|BY|LIMIT|OFFSET|HAVING|IN|IS|NOT|NULL|ASC|DESC|UNION|ALL|WITH|INTERSECT|EXCEPT)\b/gi;
  const tokens = [];
  let cursor = 0;
  let parameter = 0;
  for (const match of query.matchAll(pattern)) {
    if (match.index > cursor) tokens.push({ type: "text", text: query.slice(cursor, match.index) });
    const type = match[0] === "?" ? "parameter" : /^["']/.test(match[0]) ? "literal" : /^(--|\/\*)/.test(match[0]) ? "comment" : "keyword";
    tokens.push({ type, text: match[0], start: match.index, parameter: type === "parameter" ? parameter++ : null });
    cursor = match.index + match[0].length;
  }
  if (cursor < query.length) tokens.push({ type: "text", text: query.slice(cursor) });
  return tokens;
}

export function sqlParameterBindings(query, parameters = []) {
  const labels = { "o.nome": "Operatore", "d.nome": "Deposito", "d.settore": "Settore", "a.pratica": "Pratica", "a.valido_fino": "Valido al" };
  const placeholders = tokenizeSql(query).filter((token) => token.type === "parameter");
  return parameters.map((value, index) => {
    const token = placeholders[index];
    const match = token && query.slice(0, token.start).match(/([\w.]+)\s*(>=|<=|<>|!=|=|>|<|LIKE)\s*$/i);
    const alias = token && query.slice(token.start).match(/^\?\s+AS\s+([A-Za-z_][\w]*)/i);
    const field = match?.[1]?.toLowerCase();
    const label = labels[field] || (alias ? sqlColumnLabel(alias[1]) : field ? sqlColumnLabel(field.split(".").pop()) : `Parametro ${index + 1}`);
    return { index, value, operator: match?.[2] || "", label };
  });
}

export function formatSqlValue(value, column = "") {
  if (value === null || value === undefined) return "—";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/valido|validità|valido al/i.test(column)) {
    const date = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?$/);
    if (date) return `${date[3]}/${date[2]}/${date[1]}, ${date[4]}:${date[5]}`;
  }
  return text;
}

export function formatSqlInstant(value) {
  return String(value ?? "").replace(
    /(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::\d{2})?/g,
    (_, year, month, day, hour, minute) => `${day}/${month}/${year}, ${hour}:${minute}`,
  );
}

const BRIEFING_RENEWAL = "Un rinnovo sovrapposto della stessa persona conta una sola volta. I due ruoli restano di due persone diverse.";
const BRIEFING_NO_OPERATORS = "Nessuna coppia SANITARIO e SICUREZZA soddisfa insieme squadra, abilitazione, permesso attivo, revoche e sospensioni.";
const BRIEFING_NO_TERMINALS = "Nessun terminale del varco è operativo con una finestra aperta e una chiave valida in quell'istante.";
const BRIEFING_CHANNEL = "Il canale del lettore del veicolo non è nell'archivio recuperato: i terminali restano tutti candidati.";
const BRIEFING_METHOD = "L'autorizzazione usa permessi, abilitazioni, squadra, sospensioni, revoche, terminale, finestra e chiave. Copie dei registri e accessi passati restano fonti storiche.";

function parseBriefingOperator(text) {
  const match = text.trim().match(/^(.+?) \(([^,]+), ([^,]+), (.+)\)$/);
  return match ? { name: match[1], role: match[2], code: match[3], squad: match[4] } : null;
}

function parseBriefingTerminal(text) {
  const match = text.trim().match(/^terminale ([^,]+), ([^,]+), chiave (.+)$/i);
  return match ? { id: match[1], channel: match[2], key: match[3] } : null;
}

/** Turn the recovered-archive briefing back into sections. Unknown prose stays a paragraph. */
export function structureSqlBriefing(answer) {
  if (typeof answer !== "string" || !answer.startsWith("Controllo alle ")) return null;
  const control = answer.match(/^Controllo alle ([^,]+), (.+?), varco ([^.]+)\./);
  if (!control) return null;

  const defaults = answer.match(/Parametri presi dalla missione perché la domanda non li indica: ([^.]+)\./)?.[1] || "";
  let operators = [];
  let renewal = "";
  const noOperators = answer.includes(BRIEFING_NO_OPERATORS) ? BRIEFING_NO_OPERATORS : "";
  if (!noOperators && answer.includes("Operatori autorizzati:")) {
    const found = answer.match(/Operatori autorizzati: (.+?)\. Un rinnovo sovrapposto della stessa persona conta una sola volta\. I due ruoli restano di due persone diverse\./);
    if (!found) return null;
    operators = found[1].split("; ").map(parseBriefingOperator);
    if (operators.some((person) => !person)) return null;
    renewal = BRIEFING_RENEWAL;
  }

  let terminals = [];
  const noTerminals = answer.includes(BRIEFING_NO_TERMINALS) ? BRIEFING_NO_TERMINALS : "";
  if (!noTerminals && /Terminali con finestra aperta e chiave valida:|(?:^|\. )Terminale /.test(answer)) {
    const many = answer.match(/Terminali con finestra aperta e chiave valida: (.+?)\./);
    if (many) {
      terminals = many[1].split("; ").map(parseBriefingTerminal);
      if (terminals.some((terminal) => !terminal)) return null;
    } else {
      const one = answer.match(/(?:^|\. )Terminale ([^,]+), ([^,]+), chiave ([^.]+)\./);
      if (!one) return null;
      terminals = [{ id: one[1], channel: one[2], key: one[3] }];
    }
  }

  let exclusions = [];
  if (answer.includes("Candidati esclusi:")) {
    const found = answer.match(/Candidati esclusi: (.+?)\.\s*(?:L'autorizzazione usa|$)/);
    if (!found) return null;
    exclusions = [];
    found[1].split(" | ").forEach((item) => {
      const split = item.indexOf(": ");
      if (split >= 0) {
        const reason = item.slice(split + 2).trim();
        exclusions.push({
          subject: item.slice(0, split).trim(),
          reasons: reason ? reason.split("; ").map((part) => part.trim()).filter(Boolean) : [],
        });
        return;
      }
      const reasons = item.split("; ").map((part) => part.trim()).filter(Boolean);
      if (exclusions.length && reasons.length) exclusions[exclusions.length - 1].reasons.push(...reasons);
      else exclusions.push({ subject: item.trim(), reasons: [] });
    });
  }

  return {
    instant: control[1],
    archive: control[2],
    gate: control[3],
    defaults,
    operators,
    noOperators,
    renewal,
    terminals,
    noTerminals,
    channelNote: answer.includes(BRIEFING_CHANNEL) ? BRIEFING_CHANNEL : "",
    exclusions,
    method: answer.includes(BRIEFING_METHOD) ? BRIEFING_METHOD : "",
  };
}

function parseSquadMember(text) {
  const match = String(text).trim().match(/^(.+?) \((.+)\)$/);
  if (!match) return null;
  const parts = match[2].split(", ").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const squad = parts.at(-1);
  const code = parts.at(-2);
  const roles = parts.slice(0, -2).join(", ").split(",").map((role) => role.trim()).filter(Boolean);
  if (!squad || !code || !roles.length) return null;
  return { name: match[1].trim(), roles, code, squad };
}

function parseExcludedMember(text) {
  const match = String(text).trim().match(/^(.+?) \((sospensione attiva|nessuna abilitazione valida), (.+)\)$/);
  return match ? { name: match[1].trim(), reason: match[2], squad: match[3].trim() } : null;
}

/** Turn the squad-members answer into people and exclusions. Unknown prose stays a paragraph. */
export function structureSqlMembers(answer) {
  if (typeof answer !== "string" || !answer.startsWith("Alle ")) return null;
  const head = answer.match(/^Alle ([^,]+), (.+?), varco ([^,]+), nelle squadre con entrambi i permessi validi\./);
  if (!head) return null;
  const defaults = answer.match(/Parametri presi dalla missione perché la domanda non li indica: ([^.]+)\./)?.[1] || "";
  const inherited = answer.match(/Parametri ripresi dal controllo precedente: ([^.]+)\./)?.[1] || "";
  const none = answer.match(/Nessuna persona è in squadra alle [^.]+\./)?.[0] || "";
  const listed = answer.match(/Persone in squadra alle [^,]+, con abilitazione valida e senza sospensione: (.+?)\./);
  if (!none && !listed) return null;
  const people = listed ? listed[1].split("; ").map(parseSquadMember) : [];
  if (people.some((person) => !person)) return null;
  let excluded = [];
  if (answer.includes("Nella squadra ma escluse:")) {
    const found = answer.match(/Nella squadra ma escluse: (.+)\.$/);
    if (!found) return null;
    excluded = found[1].split("; ").map(parseExcludedMember);
    if (excluded.some((person) => !person)) return null;
  }
  return { instant: head[1], archive: head[2], gate: head[3], defaults, inherited, people, none, excluded };
}

/** Operator and terminal rows share one wide table full of empty cells. Group them instead. */
export function groupAccessRows(columns, rows) {
  if (!Array.isArray(columns) || !Array.isArray(rows) || !rows.length || !columns.includes("tipo")) return null;
  const index = Object.fromEntries(columns.map((name, position) => [name, position]));
  const needed = ["tipo", "ruolo", "nome", "codice_px", "squadra", "terminale_id", "canale", "chiave"];
  if (!needed.every((name) => Object.prototype.hasOwnProperty.call(index, name))) return null;
  const operators = [];
  const terminals = [];
  for (const row of rows) {
    const kind = row[index.tipo];
    if (kind === "operatore") {
      operators.push({ role: row[index.ruolo], name: row[index.nome], code: row[index.codice_px], squad: row[index.squadra] });
    } else if (kind === "terminale") {
      terminals.push({ id: row[index.terminale_id], channel: row[index.canale], key: row[index.chiave] });
    } else return null;
  }
  return { operators, terminals };
}

