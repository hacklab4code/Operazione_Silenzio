import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, ChevronDown, ChevronUp, Clock3, FileText, GitBranch, Radio, RefreshCw, RotateCcw, ScanLine } from "lucide-react";
import { formatFieldlinkDate, useFieldlinkData } from "./FieldlinkData";
import { buildTimelineEvents, TIMELINE_DAYS, TIMELINE_PATHS } from "./timelineData";
import ModelResponseRenderer from "./ModelResponseRenderer";
import TimelineDocument from "./TimelineDocument";
import FieldlinkQueryMap from "./FieldlinkQueryMap";
import PageHeaderDetails from "./PageHeaderDetails";
import QueryFocusTrail from "./QueryFocusTrail";
import { firstReportedQuery, matchingQueryLog, querySourceIds } from "./queryContext";
import "./timeline.css";

const PATH_ICONS = { radio: Radio, indagine: BookOpen };
const PATH_DESCRIPTIONS = {
  all: "Tutte le tracce dell’operazione, in ordine di registrazione.",
  radio: "Le comunicazioni con A.N.I.M.A..",
  indagine: "I documenti dell’archivio e le analisi del team investigativo.",
};
const EVENT_ICONS = { radio: Radio, document: FileText };
const KIND_LABELS = { radio: "Comunicazione", document: "Documento" };
const DESTINATIONS = { radio: "radio", indagine: "archivio" };
const ACTIONS = { radio: "Apri la radio", indagine: "Apri l’archivio" };
const PATH_KEY = "fieldlink.timeline.path.v1";
const stepNumber = (index) => String(index + 1).padStart(2, "0");

function readPath() {
  try {
    const value = window.localStorage.getItem(PATH_KEY);
    return TIMELINE_PATHS.some((path) => path.id === value) ? value : "all";
  } catch { return "all"; }
}

function shortDate(value) {
  if (!value) return "Data non disponibile";
  return formatFieldlinkDate(value, { dateStyle: "medium", timeStyle: undefined });
}

function EventDetails({ event, documents, revealSources, focusSourceId }) {
  if (event.kind === "document") return <div className="fl-timeline-detail-inner">
    <TimelineDocument event={event} />
    {event.createdAt && <p className="fl-timeline-provenance fl-document-updated"><Clock3 size={12} />Aggiornato {formatFieldlinkDate(event.createdAt)}</p>}
  </div>;
  return <div className="fl-timeline-detail-inner">
    <div className="fl-timeline-detail-heading"><h3>{event.title}</h3></div>
    {event.createdAt && <p className="fl-timeline-provenance"><Clock3 size={12} />{event.kind === "document" ? "Aggiornato " : ""}{formatFieldlinkDate(event.createdAt)}</p>}
    <div className="fl-timeline-transcript fl-timeline-report-body"><ModelResponseRenderer text={event.content || "Nessun contenuto registrato."} respondent={event.route === "indagine" ? "team" : "marco"} /></div>
    {event.kind === "radio" && event.sourceIds?.length > 0 && <div className="fl-timeline-sources">
      <span>Fonti</span>
      {event.sourceIds.map((sourceId) => {
        const source = documents.find((document) => document.id?.toUpperCase() === sourceId.toUpperCase());
        return <details key={sourceId} open={revealSources && Boolean(source) && (!focusSourceId || sourceId.toUpperCase() === focusSourceId.toUpperCase())}><summary><FileText size={12} />{sourceId}{source ? ` · ${source.title}` : " · non disponibile"}<ChevronDown size={12} /></summary>
          <p>{source?.content || "Il documento non è presente nell’archivio disponibile."}</p></details>;
      })}
    </div>}
  </div>;
}

