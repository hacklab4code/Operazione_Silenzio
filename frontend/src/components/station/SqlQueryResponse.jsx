import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Ban, Check, ChevronDown, Clock3, Copy, Database, DoorOpen, FolderArchive, HeartPulse, Info, Radio, Search, Shield, ShieldAlert, ShieldCheck, ShieldX, UserRound, UsersRound } from "lucide-react";
import { formatSqlInstant, formatSqlValue, groupAccessRows, layoutSql, parseSqlToolResponse, sqlColumnLabel, sqlParameterBindings, structureSqlBriefing, structureSqlMembers, tokenizeSql } from "./sqlResponse";
import ModelResponseContent from "./ModelResponseContent";
import "./sql-query.css";

function accessHeadline(operators, terminals, briefing) {
  if (!operators.length && !terminals.length) {
    return briefing.noOperators || briefing.noTerminals ? "Nessuna autorizzazione valida per questo varco, in quell'istante." : "";
  }
  const parts = [];
  if (operators.length) parts.push(`${operators.length} ${operators.length === 1 ? "operatore autorizzato" : "operatori autorizzati"}`);
  if (terminals.length) parts.push(`${terminals.length} ${terminals.length === 1 ? "terminale candidato" : "terminali candidati"}`);
  return parts.join(" · ");
}

function missionDefaultNote(defaults) {
  if (!defaults) return "";
  const labels = defaults.split(", ").map((item) => item.trim().split(/\s+/)[0]).filter(Boolean);
  return labels.length ? `Parametri dalla missione, perché la domanda non li indica: ${labels.join(", ")}.` : "";
}

function memberRoles(value) {
  return (Array.isArray(value) ? value : String(value || "").split(",")).map((role) => role.trim()).filter(Boolean);
}

function roleTone(roles) {
  const names = memberRoles(roles).map((role) => role.toUpperCase());
  const sanitario = names.includes("SANITARIO");
  const sicurezza = names.includes("SICUREZZA");
  if (sanitario && sicurezza) return "is-both";
  if (sanitario) return "is-sanitario";
  if (sicurezza) return "is-sicurezza";
  return "";
}


function RoleMarks({ roles, fallback = "Operatore" }) {
  const list = memberRoles(roles);
  if (!list.length) return <span className="sql-access-kicker">{fallback}</span>;
  return <span className="sql-member-roles">{list.map((role) => {
    const key = role.toUpperCase();
    const Icon = key === "SANITARIO" ? HeartPulse : key === "SICUREZZA" ? Shield : UserRound;
    const tone = key === "SANITARIO" ? "sanitario" : key === "SICUREZZA" ? "sicurezza" : "plain";
    return <span key={role} className={`sql-role sql-role-${tone}`}><Icon size={12} aria-hidden="true" />{role}</span>;
  })}</span>;
}

function AccessGroup({ title, icon: Icon, people = [], terminals = [], empty = "" }) {
  const count = people.length + terminals.length;
  if (!count && !empty) return null;
  return <section className="sql-access" aria-label={title}>
    <h3><span className="sql-heading-label">{Icon && <Icon size={13} aria-hidden="true" />}{title}</span>{count > 0 && <span>{count}</span>}</h3>
    {count === 0 && <p className="sql-briefing-note">{empty}</p>}
    {people.length > 0 && <div className="sql-access-cards">{people.map((person, index) => <article className={`sql-access-card sql-member ${roleTone(person.roles || person.role)}`} key={`${person.role || person.roles}-${person.code}-${index}`}>
      <RoleMarks roles={person.roles || person.role} />
      <strong>{formatSqlValue(person.name)}</strong>
      <dl className="sql-access-fields">
        <div><dt>Codice</dt><dd className="sql-code">{formatSqlValue(person.code)}</dd></div>
        <div><dt>Squadra</dt><dd className="sql-squad">{formatSqlValue(person.squad)}</dd></div>
      </dl>
    </article>)}</div>}
    {terminals.length > 0 && <div className="sql-access-cards">{terminals.map((terminal, index) => <article className="sql-access-card" key={`${terminal.id}-${terminal.key}-${index}`}>
      <span className="sql-access-kicker"><Radio size={12} aria-hidden="true" />Terminale</span>
      <strong>{formatSqlValue(terminal.id)}</strong>
      <dl className="sql-access-fields">
        <div><dt>Canale</dt><dd>{formatSqlValue(terminal.channel)}</dd></div>
        <div><dt>Chiave</dt><dd>{formatSqlValue(terminal.key)}</dd></div>
      </dl>
    </article>)}</div>}
  </section>;
}

