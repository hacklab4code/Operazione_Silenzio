import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowUpRight, Check, ChevronLeft, ChevronRight, Copy, Database, FileText, KeyRound, Link2, LoaderCircle, RefreshCw, Search, ShieldCheck, X } from "lucide-react";

import QueryResult from "./QueryResult";
import PageHeaderDetails from "./PageHeaderDetails";
import QueryFocusTrail from "./QueryFocusTrail";
const PAGE_SIZE = 25;
const API = "/api/sql/giorno4/database";
const number = (value) => Number(value || 0).toLocaleString("it-IT");
const COLUMN_LABELS = {
  id: "ID", operatore_id: "Operatore", deposito_id: "Deposito", nome: "Nome", settore: "Settore",
  pratica: "Pratica", codice: "Codice", stato: "Stato", valido_fino: "Valido fino",
};

function DatabaseNode({ table, index, selected, onSelect }) {
  const icon = table.name === "accessi" ? <Activity size={17} /> : <Database size={17} />;
  const descriptions = { operatori: "Anagrafica operatori", accessi: "Permessi e autorizzazioni", depositi: "Depositi e settori" };
  return <button type="button" className={`fl-db-node ${table.name === "accessi" ? "is-hub" : ""} ${selected ? "is-selected" : ""}`} style={{ "--node-index": index }} onClick={() => onSelect(table.name)} aria-pressed={selected}>
    <span className="fl-db-node-head"><span className="fl-db-node-icon">{icon}</span><span>{table.name}</span>{selected && <Check size={15} className="fl-db-node-check" />}</span>
    <span className="fl-db-node-description">{descriptions[table.name]}</span>
    <span className="fl-db-node-summary"><strong>{number(table.count)}</strong><span>record</span><small>{table.columns.length} campi</small></span>
    <span className="fl-db-node-columns">{table.columns.map((column) => {
      const foreignKey = table.name === "accessi" && ["operatore_id", "deposito_id"].includes(column.name);
      return <span key={column.name} className={`fl-db-column ${column.primary_key ? "is-primary" : ""} ${foreignKey ? "is-foreign" : ""}`}>
        <span className="fl-db-column-key" title={column.primary_key ? "Chiave primaria" : foreignKey ? "Chiave esterna" : undefined}>{column.primary_key ? <KeyRound size={12} /> : foreignKey ? <Link2 size={12} /> : <span className="fl-db-column-dot" />}</span>
        <code>{column.name}</code><span className="fl-db-column-type">{column.primary_key ? "PK" : foreignKey ? "FK" : column.type}</span>
      </span>;
    })}</span>
    <span className="fl-db-node-action">{selected ? <><span className="fl-db-selected-dot" />Tabella selezionata</> : <>Esplora record<ArrowUpRight size={13} /></>}</span>
  </button>;
}

function DatabaseRelation({ direction, column, label }) {
  return <div className={`fl-db-link fl-db-link-${direction}`} aria-label={label}>
    <span className="fl-db-link-label">{column}</span>
    <span className="fl-db-link-track" aria-hidden="true"><b>{direction === "left" ? "1" : "N"}</b><i /><b>{direction === "left" ? "N" : "1"}</b></span>
    <span className="fl-db-link-caption">uno a molti</span>
  </div>;
}