export default function FieldlinkTimeline({ onOpen, query }) {
  const { documents, radio_logs: radioLogs, board, loading, error, refreshing, refresh } = useFieldlinkData();
  const reducedMotion = useReducedMotion();
  const [path, setPath] = useState(readPath);
  const [session, setSession] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [expanded, setExpanded] = useState(true);
  const [compact, setCompact] = useState(false);
  const [travelDirection, setTravelDirection] = useState(1);
  const timelineRef = useRef(null);
  const stageAnchorRef = useRef(null);
  const trackRef = useRef(null);
  const focusStepRef = useRef(false);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);
  const navigateRef = useRef(null);
  const detailId = useId();
  const focusedQueryRef = useRef(null);
  const referenceDocuments = useMemo(() => [...documents, ...(query?.reference_documents || []).filter((doc) => !documents.some((item) => item.id === doc.id))], [documents, query]);
  const matchingLog = useMemo(() => matchingQueryLog(query, radioLogs), [query, radioLogs]);
  const firstReport = useMemo(() => firstReportedQuery(query, radioLogs), [query, radioLogs]);
  const queryEvent = useMemo(() => firstReport ? buildTimelineEvents({ radioLogs: [firstReport] })[0] : null, [firstReport]);
  const events = useMemo(() => {
    const logs = query === null ? [] : query && !matchingLog ? [...radioLogs, query] : radioLogs;
    return buildTimelineEvents({ documents: query === null ? [] : documents, radioLogs: logs }).map((event) =>
      query && event.id === queryEvent?.id
        ? { ...event, sourceIds: querySourceIds(firstReport) } : event);
  }, [documents, radioLogs, query, matchingLog, queryEvent, firstReport]);
  const sessions = useMemo(() => {
    const grouped = new Map();
    events.forEach((event) => {
      if (!event.sessionId) return;
      if (!grouped.has(event.sessionId)) {
        grouped.set(event.sessionId, { id: event.sessionId, number: grouped.size + 1, startedAt: event.createdAt, count: 0 });
      }
      grouped.get(event.sessionId).count += 1;
    });
    return Array.from(grouped.values()).reverse();
  }, [events]);
  const sessionEvents = useMemo(() => events.filter((event) => !event.sessionId || session === "all" || event.sessionId === session), [events, session]);
  const pathEvents = useMemo(() => sessionEvents.filter((event) => path === "all" || event.route === path), [sessionEvents, path]);
  const [dayFilter, setDayFilter] = useState("all");
  const visibleEvents = useMemo(() => dayFilter === "all" ? pathEvents : pathEvents.filter((event) => event.day === Number(dayFilter)), [pathEvents, dayFilter]);
  const activeEvent = visibleEvents.find((event) => event.id === selectedId) || visibleEvents[0];
  const activeIndex = activeEvent ? visibleEvents.findIndex((event) => event.id === activeEvent.id) : -1;
  const selectedPath = TIMELINE_PATHS.find((entry) => entry.id === path);
  const carouselEvents = visibleEvents.slice(Math.max(0, activeIndex - 2), activeIndex + 3);
  const hasContextFilters = session !== "all" || dayFilter !== "all";
  const queryTarget = query && events.find((event) => event.id === queryEvent?.id);

  useEffect(() => {
    if (!query || (focusedQueryRef.current?.query === query && focusedQueryRef.current?.id === queryTarget?.id)) return;
    const target = queryTarget;
    if (!target) return;
    focusedQueryRef.current = { query, id: target.id };
    setPath("all"); setSession("all"); setDayFilter("all");
    focusStepRef.current = true;
    setSelectedId(target.id); setExpanded(true);
  }, [query, queryTarget]);

  useEffect(() => {
    if (!focusStepRef.current) return;
    trackRef.current?.querySelector(`[data-step-index="${activeIndex}"] button`)?.focus({ preventScroll: true });
    focusStepRef.current = false;
  }, [activeEvent?.id, activeIndex]);

  // Observe the stage once loading has finished and the carousel is mounted.
  const stageReady = !loading && Boolean(activeEvent);
  useEffect(() => {
    const timeline = timelineRef.current;
    const scrollRoot = timeline?.closest(".fieldlink-section-page");
    const anchor = stageAnchorRef.current;
    if (!scrollRoot || !anchor) {
      setCompact(false);
      return undefined;
    }
    let frame = null;
    const update = () => {
      frame = null;
      const stageTop = anchor.getBoundingClientRect().top - scrollRoot.getBoundingClientRect().top + scrollRoot.scrollTop;
      setCompact((current) => scrollRoot.scrollTop > Math.max(0, stageTop - (current ? 24 : 0)));
    };
    const scheduleUpdate = () => {
      if (frame === null) frame = window.requestAnimationFrame(update);
    };
    const measure = () => {
      timeline.style.setProperty("--fl-timeline-viewport-height", `${scrollRoot.clientHeight}px`);
      scheduleUpdate();
    };
    const observer = new ResizeObserver(measure);
    observer.observe(scrollRoot);
    scrollRoot.addEventListener("scroll", scheduleUpdate, { passive: true });
    measure();
    return () => {
      observer.disconnect();
      scrollRoot.removeEventListener("scroll", scheduleUpdate);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [stageReady, path, session]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return undefined;
    let accumulated = 0;
    let lastInput = -Infinity;
    let frame = null;
    const flush = () => {
      frame = null;
      const steps = Math.trunc(accumulated / 64);
      if (!steps) return;
      accumulated -= steps * 64;
      navigateRef.current?.(steps);
    };
    const wheel = (event) => {
      if (event.ctrlKey) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (!delta) return;
      event.preventDefault();
      const now = performance.now();
      if (now - lastInput > 160 || Math.sign(accumulated) !== Math.sign(delta)) accumulated = 0;
      lastInput = now;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? track.clientWidth : 1;
      accumulated += delta * unit;
      if (frame === null) frame = window.requestAnimationFrame(flush);
    };
    track.addEventListener("wheel", wheel, { passive: false });
    return () => {
      track.removeEventListener("wheel", wheel);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [stageReady, path, session, dayFilter]);

  const choosePath = (id) => {
    setPath(id);
    setSelectedId(null);
    setExpanded(true);
    setTravelDirection(1);
    try { window.localStorage.setItem(PATH_KEY, id); } catch { /* Selection still works without storage. */ }
  };
  const resetFilters = () => {
    choosePath("all");
    setSession("all");
    setDayFilter("all");
  };
  const selectEvent = (index) => {
    if (!visibleEvents[index]) return;
    setTravelDirection(index < activeIndex ? -1 : 1);
    setSelectedId(visibleEvents[index].id);
    setExpanded(true);
  };
  navigateRef.current = (steps) => {
    if (!visibleEvents.length) return;
    setTravelDirection(steps < 0 ? -1 : 1);
    setSelectedId((currentId) => {
      const currentIndex = Math.max(0, visibleEvents.findIndex((event) => event.id === currentId));
      const nextIndex = Math.max(0, Math.min(currentIndex + steps, visibleEvents.length - 1));
      return visibleEvents[nextIndex].id;
    });
    setExpanded(true);
  };
  const navigateWithKeyboard = (event) => {
    let next;
    if (event.key === "ArrowRight") next = Math.min(activeIndex + 1, visibleEvents.length - 1);
    else if (event.key === "ArrowLeft") next = Math.max(activeIndex - 1, 0);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = visibleEvents.length - 1;
    else return;
    event.preventDefault();
    if (next === activeIndex) {
      trackRef.current?.querySelector(`[data-step-index="${next}"] button`)?.focus({ preventScroll: true });
      return;
    }
    focusStepRef.current = true;
    selectEvent(next);
  };
  const startDrag = (event) => {
    if (event.button !== 0) return;
    suppressClickRef.current = false;
    dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, startedAt: performance.now(), horizontal: false };
  };
  const moveDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(event.clientY - drag.y) * 1.2) {
      drag.horizontal = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };
  const finishDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const distance = drag.x - event.clientX;
    suppressClickRef.current = drag.horizontal;
    if (drag.horizontal && Math.abs(distance) > 24) {
      const cardWidth = event.currentTarget.querySelector(".is-active")?.offsetWidth || 320;
      const stride = Math.max(80, cardWidth * .5);
      const elapsed = Math.max(16, performance.now() - drag.startedAt);
      const momentum = Math.min(stride * 2, Math.abs(distance) / elapsed * 100);
      const steps = Math.max(1, Math.round((Math.abs(distance) + momentum) / stride));
      navigateRef.current?.(Math.sign(distance) * steps);
    }
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return <div ref={timelineRef} className={`fl-timeline ${query ? "fl-query-focused" : ""}`} data-testid="fieldlink-timeline" data-reduced-motion={reducedMotion ? "true" : "false"}>
    <QueryFocusTrail query={query} label="Prima comunicazione collegata" onReturn={() => onOpen?.("radio")} />
    <PageHeaderDetails>
      <span className="fieldlink-header-caption"><GitBranch size={13} />{loading ? "Caricamento…" : `${visibleEvents.length.toLocaleString("it-IT")} eventi`}</span>
      <button type="button" className="fieldlink-header-action" onClick={refresh} disabled={refreshing} aria-label="Aggiorna la timeline"><RefreshCw size={14} className={refreshing ? "is-refreshing" : ""} /><span>{refreshing ? "Aggiornamento…" : "Aggiorna"}</span></button>
    </PageHeaderDetails>
    <div className="fl-timeline-toolbar">
      <div className="fl-timeline-filter-group">
        <span className="fieldlink-sr-only" id={`${detailId}-activity-label`}>Tipo di attività</span>
        <div className="fl-timeline-filters" role="group" aria-labelledby={`${detailId}-activity-label`}>
          <button type="button" aria-pressed={path === "all"} className={path === "all" ? "is-selected" : ""} title={PATH_DESCRIPTIONS.all} onClick={() => choosePath("all")}><GitBranch size={15} aria-hidden="true" /><span className="fl-timeline-filter-name">Tutti</span></button>
          {TIMELINE_PATHS.map((entry) => {
            const Icon = PATH_ICONS[entry.id];
            return <button key={entry.id} type="button" className={path === entry.id ? "is-selected" : ""} aria-pressed={path === entry.id} title={PATH_DESCRIPTIONS[entry.id]} onClick={() => choosePath(entry.id)} data-testid={`timeline-path-${entry.id}`}>
              <Icon size={15} aria-hidden="true" /><span className="fl-timeline-filter-name">{entry.id === "radio" ? "Radio" : entry.label}</span>
            </button>;
          })}
        </div>
      </div>
      <div className="fl-timeline-secondary-filters">
        <label className="fl-timeline-session fl-timeline-day-select">
          <span className="fieldlink-sr-only">Giorno</span>
          <span className="fl-timeline-select-control">
            <select value={dayFilter} onChange={(event) => { setDayFilter(event.target.value); setSelectedId(null); setExpanded(true); }} aria-label="Filtra eventi per giorno">
              <option value="all">Tutti i giorni</option>
              {[...new Set([...TIMELINE_DAYS, ...events.map((event) => event.day).filter(Boolean)])].sort((a, b) => a - b).map((day) => <option key={day} value={day}>Giorno {day}</option>)}
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </span>
        </label>
        <label className="fl-timeline-session">
          <span className="fieldlink-sr-only">Sessione chat</span>
          <span className="fl-timeline-select-control">
            <select value={session} onChange={(event) => { setSession(event.target.value); setSelectedId(null); setExpanded(true); setDayFilter("all"); }} aria-label="Sessione delle comunicazioni" title="Filtra le comunicazioni. I documenti dell’archivio restano inclusi.">
              <option value="all">Tutte le chat</option>
              {sessions.map((entry) => <option key={entry.id} value={entry.id}>Chat {entry.number} · {entry.startedAt ? formatFieldlinkDate(entry.startedAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", dateStyle: undefined, timeStyle: undefined }) : "Data non disponibile"} · {entry.count} {entry.count === 1 ? "scambio" : "scambi"}</option>)}
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </span>
        </label>
      </div>
      {(path !== "all" || hasContextFilters) && <button type="button" className="fl-timeline-reset" onClick={resetFilters}><RotateCcw size={12} aria-hidden="true" />Azzera filtri</button>}
    </div>

    {error && <p className="fl-timeline-data-notice" role="status">{error}</p>}
    {loading && <div className="fl-timeline-loading" role="status"><ScanLine size={18} /><span>Caricamento…</span></div>}
    {!loading && visibleEvents.length > 0 && <section className="fl-timeline-journey" aria-label={selectedPath?.label || "Tutti gli eventi"}>
      <div ref={stageAnchorRef} className="fl-timeline-stage-anchor" aria-hidden="true" />
      <div className={`fl-timeline-stage ${compact ? "is-compact" : ""}`} data-testid="timeline-stage">
      <span className="fieldlink-sr-only" role="status" aria-live="polite">Passaggio {activeIndex + 1} di {visibleEvents.length}</span>
      <div className="fl-timeline-navigation" role="group" aria-label="Navigazione dei passaggi">
        <button type="button" aria-label="Evento precedente" disabled={activeIndex <= 0} onClick={() => selectEvent(activeIndex - 1)}><ArrowLeft size={17} /></button>
        <button type="button" aria-label="Evento successivo" disabled={activeIndex >= visibleEvents.length - 1} onClick={() => selectEvent(activeIndex + 1)}><ArrowRight size={17} /></button>
      </div>
      <ol key={`${path}-${session}-${dayFilter}`} ref={trackRef} className="fl-timeline-track fl-timeline-carousel" aria-label="Card del percorso, da sinistra a destra" tabIndex={0} onKeyDown={navigateWithKeyboard} data-testid="timeline-events"
        onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={() => { dragRef.current = null; suppressClickRef.current = false; }}
        onClickCapture={(event) => { if (suppressClickRef.current) { event.preventDefault(); event.stopPropagation(); suppressClickRef.current = false; } }}>
        {carouselEvents.map((event, slot) => {
          const index = Math.max(0, activeIndex - 2) + slot;
          const offset = index - activeIndex;
          const distance = Math.abs(offset);
          const Icon = EVENT_ICONS[event.kind] || ScanLine;
          const isActive = event.id === activeEvent.id;
          return <li key={event.id} className={`fl-timeline-step ${isActive ? "is-active" : ""} ${index < activeIndex ? "is-passed" : ""}`}
            style={{ "--fl-slide-offset": offset, "--fl-slide-scale": distance === 0 ? 1 : distance === 1 ? .82 : .66, "--fl-slide-gray": distance === 0 ? "0%" : distance === 1 ? "70%" : "100%", "--fl-slide-brightness": distance === 0 ? 1 : distance === 1 ? .74 : .5, zIndex: 3 - distance }}
            aria-posinset={index + 1} aria-setsize={visibleEvents.length} data-step-index={index} data-testid="timeline-event" data-kind={event.kind} data-query-target={event.id === queryTarget?.id ? "true" : undefined}>
            <button type="button" className="fl-timeline-step-button" aria-label={`Passaggio ${index + 1}: ${event.title}`} aria-current={isActive ? "step" : undefined} aria-expanded={isActive && expanded} aria-controls={detailId}
              onClick={() => { if (isActive) setExpanded((value) => !value); else selectEvent(index); }}>
              <span className="fl-timeline-step-top">{stepNumber(index)}</span>
              <span className="fl-timeline-axis"><span className="fl-timeline-node" aria-hidden="true"><Icon size={20} strokeWidth={1.5} /></span>{index < visibleEvents.length - 1 && <span className="fl-timeline-link" aria-hidden="true"><span className="fl-timeline-signal" /><ArrowRight size={13} /></span>}</span>
              <span className="fl-timeline-step-kind">{KIND_LABELS[event.kind]}{event.kind === "document" && event.id.startsWith("document:G") ? ` / ${event.id.slice(9)}` : ""}</span>
              <strong className="fl-timeline-step-title">{event.title}</strong>
              {(event.day || event.createdAt) && <time dateTime={event.createdAt || undefined}>{event.day && <span>Giorno {event.day}{event.createdAt ? " · " : ""}</span>}{event.createdAt && shortDate(event.createdAt)}</time>}
            </button>
          </li>;
        })}
      </ol>

      <div className="fl-timeline-progress" aria-hidden="true"><motion.span initial={false} animate={{ scaleX: (activeIndex + 1) / visibleEvents.length }} transition={{ duration: reducedMotion ? 0 : .45, ease: [.22, 1, .36, 1] }} /></div>
      <div className="fl-timeline-track-caption" aria-hidden="true">{stepNumber(activeIndex)} / {String(visibleEvents.length).padStart(2, "0")}</div>
      </div>
      <div className="fl-timeline-inspector" data-expanded={expanded} data-query-target={activeEvent.id === queryTarget?.id ? "true" : undefined}>
        <div className="fl-timeline-inspector-bar">
          <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-controls={detailId}>{expanded ? "Chiudi" : "Apri dettagli"}{expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</button>
        </div>
        <AnimatePresence initial={false}>
          {expanded && <motion.div id={detailId} className="fl-timeline-detail" role="region" aria-label={`Dettagli: ${activeEvent.title}`}
            initial={{ height: reducedMotion ? "auto" : 0, opacity: reducedMotion ? 1 : 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: reducedMotion ? "auto" : 0, opacity: 0 }} transition={{ duration: reducedMotion ? 0 : .22 }}>
            <motion.div key={activeEvent.id} className="fl-timeline-detail-content" initial={reducedMotion ? false : { opacity: 0, x: 12 * travelDirection }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reducedMotion ? 0 : .18, ease: [.22, 1, .36, 1] }}>
              <EventDetails key={activeEvent.id} event={activeEvent} documents={referenceDocuments} revealSources={activeEvent.id === queryTarget?.id} focusSourceId={query?.focus_id} />
              <FieldlinkQueryMap documents={referenceDocuments} board={board} query={{
                question: activeEvent.title,
                answer: activeEvent.content,
                source_ids: activeEvent.kind === "document" ? [activeEvent.id.slice("document:".length)] : activeEvent.sourceIds,
              }} />
            </motion.div>
          </motion.div>}
        </AnimatePresence>
      </div>
    </section>}
    {!loading && !visibleEvents.length && <div className="fl-timeline-empty"><ScanLine size={28} strokeWidth={1.2} /><h3>{hasContextFilters ? "Nessun evento con questi filtri." : "Nessuna traccia in questo percorso."}</h3>
      <button type="button" onClick={hasContextFilters ? resetFilters : () => onOpen?.(DESTINATIONS[path] || "radio")}>{hasContextFilters ? "Azzera filtri" : ACTIONS[path] || "Apri la radio"}{hasContextFilters ? <RotateCcw size={14} /> : <ArrowUpRight size={14} />}</button>
    </div>}
  </div>;
}