function SqlBriefing({ briefing, access }) {
  const operators = access ? access.operators : briefing.operators;
  const terminals = access ? access.terminals : briefing.terminals;
  const headline = accessHeadline(operators, terminals, briefing);
  const defaults = missionDefaultNote(briefing.defaults);
  return <div className="sql-briefing" data-testid="sql-briefing">
    {headline && <p className="sql-briefing-outcome">{headline}</p>}
    <div className="sql-briefing-context">
      <span><small><Clock3 size={11} aria-hidden="true" />Istante</small><strong>{formatSqlInstant(briefing.instant)}</strong></span>
      <span><small><FolderArchive size={11} aria-hidden="true" />Archivio</small><strong>{briefing.archive}</strong></span>
      <span><small><DoorOpen size={11} aria-hidden="true" />Varco</small><strong>{briefing.gate}</strong></span>
    </div>
    {defaults && <p className="sql-briefing-note">{defaults}</p>}
    <AccessGroup title="Operatori autorizzati" icon={ShieldCheck} people={operators} empty={briefing.noOperators} />
    {operators.length > 0 && briefing.renewal && <p className="sql-briefing-note">{briefing.renewal}</p>}
    <AccessGroup title="Terminali con finestra e chiave valida" icon={DoorOpen} terminals={terminals} empty={briefing.noTerminals} />
    {briefing.channelNote && <p className="sql-briefing-note">{briefing.channelNote}</p>}
    {briefing.exclusions.length > 0 && <section className="sql-exclusions" aria-label="Candidati esclusi">
      <h3><span className="sql-heading-label"><ShieldAlert size={13} aria-hidden="true" />Candidati esclusi</span><span>{briefing.exclusions.length}</span></h3>
      <ul>{briefing.exclusions.map((item, index) => <li className="sql-exclusion" key={`${item.subject}-${index}`}>
        <strong>{item.subject}</strong>
        <span>{item.reasons.map((reason, reasonIndex) => <span key={`${reason}-${reasonIndex}`}>{formatSqlInstant(reason)}</span>)}</span>
      </li>)}</ul>
    </section>}
    {briefing.method && <p className="sql-briefing-method">{briefing.method}</p>}
  </div>;
}

function SqlMembers({ members }) {
  const count = members.people.length;
  const inherited = members.inherited ? missionDefaultNote(members.inherited).replace("Parametri dalla missione, perché la domanda non li indica", "Parametri ripresi dal controllo precedente") : "";
  const defaults = missionDefaultNote(members.defaults);
  return <div className="sql-briefing sql-members" data-testid="sql-members">
    <p className="sql-briefing-outcome"><UsersRound size={16} aria-hidden="true" />{count ? `${count} ${count === 1 ? "persona in squadra" : "persone in squadra"}` : "Nessuna persona in squadra"}</p>
    <div className="sql-briefing-context">
      <span><small><Clock3 size={11} aria-hidden="true" />Istante</small><strong>{formatSqlInstant(members.instant)}</strong></span>
      <span><small><FolderArchive size={11} aria-hidden="true" />Archivio</small><strong>{members.archive}</strong></span>
      <span><small><DoorOpen size={11} aria-hidden="true" />Varco</small><strong>{members.gate}</strong></span>
    </div>
    <p className="sql-briefing-note"><ShieldCheck size={13} aria-hidden="true" />Solo le squadre con permesso sanitario e permesso sicurezza entrambi validi.</p>
    {defaults && <p className="sql-briefing-note"><Info size={13} aria-hidden="true" />{defaults}</p>}
    {inherited && <p className="sql-briefing-note"><Info size={13} aria-hidden="true" />{inherited}</p>}
    {count === 0 && <p className="sql-briefing-note">{members.none}</p>}
    <AccessGroup title="In squadra, abilitazione valida" icon={ShieldCheck} people={members.people} />
    {members.excluded.length > 0 && <section className="sql-exclusions" aria-label="Nella squadra ma escluse">
      <h3><span className="sql-heading-label"><ShieldAlert size={13} aria-hidden="true" />Nella squadra, ma escluse</span><span>{members.excluded.length}</span></h3>
      <ul>{members.excluded.map((item) => {
        const suspended = item.reason === "sospensione attiva";
        const Icon = suspended ? Ban : ShieldX;
        return <li className={`sql-exclusion ${suspended ? "is-suspended" : "is-unqualified"}`} key={`${item.name}-${item.squad}`}>
          <strong>{item.name}</strong>
          <span><em className="sql-reason"><Icon size={12} aria-hidden="true" />{item.reason}</em><span>{item.squad}</span></span>
        </li>;
      })}</ul>
    </section>}
  </div>;
}

