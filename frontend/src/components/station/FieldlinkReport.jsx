import PageHeaderDetails from "./PageHeaderDetails";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowDownWideNarrow, BookOpen, ChevronDown, Clock3, FileText, Layers3, Radio, RefreshCw, Search, X } from "lucide-react";
import { DataMessage, formatFieldlinkDate, useFieldlinkData } from "./FieldlinkData";
import { missionClock } from "./missionCalendar";
import ModelResponseRenderer, { parseModelResponse } from "./ModelResponseRenderer";
import { originalUrl, SourceChips } from "./FieldlinkSourcePreview";
import "./report.css";

const PAGE_SIZE = 10;
const number = (value) => Number(value || 0).toLocaleString("it-IT");
const normalize = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("it");
const respondentOf = (log) => {
  const mode = log.resolved_respondent_mode || log.respondent_mode;
  return ["marco", "team"].includes(mode) ? mode : "unknown";
};
const processingOf = (log) => {
  const mode = log.resolved_processing_mode || log.processing_mode;
  return ["documentary", "free"].includes(mode) ? mode : "unknown";
};
const respondentLabel = (value) => value === "team" ? "Team investigativo" : value === "marco" ? "A.N.I.M.A." : "Interlocutore non indicato";
const processingLabel = (value) => value === "documentary" ? "Ricerca documentale" : value === "free" ? "Elaborazione libera" : "Modalità non indicata";
const timestampOf = (log) => new Date(log.created_at || 0).getTime() || 0;
const calendarDay = (value) => {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? date.toLocaleDateString("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }) : "unknown";
};
const dateLabel = (value) => value === "unknown" ? "Data non disponibile" : new Date(`${value}T12:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });

function answerPreview(text) {
  const parsed = parseModelResponse(text);
  return (parsed.answer || parsed.raw || "Risposta non disponibile").replace(/[*_#]/g, "").replace(/\s+/g, " ").trim();
}

function CorpusSummary({ archive, loading, missionDay }) {
  const [selectedDay, setSelectedDay] = useState("all");
  const days = useMemo(() => {
    const present = new Map((Array.isArray(archive?.by_day) ? archive.by_day : []).map((item) => [Number(item.day), item]));
    return [...present.values()].sort((a, b) => a.day - b.day);
  }, [archive, missionDay]);
  const selected = days.find((item) => String(item.day) === selectedDay);
  const categories = Array.isArray(archive?.by_category) ? archive.by_category : [];
  const largestDay = Math.max(1, ...days.map((item) => Number(item.count) || 0));
  const count = selected ? selected.count : archive?.total;
  const imprevisti = selected ? selected.imprevisti : archive?.imprevisti_count;
  const cumulative = selected ? days.filter((item) => Number(item.day) <= Number(selected.day)).reduce((total, item) => total + Number(item.count || 0), 0) : null;

  if (loading) return <div className="fl-report-corpus-loading" role="status">Caricamento del riepilogo dell’archivio…</div>;
  if (!archive || !days.length) return <p className="fl-report-note">Riepilogo dell’archivio non disponibile.</p>;
  return <section className="fl-report-corpus" aria-labelledby="fl-report-corpus-title">
    <div className="fl-report-subheading"><h3 id="fl-report-corpus-title"><Layers3 size={14} />Documenti per giorno</h3><span>{number(archive.total)} documenti</span></div>
    <div className="fl-report-corpus-layout">
      <div className="fl-report-days" aria-label="Seleziona il giorno della raccolta">
        <button type="button" className="fl-report-all-days" aria-pressed={selectedDay === "all"} onClick={() => setSelectedDay("all")}><span>Tutti i giorni</span><strong>{number(archive.total)}</strong></button>
        {days.map((item) => <button type="button" className="fl-report-day" key={item.day} aria-pressed={selectedDay === String(item.day)} onClick={() => setSelectedDay(String(item.day))}>
          <span className="fl-report-day-index">{String(item.day).padStart(2, "0")}</span><span className="fl-report-day-content"><span>Giorno {item.day}<strong>{number(item.count)}</strong></span><span className="fl-report-day-track"><i style={{ width: `${Math.max(1, (Number(item.count) / largestDay) * 100)}%` }} /></span></span><ChevronDown size={14} />
        </button>)}
      </div>
      <div className="fl-report-corpus-detail" aria-live="polite">
        <span className="fl-report-label">{selected ? `GIORNO ${selected.day}` : "ARCHIVIO COMPLETO"}</span>
        <p className="fl-report-corpus-total"><strong>{number(count)}</strong><span>documenti {selected ? "nel giorno" : "nell’archivio"}</span></p>
        <p>{selected ? `${number(cumulative)} documenti disponibili fino al giorno ${selected.day}.` : `${days.length} giorni di raccolta. Seleziona un giorno per consultarne il riepilogo.`}</p>
        <span className="fl-report-imprevisti"><FileText size={13} />{number(imprevisti)} {Number(imprevisti) === 1 ? "documento imprevisto" : "documenti imprevisti"}</span>
        {!selected && categories.length > 0 && <ul className="fl-report-categories" aria-label="Composizione del corpus">{categories.map((category) => <li key={category.id}><span>{category.label || category.id}</span><strong>{number(category.count)}</strong></li>)}</ul>}
        {selected && <p className="fl-report-note">{selected.day === missionDay && !Number(selected.count) ? `Nessun documento presente per il giorno ${selected.day}.` : "Il giorno indica la raccolta del documento. Le comunicazioni sotto sono ordinate per data di registrazione."}</p>}
      </div>
    </div>
  </section>;
}

export default function FieldlinkReport() {
  const { documents, radio_logs: radioLogs, archive, mission, generated_at: generatedAt, loading, error, refresh, refreshing } = useFieldlinkData();
  const missionMark = missionClock(mission);
  const [query, setQuery] = useState("");
  const [respondent, setRespondent] = useState("all");
  const [processing, setProcessing] = useState("all");
  const [date, setDate] = useState("all");
  const [sort, setSort] = useState("newest");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [expanded, setExpanded] = useState(() => new Set());
  const [exportStatus, setExportStatus] = useState("");
  const deferredQuery = useDeferredValue(query);
  const sortedLogs = useMemo(() => [...radioLogs].sort((a, b) => timestampOf(b) - timestampOf(a)), [radioLogs]);
  const dates = useMemo(() => [...new Set(sortedLogs.map((log) => calendarDay(log.created_at)))], [sortedLogs]);
  const filtered = useMemo(() => {
    const words = normalize(deferredQuery).trim().split(/\s+/).filter(Boolean);
    const matches = sortedLogs.filter((log) => (respondent === "all" || respondentOf(log) === respondent)
      && (processing === "all" || processingOf(log) === processing)
      && (date === "all" || calendarDay(log.created_at) === date)
      && words.every((word) => normalize([log.question, log.answer, ...(log.source_ids || [])].join(" ")).includes(word)));
    return sort === "oldest" ? matches.reverse() : matches;
  }, [sortedLogs, deferredQuery, respondent, processing, date, sort]);
  const shown = filtered.slice(0, visibleCount);
  const filtersActive = Boolean(query || respondent !== "all" || processing !== "all" || date !== "all");
  const lastContact = sortedLogs[0]?.created_at;
  const hasArchive = archive && archive.available !== false && Number.isFinite(Number(archive.total));
  const sourceCount = useMemo(() => new Set(radioLogs.flatMap((log) => Array.isArray(log.source_ids) ? log.source_ids : [])).size, [radioLogs]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); setExportStatus(""); }, [deferredQuery, respondent, processing, date, sort]);

  const resetFilters = () => { setQuery(""); setRespondent("all"); setProcessing("all"); setDate("all"); };
  const toggleLog = (id) => setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const exportDiary = () => {
    const scope = [query && `Ricerca: ${query}`, respondent !== "all" && respondentLabel(respondent), processing !== "all" && processingLabel(processing), date !== "all" && dateLabel(date)].filter(Boolean).join(" · ") || "Tutte le comunicazioni";
    const body = [`# Rapporto operativo — diario radio`, ``, `Esportato il ${formatFieldlinkDate(new Date().toISOString())}`, `Ambito: ${scope}`, `${filtered.length} comunicazioni · ordine ${sort === "newest" ? "dalla più recente" : "dalla meno recente"}`, ``, ...filtered.flatMap((log) => [`## ${formatFieldlinkDate(log.created_at)} · ${respondentLabel(respondentOf(log))}`, ``, `Modalità: ${processingLabel(processingOf(log))}`, ``, `### Domanda`, log.question || "Domanda non disponibile", ``, `### Trascrizione`, log.answer || "Risposta non disponibile", ``, `Fonti recuperate: ${(log.source_ids || []).join(", ") || "nessuna"}`, ``, `---`, ``])].join("\n");
    const url = URL.createObjectURL(new Blob([body], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `rapporto-radio-${calendarDay(new Date().toISOString())}.md`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExportStatus(`Esportate ${number(filtered.length)} comunicazioni.`);
  };

  return <section className="fl-report" data-testid="fieldlink-report" aria-labelledby="fieldlink-page-title">
    <PageHeaderDetails>
      <span className="fieldlink-header-caption"><Radio size={13} />{loading ? "Caricamento…" : `${number(radioLogs.length)} comunicazioni · ${hasArchive ? number(archive.total) : "—"} documenti`}</span>
      {refresh && <button type="button" className="fieldlink-header-action" disabled={loading || refreshing} onClick={() => refresh()} aria-label="Aggiorna il rapporto"><RefreshCw size={14} className={refreshing ? "is-refreshing" : ""} /><span>{refreshing ? "Aggiornamento…" : "Aggiorna"}</span></button>}
    </PageHeaderDetails>
    {error && <div className="fl-report-error" role="status"><p>{error}</p>{refresh && <button type="button" onClick={() => refresh()} disabled={refreshing}>Riprova</button>}</div>}
    <dl className="fl-report-metrics" aria-label="Riepilogo del rapporto">
      <div><dt><BookOpen size={14} />Documenti in archivio</dt><dd>{loading ? "—" : hasArchive ? number(archive.total) : "—"}</dd><small>{loading ? "Catalogo delle fonti" : hasArchive && archive.latest_day ? `Raccolta fino al giorno ${archive.latest_day}` : "Catalogo delle fonti"}</small></div>
      <div><dt><Radio size={14} />Comunicazioni</dt><dd>{loading ? "—" : number(radioLogs.length)}</dd><small>Registrazioni nel diario</small></div>
      <div><dt><FileText size={14} />Fonti recuperate</dt><dd>{loading ? "—" : number(sourceCount)}</dd><small>ID distinti nelle comunicazioni</small></div>
      <div><dt><Clock3 size={14} />Ultimo contatto</dt><dd className="fl-report-last-contact">{loading ? "—" : lastContact ? formatFieldlinkDate(lastContact) : "Nessuno"}</dd><small>{generatedAt ? `Sincronizzato ${formatFieldlinkDate(generatedAt)}` : "In attesa di sincronizzazione"}</small></div>
    </dl>
    <CorpusSummary archive={archive} loading={loading} missionDay={missionMark.day} />
    {archive?.assets?.length > 0 && <div className="fl-report-assets"><strong>Database e archivi originali</strong>{archive.assets.map((asset) => <a key={asset.key} href={originalUrl(asset.key)} download={asset.filename}><ArrowDownToLine size={13} />{asset.filename}<small>{asset.format} · {number(asset.bytes)} byte</small></a>)}</div>}

    <section className="fl-report-diary" aria-labelledby="fl-report-diary-title">
      <div className="fl-report-diary-heading"><div><h3 id="fl-report-diary-title">Diario delle comunicazioni</h3><p>Cerca una domanda o una fonte; apri una registrazione per leggere la trascrizione.</p></div></div>
      <div className="fl-report-search-row"><label className="fl-report-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca nel diario, anche per ID fonte…" aria-label="Cerca nelle comunicazioni" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Cancella ricerca"><X size={14} /></button>}</label><button type="button" className="fl-report-export" disabled={loading || !filtered.length} onClick={exportDiary}><ArrowDownToLine size={15} />Esporta diario<span>.md</span></button></div>
      <div className="fl-report-filters">
        <label><span>Interlocutore</span><select value={respondent} onChange={(event) => setRespondent(event.target.value)} aria-label="Filtra per interlocutore"><option value="all">Tutti gli interlocutori</option><option value="marco">A.N.I.M.A.</option><option value="team">Team investigativo</option>{radioLogs.some((log) => !["marco", "team"].includes(respondentOf(log))) && <option value="unknown">Non indicato</option>}</select></label>
        <label><span>Elaborazione</span><select value={processing} onChange={(event) => setProcessing(event.target.value)} aria-label="Filtra per modalità"><option value="all">Tutte le modalità</option><option value="documentary">Ricerca documentale</option><option value="free">Elaborazione libera</option>{radioLogs.some((log) => processingOf(log) === "unknown") && <option value="unknown">Non indicata</option>}</select></label>
        <label><span>Data di registrazione</span><select value={date} onChange={(event) => setDate(event.target.value)} aria-label="Filtra per data"><option value="all">Tutte le date</option>{dates.map((value) => <option key={value} value={value}>{dateLabel(value)}</option>)}</select></label>
        <label><span><ArrowDownWideNarrow size={11} />Ordine</span><select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Ordina le comunicazioni"><option value="newest">Più recenti prima</option><option value="oldest">Meno recenti prima</option></select></label>
      </div>
      <div className="fl-report-resultbar" aria-live="polite"><span><strong>{number(filtered.length)}</strong> di {number(radioLogs.length)} comunicazioni</span>{filtersActive && <button type="button" onClick={resetFilters}>Azzera filtri<X size={12} /></button>}<span className="fl-report-export-status" role="status">{exportStatus}</span></div>
      <DataMessage loading={loading} isEmpty={!radioLogs.length && !error} empty="Il diario non contiene ancora comunicazioni registrate." />
      {!loading && radioLogs.length > 0 && (filtered.length ? <>
        <ol className="fl-report-log-list">{shown.map((log, index) => {
          const id = log.id || `${log.created_at}-${index}`;
          const isOpen = expanded.has(id);
          const panelId = `fl-report-log-${id}`;
          const sourceIds = Array.isArray(log.source_ids) ? log.source_ids : [];
          return <li key={id} className={isOpen ? "is-expanded" : ""}><article>
            <div className="fl-report-log-meta"><time dateTime={log.created_at}>{formatFieldlinkDate(log.created_at)}</time><span>{respondentLabel(respondentOf(log))}</span><span>{processingLabel(processingOf(log))}</span>{sourceIds.length > 0 && <span className="fl-report-source-count"><FileText size={11} />{sourceIds.length} {sourceIds.length === 1 ? "fonte" : "fonti"}</span>}</div>
            <button type="button" className="fl-report-log-toggle" aria-expanded={isOpen} aria-controls={panelId} onClick={() => toggleLog(id)}><span><strong>{log.question || "Domanda non disponibile"}</strong>{!isOpen && <span className="fl-report-log-preview">{answerPreview(log.answer)}</span>}<small>{isOpen ? "Chiudi trascrizione" : "Leggi trascrizione"}</small></span><ChevronDown size={17} /></button>
            {isOpen && <div className="fl-report-log-content" id={panelId}><div className="fieldlink-archived-response"><ModelResponseRenderer text={log.answer || "Risposta non disponibile"} respondent={respondentOf(log)} /></div><div className="fl-report-log-sources"><span className="fl-report-label">FONTI RECUPERATE</span>{sourceIds.length ? <SourceChips ids={sourceIds} documents={documents} /> : <p>Nessuna fonte associata a questa registrazione.</p>}</div></div>}
          </article></li>;
        })}</ol>
        <div className="fl-report-load-more"><span>{number(shown.length)} di {number(filtered.length)} visibili</span>{shown.length < filtered.length && <button type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>Mostra altre {Math.min(PAGE_SIZE, filtered.length - shown.length)} comunicazioni<ChevronDown size={14} /></button>}</div>
      </> : <div className="fl-report-empty" role="status"><Search size={24} /><h4>Nessuna comunicazione trovata</h4><p>Modifica la ricerca o i filtri per continuare.</p><button type="button" onClick={resetFilters}>Mostra tutte le comunicazioni</button></div>)}
    </section>
    <p className="fl-report-footnote">Le trascrizioni riportano le risposte salvate dal sistema. Le fonti recuperate non costituiscono automaticamente una conferma: apri i documenti originali per verificarle.</p>
  </section>;
}
