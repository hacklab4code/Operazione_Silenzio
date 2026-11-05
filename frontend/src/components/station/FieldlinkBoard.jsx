import PageHeaderDetails from "./PageHeaderDetails";
import { useDeferredValue, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, ChevronDown, FileText, Pin, Radio, RefreshCw, Search, X } from "lucide-react";
import { formatFieldlinkDate, useFieldlinkData } from "./FieldlinkData";
import ModelResponseRenderer from "./ModelResponseRenderer";
import { SourceChips } from "./FieldlinkSourcePreview";
import { normalizeSearch } from "./ragModel";
import "./fieldlink-board.css";

const PAGE_SIZE = 16;
const PIN_KEY = "fieldlink.board.pins.v1";
const count = (n) => Number(n || 0).toLocaleString("it-IT");
function readPins() {
  try { const value = JSON.parse(window.localStorage.getItem(PIN_KEY) || "[]"); return Array.isArray(value) ? value.filter((id) => typeof id === "string") : []; } catch { return []; }
}
function logDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
}

export default function FieldlinkBoard() {
  const { documents, radio_logs: radioLogs, archive, board, generated_at: generatedAt, loading, error, refreshing, refresh } = useFieldlinkData();
  const [view, setView] = useState("sources");
  const [query, setQuery] = useState("");
  const [day, setDay] = useState("latest");
  const [type, setType] = useState("all");
  const [respondent, setRespondent] = useState("all");
  const [date, setDate] = useState("all");
  const [sort, setSort] = useState("latest");
  const [onlyPinned, setOnlyPinned] = useState(false);
  const [pins, setPins] = useState(readPins);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState(new Set());
  const search = useDeferredValue(normalizeSearch(query).trim());
  const items = useMemo(() => (board?.items || []).map((item) => ({ ...item,
    searchText: normalizeSearch([item.source_id, item.quote, item.people, item.places, item.times, item.type, item.reliability].join(" ")),
  })), [board]);
  const pinSet = useMemo(() => new Set(pins), [pins]);
  const days = archive?.by_day || [];
  const latestDay = archive?.latest_day || Math.max(0, ...items.map((item) => item.day || 0));
  const types = useMemo(() => [...new Set(items.map((item) => item.type).filter(Boolean))].sort(), [items]);
  const dates = useMemo(() => [...new Set(radioLogs.map((log) => logDate(log.created_at)).filter(Boolean))].sort().reverse(), [radioLogs]);
  const filtered = useMemo(() => {
    const words = search.split(/\s+/).filter(Boolean);
    if (view === "sources") return items.filter((item) =>
      (day === "all" || Number(item.day) === Number(day === "latest" ? latestDay : day))
      && (type === "all" || item.type === type) && (!onlyPinned || pinSet.has(item.key))
      && words.every((word) => item.searchText.includes(word)))
      .sort((a, b) => sort === "oldest" ? a.day - b.day || a.source_id.localeCompare(b.source_id, "it", { numeric: true })
        : sort === "pinned" ? Number(pinSet.has(b.key)) - Number(pinSet.has(a.key)) || b.day - a.day
        : b.day - a.day || a.source_id.localeCompare(b.source_id, "it", { numeric: true }));
    return radioLogs.filter((log) => (respondent === "all" || log.resolved_respondent_mode === respondent)
      && (date === "all" || logDate(log.created_at) === date)
      && words.every((word) => normalizeSearch([log.question, log.answer, ...(log.source_ids || [])].join(" ")).includes(word)))
      .sort((a, b) => sort === "oldest" ? new Date(a.created_at) - new Date(b.created_at) : new Date(b.created_at) - new Date(a.created_at));
  }, [view, items, day, latestDay, type, onlyPinned, pinSet, search, sort, radioLogs, respondent, date]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const change = (setter) => (event) => { setter(event.target.value); setPage(0); };
  const reset = () => { setQuery(""); setDay("all"); setType("all"); setRespondent("all"); setDate("all"); setOnlyPinned(false); setSort("latest"); setPage(0); };
  const togglePin = (key) => {
    setPins((current) => { const next = current.includes(key) ? current.filter((id) => id !== key) : [...current, key]; try { window.localStorage.setItem(PIN_KEY, JSON.stringify(next)); } catch { /* Pins stay available for this session. */ } return next; });
  };
  const toggleOpen = (id) => setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  return <section className="fieldlink-board fl-board-workspace" data-testid="fieldlink-board" aria-busy={loading}>
    <PageHeaderDetails>
      <span className="fieldlink-header-caption"><Pin size={13} />FONTI E COMUNICAZIONI</span>
      <button type="button" className="fieldlink-header-action" onClick={refresh} disabled={refreshing}><RefreshCw size={14} className={refreshing ? "fl-is-refreshing" : ""} />{refreshing ? "Aggiornamento…" : "Aggiorna"}</button>
    </PageHeaderDetails>
    <div className="fl-board-update"><BookOpen size={18} /><div><strong>{loading ? "Lettura dell’archivio…" : archive?.available ? `${count(archive.total)} documenti disponibili` : "Archivio non disponibile"}</strong><p>{archive?.latest_import?.verified && Number(archive.latest_import.day) === latestDay ? `${count(archive.latest_import.count)} nuovi imprevisti del giorno ${archive.latest_import.day}. ` : ""}{archive?.latest_day ? `Raccolta fino al giorno ${archive.latest_day}. ` : ""}{board ? `${count(board.total)} estratti da ${count(board.covered_documents)} fonti di indagine.` : "Collegamento ai dati della missione in corso."}</p></div></div>
    {error && <p className="fieldlink-data-message is-error" role="alert">{error} {generatedAt && "Sono mostrati gli ultimi dati ricevuti."}</p>}
    <div className="fl-board-views" role="group" aria-label="Contenuto della bacheca">
      <button type="button" aria-pressed={view === "sources"} onClick={() => { setView("sources"); setPage(0); }}><FileText size={15} />Estratti delle fonti<span>{loading ? "—" : count(items.length)}</span></button>
      <button type="button" aria-pressed={view === "radio"} onClick={() => { setView("radio"); setPage(0); }}><Radio size={15} />Comunicazioni<span>{loading ? "—" : count(radioLogs.length)}</span></button>
    </div>
    <div className="fl-board-toolbar">
      <label className="fl-board-search"><Search size={16} /><span className="fieldlink-sr-only">Cerca nella bacheca</span><input type="search" placeholder={view === "sources" ? "Cerca nome, luogo, codice o contenuto…" : "Cerca domande, risposte o fonti…"} value={query} onChange={change(setQuery)} /></label>
      <div className="fl-board-filters">
        {view === "sources" ? <><label>Raccolta<select value={day} onChange={change(setDay)}><option value="latest">Ultimo giorno{latestDay ? ` · G${latestDay}` : ""}</option><option value="all">Tutti i giorni</option>{days.map((item) => <option key={item.day} value={String(item.day)}>Giorno {item.day}</option>)}</select></label><label>Tipo di estratto<select value={type} onChange={change(setType)}><option value="all">Tutti i tipi</option>{types.map((value) => <option key={value} value={value}>{value.charAt(0).toUpperCase() + value.slice(1)}</option>)}</select></label></>
          : <><label>Interlocutore<select value={respondent} onChange={change(setRespondent)}><option value="all">Tutti</option><option value="marco">A.N.I.M.A.</option><option value="team">Team investigativo</option></select></label><label>Data comunicazione<select value={date} onChange={change(setDate)}><option value="all">Tutte le date</option>{dates.map((value) => <option key={value} value={value}>{new Date(`${value}T12:00:00`).toLocaleDateString("it-IT")}</option>)}</select></label></>}
        <label>Ordine<select value={sort} onChange={change(setSort)}><option value="latest">Più recenti</option><option value="oldest">Meno recenti</option>{view === "sources" && <option value="pinned">In evidenza prima</option>}</select></label>
      </div>
    </div>
    <div className="fl-board-results"><p role="status" aria-live="polite">{loading ? "Caricamento dati…" : `${count(filtered.length)} ${view === "sources" ? (filtered.length === 1 ? "estratto" : "estratti") : (filtered.length === 1 ? "comunicazione" : "comunicazioni")}`}{!loading && filtered.length > 0 && <span> · {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)} visibili</span>}</p><div>{view === "sources" && <button className={`fl-workspace-action ${onlyPinned ? "is-active" : ""}`} type="button" aria-pressed={onlyPinned} onClick={() => { setOnlyPinned(!onlyPinned); setPage(0); }}><Pin size={13} />In evidenza <span>{pins.length}</span></button>}<button className="fl-workspace-action" type="button" onClick={reset}><X size={13} />Azzera filtri</button></div></div>
    {!loading && !filtered.length && <div className="fl-board-empty"><Search size={24} /><h3>{view === "sources" && !board?.available ? "Estratti non disponibili" : "Nessun risultato"}</h3><p>{view === "sources" && !board?.available ? "Usa Aggiorna per riprovare a leggere la bacheca della missione." : "Prova un altro termine o azzera i filtri per vedere tutti i contenuti."}</p><button className="fl-workspace-action" type="button" onClick={reset}>Mostra tutti</button></div>}
    {view === "sources" ? <ol className="fl-board-excerpts">{visible.map((item) => <li key={item.key} className={pinSet.has(item.key) ? "is-pinned" : ""}>
      <div className="fl-board-excerpt-meta"><span>G{item.day}</span><span>{item.type}</span>{item.reliability && <span className="fl-board-origin">{item.reliability}</span>}<button type="button" aria-pressed={pinSet.has(item.key)} aria-label={`${pinSet.has(item.key) ? "Rimuovi dagli" : "Aggiungi agli"} elementi in evidenza ${item.source_id} estratto ${item.key}`} onClick={() => togglePin(item.key)}><Pin size={14} /></button></div>
      <blockquote>{item.quote}</blockquote><div className="fl-board-excerpt-footer"><SourceChips ids={[item.source_id]} documents={documents} /><span>{[item.people, item.places, item.times].flat().filter(Boolean).join(" · ")}</span></div>
    </li>)}</ol> : <ol className="fl-board-radio-list">{visible.map((log) => <li key={log.id}>
      <button type="button" className="fl-board-radio-toggle" aria-expanded={expanded.has(log.id)} aria-controls={`board-log-${log.id}`} onClick={() => toggleOpen(log.id)}><span className="fl-board-radio-person"><Radio size={14} />{log.resolved_respondent_mode === "team" ? "Team investigativo" : "A.N.I.M.A."}<time dateTime={log.created_at}>{formatFieldlinkDate(log.created_at)}</time></span><strong>{log.question || "Comunicazione senza domanda"}</strong><span className="fl-board-radio-hint">{log.resolved_processing_mode === "documentary" ? "Ricerca documentale" : "Elaborazione libera"} · {log.source_ids?.length || 0} fonti caricate<ChevronDown size={16} /></span></button>
      {expanded.has(log.id) && <div id={`board-log-${log.id}`} className="fl-board-radio-content"><ModelResponseRenderer text={log.answer || "Nessuna risposta registrata."} /><div className="fl-board-log-sources"><span>Fonti caricate nel contesto</span><SourceChips ids={log.source_ids} documents={documents} /></div></div>}
    </li>)}</ol>}
    {filtered.length > PAGE_SIZE && <nav className="fl-board-pagination" aria-label="Pagine della bacheca"><button className="fl-workspace-action" type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ArrowLeft size={15} />Precedenti</button><span>Pagina {currentPage + 1} di {pages}</span><button className="fl-workspace-action" type="button" disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>Successivi<ArrowRight size={15} /></button></nav>}
    <footer className="fl-board-footnote"><span>{generatedAt ? `Sincronizzato ${formatFieldlinkDate(generatedAt)} · aggiornamento ogni 15 s` : "In attesa della sincronizzazione"}</span><p>{view === "sources" ? `Gli estratti riportano il testo delle fonti; le etichette descrivono il contenuto, non ne attestano la veridicità.${board?.pending_documents ? ` ${board.pending_documents} dossier sono consultabili nell’archivio e non hanno ancora estratti in bacheca.` : ""} Il giorno indica la raccolta del documento. Gli elementi in evidenza sono salvati su questo browser.` : "Le comunicazioni sono trascrizioni del diario. Le fonti caricate possono includere documenti non usati come prova nella risposta."}</p></footer>
  </section>;
}
