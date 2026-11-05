import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Clock3, KeyRound, Link2, LoaderCircle, RefreshCw, Search, ShieldCheck, X } from "lucide-react";

import { SourceChips } from "./FieldlinkSourcePreview";
import PageHeaderDetails from "./PageHeaderDetails";
import { layoutSchemaPaths } from "./schemaLayout";

const API = "/api/sql/giorno4/schema";
const number = (value) => Number(value || 0).toLocaleString("it-IT");
const ROLE_LABEL = { pk: "PK", fk: "FK", tempo: "tempo", valore: "valore" };

function columnHelp(column, tables) {
  if (column.role === "pk") return "Identifica questa riga in modo univoco; gli altri campi possono collegarsi a questo ID.";
  if (column.role === "fk") {
    const target = tables.find((item) => item.id === column.references);
    return `Riferimento a ${target?.name || column.references}: contiene lo stesso valore della chiave ${column.references}. Serve a risalire al record collegato.`;
  }
  if (column.role === "tempo") {
    if (column.name === "ts_a") return "Data e ora di inizio o dell’evento; il significato preciso è indicato accanto al campo.";
    if (column.name === "ts_b") return "Data e ora di fine dell’intervallo. Confrontala con ts_a per verificare la validità nel tempo.";
    return "Data e ora registrate nel campo; usale per ricostruire la cronologia.";
  }
  if (column.name.startsWith("v")) return `Valore descrittivo: ${column.label}. Il contenuto dipende dal record e non crea da solo un collegamento.`;
  if (column.name.startsWith("k")) return `Codice/identificativo: ${column.label}. Controlla i legami indicati nella mappa per sapere a quale tabella appartiene.`;
  return `${column.label} · tipo ${column.type || "non specificato"}.`;
}

function matches(table, query) {
  if (!query) return true;
  const columns = table.columns.map((column) => `${column.name} ${column.label}`).join(" ");
  return `${table.id} ${table.name} ${table.meaning} ${columns}`.toLocaleLowerCase("it-IT").includes(query);
}