export default function FieldlinkDatabase({ queryContext, onReturn }) {
  const [table, setTable] = useState("accessi");
  const [query, setQuery] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);
  const [copyState, setCopyState] = useState("");
  const deferredQuery = useMemo(() => query.trim(), [query]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true); setError(""); setSelectedRow(null);
      const params = new URLSearchParams({ table, q: deferredQuery, offset: String(offset), limit: String(PAGE_SIZE) });
      fetch(`${API}?${params}`, { signal: controller.signal })
        .then((response) => { if (!response.ok) throw new Error("Database non disponibile"); return response.json(); })
        .then((payload) => { if (!controller.signal.aborted) setData(payload); })
        .catch((failure) => { if (failure.name !== "AbortError") setError("Impossibile leggere il database locale. Riprova tra poco."); })
        .finally(() => { if (!controller.signal.aborted) { setLoading(false); setRefreshing(false); } });
    }, query ? 180 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [table, deferredQuery, offset, refreshKey]);

  const chooseTable = (nextTable) => { setTable(nextTable); setOffset(0); setSelectedRow(null); };
  const copyText = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState(label);
      window.setTimeout(() => setCopyState(""), 1500);
    } catch { setCopyState("Copia non disponibile"); window.setTimeout(() => setCopyState(""), 1800); }
  };
  const tables = data?.tables || [];
  const currentTable = tables.find((item) => item.name === table);
  const pageEnd = Math.min(offset + PAGE_SIZE, data?.total || 0);

  return <div className={`fl-db-page ${queryContext ? "fl-query-focused" : ""}`} data-testid="fieldlink-database">
    <QueryFocusTrail query={queryContext} label="Esecuzione SQL collegata" onReturn={onReturn} showQuestion={false} />
    {queryContext !== undefined && <QueryResult query={queryContext} />}
    <PageHeaderDetails>
      <span className="fieldlink-header-caption"><Database size={13} />ARCHIVIO STRUTTURATO</span>
      <div className="fl-db-status"><span><i />COLLEGAMENTO ATTIVO</span><span><ShieldCheck size={13} />SOLA LETTURA</span></div>
      <button type="button" className="fieldlink-header-action" disabled={refreshing} onClick={() => { setRefreshing(true); setRefreshKey((value) => value + 1); }} aria-label="Aggiorna il database"><RefreshCw size={14} className={refreshing ? "is-refreshing" : ""} /><span>{refreshing ? "Aggiornamento…" : "Aggiorna"}</span></button>
    </PageHeaderDetails>

    {error ? <div className="fl-db-error" role="alert">{error}<button type="button" onClick={() => setRefreshKey((value) => value + 1)}>Riprova</button></div> : <>
      <section className={`fl-db-topology ${loading ? "is-loading" : ""}`} aria-label="Schema relazionale">
        <div className="fl-db-topology-title"><div><span className="fl-db-eyebrow">SCHEMA RELAZIONALE</span><h3>Struttura del database</h3><p>Seleziona una tabella per esplorare i record.</p></div><span className="fl-db-topology-meta"><Database size={13} />{tables.length || "—"} tabelle<span>·</span>{data?.relations?.length ?? "—"} relazioni</span></div>
        {tables.length ? <div className="fl-db-topology-grid">
          <DatabaseNode table={tables.find((item) => item.name === "operatori") || tables[0]} index={0} selected={table === "operatori"} onSelect={chooseTable} />
          <DatabaseRelation direction="left" column="operatore_id" label="Un operatore può avere più accessi. accessi.operatore_id si collega a operatori.id." />
          <DatabaseNode table={tables.find((item) => item.name === "accessi") || tables[0]} index={1} selected={table === "accessi"} onSelect={chooseTable} />
          <DatabaseRelation direction="right" column="deposito_id" label="Un deposito può avere più accessi. accessi.deposito_id si collega a depositi.id." />
          <DatabaseNode table={tables.find((item) => item.name === "depositi") || tables[0]} index={2} selected={table === "depositi"} onSelect={chooseTable} />
        </div> : <div className="fl-db-topology-skeleton"><i /><i /><i /></div>}
        <div className="fl-db-topology-legend"><span><KeyRound size={12} />PK · chiave primaria</span><span><Link2 size={12} />FK · chiave esterna</span><span className="fl-db-topology-selection"><Check size={12} />Selezionata: <strong>{table}</strong></span></div>
      </section>

      <section className="fl-db-records" aria-labelledby="fl-db-records-title">
        <div className="fl-db-records-head"><div><span className="fl-db-eyebrow">TABELLA SELEZIONATA</span><h3 id="fl-db-records-title">{table}<small>{number(currentTable?.count)} record totali</small></h3></div>
          <label className="fl-db-search"><Search size={15} /><input value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0); }} placeholder="Cerca nei campi…" aria-label="Cerca nei record" />{query && <button type="button" onClick={() => { setQuery(""); setOffset(0); }} aria-label="Cancella ricerca"><X size={14} /></button>}</label>
        </div>
        <div className="fl-db-table-wrap">
          {loading && <div className="fl-db-loading" role="status"><LoaderCircle size={16} /> LETTURA TABELLA…</div>}
          <table className={loading ? "is-loading" : ""}>
            <thead><tr>{(currentTable?.columns || []).map((column) => <th key={column.name}>{COLUMN_LABELS[column.name] || column.name.replaceAll("_", " ")}</th>)}</tr></thead>
            <tbody>{(data?.rows || []).map((row, rowIndex) => <tr key={row.id ?? rowIndex} tabIndex={0} aria-selected={selectedRow?.id === row.id} className={selectedRow?.id === row.id ? "is-selected" : ""} onClick={() => setSelectedRow(row)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedRow(row); } }}>
              {(currentTable?.columns || []).map((column) => <td key={column.name} className={column.name === "stato" ? `fl-db-state ${String(row[column.name]).toLowerCase()}` : ""}>{String(row[column.name] ?? "—")}</td>)}
            </tr>)}</tbody>
          </table>
          {!loading && !data?.rows?.length && <div className="fl-db-empty"><Search size={17} /><span>Nessun record corrisponde alla ricerca.</span></div>}
        </div>
        <footer className="fl-db-pagination"><span>{data?.total ? `${number(offset + 1)}–${number(pageEnd)} di ${number(data.total)} record` : "0 record"}{query && ` · filtro “${query}”`}</span><div><button type="button" aria-label="Pagina precedente" disabled={offset === 0 || loading} onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}><ChevronLeft size={15} /></button><button type="button" aria-label="Pagina successiva" disabled={pageEnd >= (data?.total || 0) || loading} onClick={() => setOffset((value) => value + PAGE_SIZE)}><ChevronRight size={15} /></button></div></footer>
      </section>

      {selectedRow && <aside className="fl-db-inspector" aria-label="Record selezionato"><div className="fl-db-inspector-head"><span><FileText size={14} /> RECORD #{selectedRow.id}</span><button type="button" aria-label="Chiudi record" onClick={() => setSelectedRow(null)}><X size={15} /></button></div><dl>{(currentTable?.columns || []).map((column) => <div key={column.name}><dt>{COLUMN_LABELS[column.name] || column.name}</dt><dd>{String(selectedRow[column.name] ?? "—")}</dd></div>)}</dl><button className="fl-db-copy" type="button" onClick={() => copyText(JSON.stringify(selectedRow, null, 2), "Record copiato")}><Copy size={13} />{copyState || "Copia record JSON"}</button></aside>}
      <div className="fl-db-footnote"><ShieldCheck size={13} />Database locale · accessi.sqlite · apertura in sola lettura <span>{copyState && !selectedRow ? copyState : ""}</span></div>
    </>}
  </div>;
}