const AUTHORIZATION_FIELDS = [
  ["persona", "Persona"],
  ["deposito", "Deposito"],
  ["settore", "Settore"],
  ["pratica", "Pratica"],
];

function MissingAuthorizationForm({ known = {}, missing = [], onAsk, disabled = false }) {
  const [values, setValues] = useState(() => Object.fromEntries(AUTHORIZATION_FIELDS.map(([key]) => [key, known[key] || ""])));
  const [error, setError] = useState("");
  const ready = AUTHORIZATION_FIELDS.every(([key]) => values[key].trim());
  const submit = (event) => {
    event.preventDefault();
    if (!ready || disabled || !onAsk) {
      setError("Compila persona, deposito, settore e pratica.");
      return;
    }
    const [persona, deposito, settore, pratica] = AUTHORIZATION_FIELDS.map(([key]) => values[key].trim().replace(/\s+/g, " "));
    onAsk(`Qual è il codice di autorizzazione di ${persona} per il deposito ${deposito}, settore ${settore}, pratica ${pratica}?`);
  };
  return <form className="sql-missing" onSubmit={submit} aria-label="Dati per l'autorizzazione">
    <p className="sql-query-answer">Per cercare l’autorizzazione compila i dati mancanti.</p>
    <div className="sql-missing-grid">
      {AUTHORIZATION_FIELDS.map(([key, label]) => {
        const needed = missing.includes(key);
        return <label key={key} className={needed ? "is-needed" : ""}>
          <span>{label}</span>
          <input name={key} value={values[key]} placeholder={needed ? "Da inserire" : ""} aria-required={needed || undefined} autoComplete="off" disabled={disabled} onChange={(event) => { setError(""); setValues((current) => ({ ...current, [key]: event.target.value })); }} />
        </label>;
      })}
    </div>
    {error && <p className="sql-missing-error" role="alert">{error}</p>}
    <button type="submit" disabled={disabled || !ready}>Cerca nel database</button>
  </form>;
}