export default function FieldlinkSchema({ documents = [], onOpen }) {
  const boardRef = useRef(null);
  const nodeRefs = useRef({});
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [focusGroups, setFocusGroups] = useState(() => new Set());
  const [selected, setSelected] = useState("");
  const [hovered, setHovered] = useState("");
  const [selectedLink, setSelectedLink] = useState("");
  const [paths, setPaths] = useState([]);
  const deferredQuery = query.trim().toLocaleLowerCase("it-IT");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(API, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("Schema non disponibile"); return response.json(); })
      .then((payload) => {
        if (controller.signal.aborted) return;
        setData(payload);
      })
      .catch((failure) => { if (failure.name !== "AbortError") setError("Impossibile leggere lo schema dell'archivio recuperato."); })
      .finally(() => { if (!controller.signal.aborted) { setLoading(false); setRefreshing(false); } });
    return () => controller.abort();
  }, [refreshKey]);

  const latestDay = Math.max(0, ...documents.map((doc) => doc.day || 0));
  const latestSources = documents.filter((doc) => doc.day === latestDay && /^G\d+-/.test(doc.id));
  const tables = data?.tables || [];
  const relations = data?.relations || [];
  const visibleIds = useMemo(() => new Set(tables.filter((table) => matches(table, deferredQuery)).map((table) => table.id)), [tables, deferredQuery]);
  const drawnIds = useMemo(() => new Set(tables.map((table) => table.id)), [tables]);
  const visibleRelations = useMemo(
    () => relations.filter((relation) => drawnIds.has(relation.from_table) && drawnIds.has(relation.to_table)),
    [relations, drawnIds],
  );
  const spotlight = hovered || selected;
  const shownRelations = visibleRelations;
  const linkCount = useMemo(() => {
    const counts = {};
    relations.forEach((relation) => {
      counts[relation.from_table] = (counts[relation.from_table] || 0) + 1;
      counts[relation.to_table] = (counts[relation.to_table] || 0) + 1;
    });
    return counts;
  }, [relations]);
  const focusIds = useMemo(() => {
    const ids = new Set();
    if (selectedLink && !hovered) {
      const link = relations.find((relation) => relation.id === selectedLink);
      if (link) { ids.add(link.from_table); ids.add(link.to_table); }
    } else if (spotlight) {
      ids.add(spotlight);
      relations.forEach((relation) => {
        if (relation.from_table === spotlight) ids.add(relation.to_table);
        if (relation.to_table === spotlight) ids.add(relation.from_table);
      });
    }
    return ids;
  }, [spotlight, hovered, selectedLink, relations]);

  useEffect(() => {
    if (selected && !drawnIds.has(selected)) setSelected("");
    if (selectedLink && !visibleRelations.some((relation) => relation.id === selectedLink)) setSelectedLink("");
  }, [drawnIds, selected, selectedLink, visibleRelations]);

  useEffect(() => {
    if (!selected && !selectedLink) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") { setSelected(""); setSelectedLink(""); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, selectedLink]);

  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return undefined;
    const measure = () => {
      const origin = board.getBoundingClientRect();
      const boxes = {};
      Object.entries(nodeRefs.current).forEach(([id, element]) => {
        if (!element || !drawnIds.has(id)) return;
        const rect = element.getBoundingClientRect();
        boxes[id] = { x: rect.left - origin.left, y: rect.top - origin.top, width: rect.width, height: rect.height };
      });
      const next = layoutSchemaPaths(boxes, shownRelations);
      setPaths((current) => (current.length === next.length && current.every((path, index) => path.d === next[index].d && path.id === next[index].id) ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(board);
    return () => observer.disconnect();
  }, [shownRelations, drawnIds, data]);

  const chooseTable = (id) => {
    setSelectedLink("");
    setSelected((current) => (current === id ? "" : id));
  };
  const chooseLink = (id) => {
    setSelected("");
    setSelectedLink((current) => (current === id ? "" : id));
  };
  const toggleGroup = (id) => {
    setSelected("");
    setSelectedLink("");
    setFocusGroups((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedTable = tables.find((table) => table.id === selected);
  const activeLink = relations.find((relation) => relation.id === selectedLink);
  const inspectorTable = selectedTable || (activeLink ? tables.find((table) => table.id === activeLink.from_table) : null);
  const incoming = inspectorTable ? relations.filter((relation) => relation.to_table === inspectorTable.id) : [];
  const outgoing = inspectorTable ? relations.filter((relation) => relation.from_table === inspectorTable.id) : [];

  return <div className="fl-schema-page" data-testid="fieldlink-schema">
    <PageHeaderDetails>
      <span className="fieldlink-header-caption"><Link2 size={13} />ARCHIVIO RECUPERATO · GIORNO 4</span>
      <div className="fl-db-status"><span><i />SCHEMA ATTIVO</span><span><ShieldCheck size={13} />SOLA LETTURA</span></div>
      <button type="button" className="fieldlink-header-action" disabled={refreshing} onClick={() => { setRefreshing(true); setRefreshKey((value) => value + 1); }} aria-label="Aggiorna lo schema"><RefreshCw size={14} className={refreshing ? "is-refreshing" : ""} /><span>{refreshing ? "Aggiornamento…" : "Aggiorna"}</span></button>
    </PageHeaderDetails>

    {latestDay > 0 && <div className="fl-schema-source-context"><span>Fonti disponibili · giorni 1–{latestDay}</span><SourceChips ids={latestSources.map((doc) => doc.id)} documents={documents} />{onOpen && <button type="button" className="fl-workspace-action" onClick={() => onOpen("archivio")}>Tutte le prove ({number(documents.length)})</button>}</div>}
    {error ? <div className="fl-db-error" role="alert">{error}<button type="button" onClick={() => setRefreshKey((value) => value + 1)}>Riprova</button></div> : (
      <section className={`fl-schema-board ${loading ? "is-loading" : ""}`} aria-label="Archivio">
        <div className="fl-schema-tools">
          <label className="fl-schema-search"><Search size={15} /><input value={query} onChange={(event) => { setQuery(event.target.value); setSelected(""); setSelectedLink(""); }} placeholder="Cerca tabella, campo o significato…" aria-label="Cerca nello schema" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Cancella ricerca"><X size={14} /></button>}</label>
          <div className="fl-schema-groups" role="group" aria-label="Gruppi dello schema">
            {(data?.groups || []).map((group) => (
              <button key={group.id} type="button" aria-pressed={focusGroups.has(group.id)} className={focusGroups.has(group.id) ? "is-on" : ""} onClick={() => toggleGroup(group.id)}>{group.label}</button>
            ))}
          </div>
        </div>

          <div className="fl-schema-map" ref={boardRef} onMouseLeave={() => setHovered("")}>
          {loading && <div className="fl-schema-loading" role="status"><LoaderCircle size={16} /> LETTURA SCHEMA…</div>}
          <svg className="fl-schema-wires" aria-hidden="true">
            <defs>
              <marker id="fl-schema-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                <path d="M1 1 L6 3.5 L1 6" />
              </marker>
            </defs>
            {paths.map((path) => {
              const active = path.from_table === spotlight || path.to_table === spotlight || path.id === selectedLink;
              const quiet = focusIds.size > 0 && !active;
              return <g key={path.id}>
                <path d={path.d} className="fl-schema-wire-hit" onClick={() => chooseLink(path.id)} />
                <path d={path.d} className={`fl-schema-wire ${active ? "is-active" : ""} ${quiet ? "is-quiet" : ""}`} markerEnd={active ? "url(#fl-schema-arrow)" : undefined} />
              </g>;
            })}
          </svg>
          <div className="fl-schema-lanes">
            {(data?.groups || []).map((group, groupIndex) => (
              <section key={group.id} className={`fl-schema-lane ${focusGroups.has(group.id) ? "is-focus" : ""}`} aria-label={group.label}>
                <header><span>0{groupIndex + 1}</span><strong>{group.label}</strong><em>{group.tables.length}</em></header>
                {group.tables.map((id) => tables.find((table) => table.id === id)).filter(Boolean).map((table, index) => {
                  const linked = focusIds.has(table.id);
                  const groupFocus = focusGroups.size > 0 && focusIds.size === 0;
                  const quiet = (focusIds.size > 0 && !linked) || (groupFocus && !focusGroups.has(table.group)) || (deferredQuery && focusIds.size === 0 && focusGroups.size === 0 && !visibleIds.has(table.id));
                  const foreignKeys = table.columns.filter((column) => column.role === "fk");
                  const links = linkCount[table.id] || 0;
                  return <button
                    key={table.id}
                    type="button"
                    ref={(element) => { if (element) nodeRefs.current[table.id] = element; else delete nodeRefs.current[table.id]; }}
                    className={`fl-schema-node ${selected === table.id ? "is-selected" : ""} ${linked && selected !== table.id ? "is-linked" : ""} ${groupFocus && focusGroups.has(table.group) ? "is-linked" : ""} ${deferredQuery && visibleIds.has(table.id) ? "is-match" : ""} ${quiet ? "is-rest" : ""}`}
                    style={{ "--node-index": groupIndex * 4 + index }}
                    aria-pressed={selected === table.id}
                    data-testid={`schema-node-${table.id}`}
                    onClick={() => chooseTable(table.id)}
                    onMouseEnter={() => setHovered(table.id)}
                  >
                    <span className="fl-schema-node-code">{table.id}<b>{number(table.count)}</b></span>
                    <strong>{table.name}</strong>
                    <span className="fl-schema-node-meaning">{table.meaning}</span>
                    <span className="fl-schema-fields">{foreignKeys.map((column) => <em key={column.name} className="is-fk">→ {column.label}</em>)}<b>{links === 1 ? "1 legame" : `${links} legami`}</b></span>
                  </button>;
                })}
              </section>
            ))}
          </div>
        </div>
        {!loading && deferredQuery && visibleIds.size === 0 && drawnIds.size > 0 && <div className="fl-schema-empty">Nessuna tabella corrisponde. Le card restano tutte visibili.</div>}
        <div className="fl-schema-legend"><span><KeyRound size={12} />PK</span><span><Link2 size={12} />FK · molti a uno</span><span><Clock3 size={12} />intervallo</span><span className="fl-schema-legend-note">Un clic segue i legami. Le altre tabelle restano visibili. Esc chiude la scheda.</span></div>
      </section>
    )}

    {inspectorTable && <aside className="fl-schema-inspector" aria-label={`Scheda ${inspectorTable.name}`}>
      <div className="fl-schema-inspector-head">
        <span><code>{inspectorTable.id}</code> {inspectorTable.name}</span>
        <button type="button" aria-label="Chiudi scheda" onClick={() => { setSelected(""); setSelectedLink(""); }}><X size={15} /></button>
      </div>
      <p>{inspectorTable.meaning}</p>
          {activeLink && <>
            <p className="fl-schema-inspector-link">Collegamento: <code>{activeLink.from_table}.{activeLink.from_column}</code> → <code>{activeLink.to_table}.{activeLink.to_column}</code> ({activeLink.to_name}). Trovate corrispondenze per {number(activeLink.matched)} valori distinti su {number(activeLink.distinct)} presenti nella tabella di partenza.</p>
          </>}
      <h4>Campi</h4>
      <ul>{inspectorTable.columns.map((column) => (
        <li key={column.name} className={`is-${column.role}`}>
              <div className="fl-schema-field-name"><code>{column.name}</code><small>{column.type || "campo"}</small></div>
              <span><b>{column.label}</b><small>{columnHelp(column, tables)}</small></span>
          <em>{column.role === "fk" ? `FK → ${tables.find((table) => table.id === column.references)?.name || column.references}` : ROLE_LABEL[column.role]}</em>
        </li>
      ))}</ul>
      {(outgoing.length > 0 || incoming.length > 0) && <>
        <h4>Legami</h4>
        <div className="fl-schema-inspector-links">
          {[...outgoing, ...incoming].map((relation) => <button key={relation.id} type="button" className={selectedLink === relation.id ? "is-on" : ""} onClick={() => chooseLink(relation.id)}>{relation.from_table}.{relation.from_column} → {relation.to_table}.{relation.to_column}<small>{number(relation.matched)}/{number(relation.distinct)}</small></button>)}
        </div>
      </>}
    </aside>}
  </div>;
}