export default function SqlQueryResponse({ text, onOpen, onAsk, variant = "chat", groqSaturated = false, pending = false, onOpenSource, onOpenTimeline, onOpenDatabase }) {
  const parsed = parseSqlToolResponse(text);
  const [activeParameter, setActiveParameter] = useState(null);
  const [detailsOpen, setDetailsOpen] = useState(variant === "chat");
  const [copyStatus, setCopyStatus] = useState("");
  const copyTimer = useRef(null);
  const sqlRef = useRef(null);
  useEffect(() => () => window.clearTimeout(copyTimer.current), []);
  if (!parsed) return null;
  const rows = parsed.rows?.righe;
  const columns = parsed.rows?.colonne || [];
  const single = rows?.length === 1 ? rows[0] : null;
  const field = (name) => single?.[columns.indexOf(name)];
  const code = field("codice");
  const hasCode = code !== null && code !== undefined && code !== "";
  const isAggregate = Boolean(single && columns.length === 1 && /^\s*(?:SELECT\s+)?(?:COUNT|SUM|AVG|MIN|MAX)\s*\(/i.test(parsed.query));
  const state = field("stato");
  const bindings = sqlParameterBindings(parsed.query, parsed.parameters || []);
  const formattedQuery = layoutSql(parsed.query);
  const tokens = tokenizeSql(formattedQuery);
  const renderQuery = () => <pre ref={sqlRef} aria-label="Query SQL"><code>{tokens.map((token, index) => token.type === "parameter" ? <button type="button" key={index} data-parameter={token.parameter} className={`sql-query-parameter ${activeParameter === token.parameter ? "is-selected" : ""}`} onClick={() => setActiveParameter(token.parameter)} aria-pressed={activeParameter === token.parameter} aria-label={`Parametro ${token.parameter + 1}: ${bindings[token.parameter]?.label || "valore"}`} title={bindings[token.parameter] ? `${bindings[token.parameter].label}: ${formatSqlValue(bindings[token.parameter].value)}` : `Parametro ${token.parameter + 1}`}>?</button> : <span key={index} className={`sql-token-${token.type}`}>{token.text}</span>)}</code></pre>;
  const count = parsed.fields ? "Dati mancanti" : isAggregate ? "1 valore" : rows ? `${rows.length} ${rows.length === 1 ? "riga restituita" : "righe restituite"}` : "Risposta database";
  const briefing = structureSqlBriefing(parsed.answer);
  const members = briefing ? null : structureSqlMembers(parsed.answer);
  const access = rows?.length ? groupAccessRows(columns, rows) : null;
  const copy = async (value, label) => {
    window.clearTimeout(copyTimer.current);
    try { await navigator.clipboard.writeText(String(value)); setCopyStatus(label); }
    catch { setCopyStatus("Copia non disponibile"); }
    copyTimer.current = window.setTimeout(() => setCopyStatus(""), 2000);
  };
  const focusParameter = (index) => {
    setActiveParameter(index);
    setDetailsOpen(true);
    window.requestAnimationFrame(() => sqlRef.current?.querySelector(`[data-parameter="${index}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
  };
  const redundantAnswer = hasCode && parsed.answer === `Il codice di autorizzazione è ${code}. Il permesso è ${state} fino al ${field("valido_fino")}.`;
  const highlightColumns = hasCode ? ["codice", "stato", "valido_fino"] : [];
  return <section className={`sql-query sql-query--${variant}`} data-testid="sql-tool-response" aria-label="Risultato della query">
    <header className="sql-query-header"><span><Database size={14} aria-hidden="true" />VERIFICA DATABASE</span><span className="sql-query-count">{count}</span></header>
    {variant === "database" && parsed.query && <div className="sql-query-executed"><div className="sql-query-section-heading"><h4>Query eseguita</h4><button type="button" className="sql-query-copy" onClick={() => copy(formattedQuery, "SQL copiato")}><Copy size={13} />{copyStatus === "SQL copiato" ? "Copiato" : "Copia SQL"}</button></div>{renderQuery()}</div>}
    <div className="sql-query-outcome" aria-label="Risposta">
      {briefing ? <SqlBriefing briefing={briefing} access={access} /> : members ? <SqlMembers members={members} /> : <>
      {hasCode && <div className="sql-query-highlight">
        <div><span className="sql-query-label">Codice di autorizzazione</span><div className="sql-query-code"><strong>{String(code)}</strong><button type="button" onClick={() => copy(code, "Codice copiato")} aria-label="Copia codice di autorizzazione" title="Copia codice">{copyStatus === "Codice copiato" ? <Check size={16} /> : <Copy size={16} />}</button></div></div>
        <div className="sql-query-validity">{state != null && <span className={`sql-query-state ${String(state).toLowerCase() === "attivo" ? "is-active" : ""}`}>{String(state).toLowerCase() === "attivo" && <Check size={13} />} {String(state)}</span>}{field("valido_fino") != null && <span><small>Valido fino</small><strong>{formatSqlValue(field("valido_fino"), "valido_fino")}</strong></span>}</div>
      </div>}
      {parsed.fields ? <MissingAuthorizationForm known={parsed.fields.known} missing={parsed.fields.missing} onAsk={onAsk} disabled={!onAsk} /> : parsed.answer && !redundantAnswer && <div className="sql-query-report"><ModelResponseContent text={parsed.answer} pending={pending} onOpenSource={onOpenSource} onOpenTimeline={onOpenTimeline} onOpenDatabase={onOpenDatabase} /></div>}
      {rows?.length === 0 && !parsed.answer && <p className="sql-query-empty"><Search size={17} />Nessun record corrisponde a tutti i criteri indicati.</p>}
      </>}
    </div>
    {!briefing && !members && access && <div className="sql-access-wrap"><AccessGroup title="Operatori autorizzati" icon={ShieldCheck} people={access.operators} /><AccessGroup title="Terminali con finestra e chiave valida" icon={DoorOpen} terminals={access.terminals} /></div>}
    {!briefing && !members && !access && single && <dl className={`sql-query-record${isAggregate ? " sql-query-record--metric" : ""}`} aria-label="Risultato restituito">{columns.map((column, index) => highlightColumns.includes(column) ? null : <div key={column}><dt>{sqlColumnLabel(column)}</dt><dd title={String(single[index] ?? "")}>{formatSqlValue(single[index], column)}</dd></div>)}</dl>}
    {!briefing && !members && !access && rows?.length > 1 && <div className={`sql-query-table${rows.length > 8 ? " is-tall" : ""}`} tabIndex={0} role="region" aria-label="Record restituiti"><table><thead><tr>{columns.map((column) => <th key={column} scope="col">{sqlColumnLabel(column)}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{columns.map((column, cell) => <td key={column} className={column === "abilitazione" ? roleTone(row[cell]) : undefined}>{formatSqlValue(row[cell], column)}</td>)}</tr>)}</tbody></table></div>}

    {(parsed.query || parsed.parametersRaw || parsed.rowsRaw) && <details className="sql-query-details" open={detailsOpen} onToggle={(event) => setDetailsOpen(event.currentTarget.open)}>
      <summary><span>{variant === "database" ? "Dettagli parametri" : "Dettagli query"}</span><span className="sql-query-details-hint"><ChevronDown size={15} aria-hidden="true" /></span></summary>
      <div className="sql-query-technical">
        {bindings.length > 0 && <section className="sql-query-criteria" aria-label="Criteri di ricerca"><div className="sql-query-section-heading"><h4>Filtri applicati</h4></div><div className="sql-query-filters">{bindings.map((binding) => <button type="button" key={binding.index} className={activeParameter === binding.index ? "is-selected" : ""} aria-pressed={activeParameter === binding.index} onClick={() => focusParameter(binding.index)} title={`Parametro ${binding.index + 1}: ${binding.label}`}><span>{binding.label}<small>{binding.operator}</small></span><strong>{formatSqlValue(binding.value, binding.label)}</strong></button>)}</div></section>}
        {parsed.query && variant !== "database" && <><div className="sql-query-section-heading"><h4>Query eseguita</h4><button type="button" className="sql-query-copy" onClick={() => copy(formattedQuery, "SQL copiato")}><Copy size={13} />{copyStatus === "SQL copiato" ? "Copiato" : "Copia SQL"}</button></div>{renderQuery()}</>}
        {redundantAnswer && <div><h4>Risposta originale</h4><ModelResponseContent text={parsed.answer} onOpenSource={onOpenSource} onOpenTimeline={onOpenTimeline} onOpenDatabase={onOpenDatabase} /></div>}
        {!parsed.parameters && parsed.parametersRaw && <div><h4>Parametri originali</h4><pre>{parsed.parametersRaw}</pre></div>}
        {!parsed.rows && parsed.rowsRaw && <div><h4>Risultati originali</h4><pre>{parsed.rowsRaw}</pre></div>}
      </div>
    </details>}
    <footer className="sql-query-footer">{variant === "database" && <span className={groqSaturated ? "is-groq-saturated" : ""} title={groqSaturated ? "Quota Groq esaurita: cambia la chiave API." : undefined} role={groqSaturated ? "status" : undefined}><Database size={12} aria-hidden="true" />{groqSaturated && <strong>Quota Groq esaurita · </strong>}{parsed.source.replace("apertura in sola lettura", "sola lettura") || "accessi.sqlite · sola lettura"}</span>}{onOpen && <button type="button" onClick={() => onOpen("database")}>Apri nel Database<ArrowUpRight size={14} /></button>}</footer>
    <span className="sql-query-feedback" role="status" aria-live="polite">{copyStatus}</span>
  </section>;
}
