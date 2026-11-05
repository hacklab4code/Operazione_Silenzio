import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Cpu, Mic, Minus, Plus } from "lucide-react";
import { NAV } from "./TopBar";
import FieldlinkRail from "./FieldlinkRail";
import LetterGlitch from "./LetterGlitch";
import AnimaBoot from "./AnimaBoot";
import TypedText from "./TypedText";
import ResponsePreferences, { readResponsePreferences, saveResponsePreferences } from "./ResponsePreferences";
import ModelResponseRenderer from "./ModelResponseRenderer";
import CopyMessageButton from "./CopyMessageButton";
import { PageHeaderTarget } from "./PageHeaderDetails";
import FieldlinkSectionPage from "./FieldlinkSectionPage";
import FieldlinkVetrina from "./FieldlinkVetrina";
import { notifyFieldlinkDataUpdated, useFieldlinkData } from "./FieldlinkData";
import { RadioTrace } from "./RadioTrace";
import { DANGER_WORDS, OPENING } from "@/data/story";
import { getRadioTheme } from "./radioTheme";
import QueryShortcuts from "./QueryShortcuts";
import { queryDestinations, queryDocuments, querySourceIds } from "./queryContext";
import { readCatalog } from "./FieldlinkSourcePreview";

const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api/radio`;
const BACKEND = process.env.REACT_APP_BACKEND_URL || "";
const MIN_FREQUENCY = 140;
const MAX_FREQUENCY = 180;
const DOCK_SECTIONS = new Set(["archivio", "database", "timeline"]);
const DOCK_ORDER = { archivio: 0, database: 1, timeline: 2 };
const PASSAGE_SHIFT = { archivio: "-12px", database: "0px", timeline: "12px" };
const PASSAGE_MS = {
  dock: { leave: 340, enter: 620 },
  slide: { leave: 280, enter: 480 },
  fade: { leave: 220, enter: 400 },
};

function describePassage(from, to) {
  if (from === "radio" && DOCK_SECTIONS.has(to)) return { kind: "dock", dir: "forward", lane: to };
  if (to === "radio" && DOCK_SECTIONS.has(from)) return { kind: "dock", dir: "back", lane: from };
  if (DOCK_SECTIONS.has(from) && DOCK_SECTIONS.has(to)) {
    return { kind: "slide", dir: DOCK_ORDER[to] > DOCK_ORDER[from] ? "right" : "left", lane: to };
  }
  return { kind: "fade", dir: "forward", lane: to };
}

function measureOrigin(node, screen) {
  if (!node || !screen) return null;
  const box = node.getBoundingClientRect();
  const frame = screen.getBoundingClientRect();
  if (!box.width && !box.height) return null;
  const x = Math.min(frame.width - 20, Math.max(20, box.left + box.width / 2 - frame.left));
  const y = Math.min(frame.height - 12, Math.max(12, box.top + box.height / 2 - frame.top));
  return { x: `${Math.round(x)}px`, y: `${Math.round(y)}px` };
}

function fallbackOrigin(screen, lane) {
  const width = screen?.clientWidth || 900;
  const height = screen?.clientHeight || 700;
  const right = Math.min(width - 28, width / 2 + 390);
  const laneX = { archivio: right - 336, database: right - 196, timeline: right - 62 };
  return { x: `${Math.round(laneX[lane] || right - 196)}px`, y: `${Math.round(height - 46)}px` };
}

function resolveOrigin(source, screen, motion, dockOrigin) {
  if (motion.kind === "dock" && motion.dir === "back" && dockOrigin.current) return dockOrigin.current;
  const measured = measureOrigin(source, screen)
    || measureOrigin(document.querySelector(`.fieldlink-query-shortcuts button[data-lane="${motion.lane}"]`), screen)
    || measureOrigin(document.querySelector(`.fieldlink-rail .fieldlink-nav-${motion.lane}`), screen)
    || fallbackOrigin(screen, motion.lane);
  if (motion.kind === "dock" && motion.dir === "forward") dockOrigin.current = measured;
  return measured;
}

function clockTime() {
  return new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

async function streamReply(body, onChunk, onMetadata) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 180000);
  try {
    const response = await fetch(API, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: controller.signal,
    });
    if (!response.ok) {
      const error = new Error("Radio non disponibile");
      const payload = await response.json().catch(() => null);
      if (response.status === 503 && typeof payload?.detail === "string" && payload.detail.startsWith("Archivio documentale non disponibile")) error.userMessage = payload.detail;
      throw error;
    }
    if (!response.body) throw new Error("Radio non disponibile");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop();
        for (const event of events) {
          const data = event.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
          if (!data) continue;
          if (data === "[END]") return;
          const item = JSON.parse(data);
          if (item.error) throw new Error(item.error);
          if (item.meta) onMetadata?.(item.meta);
          if (item.t) onChunk(item.t);
        }
      }
    } finally {
      reader.releaseLock();
    }
  } finally {
    window.clearTimeout(timeout);
  }
}

export default function FieldlinkDashboard({ hidden, quality = 100, frequency, setFrequency, frequencyTuning = false, unlocked, fresh, activity, section = "radio", onDanger, onGroqSaturated, onOpen }) {
  const [sessionId] = useState(() => `sess-${window.crypto.randomUUID()}`);
  const [messages, setMessages] = useState([{ role: "marco", text: OPENING, time: clockTime() }]);
  const { documents: liveDocuments, radio_logs: radioLogs, archive } = useFieldlinkData();
  const [catalog, setCatalog] = useState([]);
  useEffect(() => {
    let active = true;
    readCatalog().then((documents) => { if (active) setCatalog(documents); }).catch(() => { /* Unavailable sources keep their shortcut disabled. */ });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (liveDocuments.length) setCatalog(liveDocuments); }, [liveDocuments]);
  const [latestQuery, setLatestQuery] = useState(null);
  const [queryContext, setQueryContext] = useState(undefined);
  const [passage, setPassage] = useState(null);
  const screenRef = useRef(null);
  const sectionRef = useRef(section);
  const onOpenRef = useRef(onOpen);
  const dockOrigin = useRef(null);
  const passageLock = useRef(false);
  const passageTimers = useRef([]);
  const passageAlive = useRef(true);
  sectionRef.current = section;
  onOpenRef.current = onOpen;
  useEffect(() => {
    passageAlive.current = true;
    const timers = passageTimers.current;
    return () => {
      passageAlive.current = false;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, []);
  const travelTo = (id, source, prepare) => {
    const target = id === "prove" ? "archivio" : id;
    const from = sectionRef.current;
    if (!target || target === from || passageLock.current) return;
    const motion = describePassage(from, target);
    const origin = resolveOrigin(source, screenRef.current, motion, dockOrigin);
    const next = { ...motion, to: target, origin };
    const launch = source?.matches?.(".fieldlink-query-shortcuts button, .fieldlink-rail nav button") ? source : null;
    const commit = () => {
      prepare?.();
      onOpenRef.current(target);
    };
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      commit();
      return;
    }
    launch?.classList.add("is-launching");
    passageLock.current = true;
    setPassage({ ...next, stage: "leave" });
    const { leave, enter } = PASSAGE_MS[motion.kind];
    const leaveTimer = window.setTimeout(() => {
      if (!passageAlive.current) return;
      commit();
      setPassage({ ...next, stage: "enter" });
      passageLock.current = false;
      const enterTimer = window.setTimeout(() => {
        if (!passageAlive.current) return;
        setPassage((current) => (current?.to === target && current.stage === "enter" ? null : current));
        launch?.classList.remove("is-launching");
      }, enter);
      passageTimers.current.push(enterTimer);
    }, leave);
    passageTimers.current.push(leaveTimer);
  };
  const openSection = (id, source) => travelTo(id, source, () => setQueryContext(undefined));
  const openQuery = (id, query, source, focusId) => {
    if (!queryDestinations(query, catalog, radioLogs)[id]) return false;
    travelTo(id, source, () => setQueryContext({ ...query, source_ids: querySourceIds(query), reference_documents: queryDocuments(query, catalog), ...(focusId ? { focus_id: focusId } : {}) }));
    return true;
  };
  const openCitedSource = (sourceId, query) => {
    const id = String(sourceId || "").trim().toUpperCase();
    if (!query?.answer?.trim() || query.failed || query.pending) return false;
    const document = catalog.find((doc) => String(doc.id || "").toUpperCase() === id);
    if (!document) return false;
    travelTo("archivio", null, () => setQueryContext({
      ...query,
      source_ids: querySourceIds(query),
      reference_documents: queryDocuments(query, catalog),
      focus_id: document.id,
    }));
    return true;
  };
  const openCitedTimeline = (sourceId, query) => {
    const id = String(sourceId || "").trim().toUpperCase();
    if (!querySourceIds(query).includes(id)) return false;
    const document = catalog.find((doc) => String(doc.id || "").toUpperCase() === id);
    if (!document) return false;
    return openQuery("timeline", query, null, document.id);
  };
  const openLatestQuery = (id, source) => openQuery(id, latestQuery, source);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState("rx");
  const [dictating, setDictating] = useState(false);
  const [notice, setNotice] = useState("");
  const [responseTime, setResponseTime] = useState(null);
  const [responseFailed, setResponseFailed] = useState(false);
  const [activeChat, setActiveChat] = useState(0);
  const [pageHeaderTarget, setPageHeaderTarget] = useState(null);
  const [responsePreferences, setResponsePreferences] = useState(readResponsePreferences);
  const [groqSaturated, setGroqSaturated] = useState(false);
  const [showcase, setShowcase] = useState(null);
  const groqWasSaturated = useRef(false);
  const logRef = useRef(null);
  const responseStartedAt = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);
  const sendRef = useRef(null);
  const dictatedRef = useRef("");
  const radioTheme = getRadioTheme(quality);
  const canTransmit = quality >= 55;
  const tune = (step) => setFrequency((current) => Math.min(MAX_FREQUENCY, Math.max(MIN_FREQUENCY, Number((current + step).toFixed(1)))));
  const qualityRef = useRef(quality);
  qualityRef.current = quality;

  useEffect(() => {
    const timer = window.setTimeout(() => setPhase((current) => current === "rx" ? "idle" : current), 2200);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    const latest = log.querySelector(".fieldlink-message:last-child");
    if (latest?.querySelector(".sql-briefing")) {
      log.scrollTop = Math.max(0, latest.offsetTop - 8);
      return;
    }
    log.scrollTop = log.scrollHeight;
  }, [messages, section]);
  useEffect(() => {
    if (!busy || responseStartedAt.current === null) return undefined;
    const update = () => {
      if (responseStartedAt.current !== null) setResponseTime((performance.now() - responseStartedAt.current) / 1000);
    };
    update();
    const timer = window.setInterval(update, 50);
    return () => window.clearInterval(timer);
  }, [busy]);
  const chatQuestions = messages.reduce((questions, message, index) => {
    if (message.role === "you") questions.push({ index, label: `Vai alla domanda ${questions.length + 1}` });
    return questions;
  }, []);
  const goToQuestion = (index) => {
    const target = logRef.current?.querySelectorAll(".fieldlink-message.you")[index];
    if (!target || !logRef.current) return;
    logRef.current.scrollTo({ top: target.offsetTop - 12, behavior: "smooth" });
    setActiveChat(index);
  };
  const trackChatScroll = () => {
    const log = logRef.current;
    if (!log || chatQuestions.length === 0) return;
    const questions = Array.from(log.querySelectorAll(".fieldlink-message.you"));
    const current = questions.reduce((best, question, index) => {
      const distance = Math.abs(question.getBoundingClientRect().top - log.getBoundingClientRect().top - 30);
      return distance < best.distance ? { index, distance } : best;
    }, { index: 0, distance: Infinity });
    setActiveChat(current.index);
  };
  useEffect(() => {
    if (!inputRef.current || inputRef.current.tagName !== "TEXTAREA") return;
    inputRef.current.style.height = "auto";
    inputRef.current.style.height = `${Math.min(144, Math.max(60, inputRef.current.scrollHeight))}px`;
  }, [input]);
  useEffect(() => () => { recognitionRef.current?.abort(); }, []);
  useEffect(() => { saveResponsePreferences(responsePreferences); }, [responsePreferences]);
  useEffect(() => {
    let active = true;
    const refreshGroqStatus = async () => {
      try {
        const response = await fetch(`${BACKEND}/api/health`);
        if (!response.ok) return;
        const status = await response.json();
        if (active) {
          const saturated = Boolean(status.backend?.groq?.saturo);
          setGroqSaturated(saturated);
          setShowcase(status.vetrina || null);
          if (saturated && !groqWasSaturated.current) onGroqSaturated?.();
          groqWasSaturated.current = saturated;
        }
      } catch {
        // Se lo stato non è raggiungibile, mantieni l'ultimo indicatore noto.
      }
    };
    refreshGroqStatus();
    const timer = window.setInterval(refreshGroqStatus, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [onGroqSaturated]);
  useEffect(() => {
    if (canTransmit) return;
    recognitionRef.current?.abort();
    setDictating(false);
    setPhase("idle");
  }, [canTransmit]);

  const send = useCallback(async (text, extra = {}) => {
    const question = text.trim();
    if (!question || busy || responseStartedAt.current !== null || quality < 55) return;
    const startedAt = performance.now();
    responseStartedAt.current = startedAt;
    const history = messages.map(({ role, text: content }) => ({ role: role === "you" ? "voi" : role, text: content }));
    setInput("");
    setNotice("");
    setBusy(true);
    setLatestQuery(null);
    setResponseTime(0);
    setResponseFailed(false);
    setPhase("tx");
    setMessages((current) => [...current, { role: "you", text: question, time: clockTime() }]);
    let answer = "";
    let respondent = "marco";
    let replyMetadata = {};
    let receiving = false;
    let failed = false;
    let responseSeconds;
    try {
      await streamReply({ session_id: sessionId, message: question, history, ...responsePreferences, guided: Boolean(extra.guided) }, (chunk) => {
        answer += chunk;
        if (!receiving) { receiving = true; setPhase("rx"); }
        setMessages((current) => {
          const last = current[current.length - 1];
          if (last?.role === "marco" && last.pending) return [...current.slice(0, -1), { ...last, text: answer }];
          return [...current, { role: "marco", respondent, text: answer, time: clockTime(), pending: true }];
        });
      }, (metadata) => { replyMetadata = { ...replyMetadata, ...metadata }; respondent = metadata.respondent_mode === "team" ? "team" : "marco"; });
      if (!answer.trim()) throw new Error("Risposta vuota");
    } catch (error) {
      failed = true;
      if (error.userMessage) {
        setNotice(error.userMessage);
        setPhase("idle");
        return;
      }
      if (!answer) answer = "Non riesco a collegarmi al servizio della chat. Riprova tra qualche secondo.";
      setNotice("Il servizio della chat non ha completato la risposta. Riprova a inviare il messaggio.");
    } finally {
      // Freeze the actual elapsed time before notifications and rendering.
      responseSeconds = (performance.now() - startedAt) / 1000;
      responseStartedAt.current = null;
      setResponseTime(responseSeconds);
      setResponseFailed(failed);
      setBusy(false);
    }
    const completedQuery = failed ? null : {
      id: `local-${window.crypto.randomUUID()}`, session_id: sessionId,
      question, answer: answer.trim(), created_at: new Date().toISOString(),
      source_ids: replyMetadata.source_ids || [], resolved_respondent_mode: respondent,
      resolved_processing_mode: replyMetadata.processing_mode,
    };
    if (completedQuery) setLatestQuery(completedQuery);
    notifyFieldlinkDataUpdated();
    setMessages((current) => {
      const last = current[current.length - 1];
      if (last?.role === "marco" && last.pending) return [...current.slice(0, -1), { ...last, text: answer.trim(), pending: false, responseSeconds, failed, query: completedQuery }];
      return [...current, { role: "marco", respondent, text: answer.trim(), time: clockTime(), responseSeconds, failed, query: completedQuery }];
    });
    setPhase("rx");

    window.setTimeout(() => setPhase((current) => current === "rx" ? "idle" : current), 1300);
    if (DANGER_WORDS.some((word) => answer.toLowerCase().includes(word))) onDanger();
  }, [busy, quality, messages, onDanger, responsePreferences, sessionId]);

  useEffect(() => { sendRef.current = send; }, [send]);

  const startDictation = () => {
    if (busy || dictating || !canTransmit) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { setNotice("Microfono non disponibile in questo browser. Scrivi il messaggio."); return; }
    const recognition = new SpeechRecognition();
    recognition.lang = "it-IT";
    recognition.interimResults = true;
    dictatedRef.current = "";
    recognitionRef.current = recognition;
    recognition.onresult = (event) => {
      const phrase = Array.from(event.results).map((result) => result[0].transcript).join(" ").trim();
      dictatedRef.current = phrase;
      setInput(phrase);
    };
    recognition.onerror = () => { setNotice("Microfono non disponibile. Puoi scrivere il messaggio."); setDictating(false); setPhase("idle"); };
    recognition.onend = () => {
      recognitionRef.current = null;
      setDictating(false);
      const phrase = dictatedRef.current.trim();
      if (phrase && qualityRef.current >= 55) sendRef.current?.(phrase);
      else setPhase("idle");
    };
    try { recognition.start(); setDictating(true); setPhase("tx"); setNotice("Ti ascolto. Rilascia per inviare."); }
    catch { setNotice("Impossibile attivare il microfono."); setDictating(false); setPhase("idle"); }
  };

  const stopDictation = () => { if (recognitionRef.current && dictating) recognitionRef.current.stop(); };
  const sectionTitle = section === "radio" ? "Console radio" : section === "timeline" ? "TIME LINE" : NAV.find((item) => item.id === section)?.label;

  return (
    <main className={`fieldlink-shell ${section === "archivio" ? "fieldlink-archive-shell" : ""} ${section === "timeline" ? "fieldlink-timeline-shell" : ""} ${section === "schema" ? "fieldlink-schema-shell" : ""} quality-${radioTheme.name} ${frequencyTuning ? "frequency-tuning" : ""}`} style={{ display: hidden ? "none" : undefined }} data-testid="fieldlink-dashboard">
      <FieldlinkRail latestDay={archive?.latest_day} section={section} onOpen={openSection} />

      <section
        ref={screenRef}
        className="fieldlink-screen"
        aria-label={`${sectionTitle} Fieldlink`}
        data-passage-stage={passage?.stage}
        data-passage={passage?.kind}
        data-passage-dir={passage?.dir}
        style={passage ? { "--passage-x": passage.origin.x, "--passage-y": passage.origin.y, "--passage-shift": PASSAGE_SHIFT[passage.lane] || "0px" } : undefined}
      >
        <header className={`fieldlink-topbar ${section === "radio" ? "fieldlink-radio-topbar" : "fieldlink-page-topbar"}`}>
          {section === "radio" ? <>
            <span className={`fieldlink-wave-wrap ${quality === 0 ? "no-signal" : quality < 35 ? "critical" : ""}`} role="img" aria-label={`Frequenza in onda ${quality < 35 ? "disturbata" : "stabile"}`}><RadioTrace active={phase !== "idle"} quality={quality} overlapped /></span>
            <div className="fieldlink-topbar-leading">
            <div className="fieldlink-metrics">
              <span className="fieldlink-strength" aria-label={`Segnale ${quality}%`}><strong>{quality}%</strong><i className="fieldlink-bars" aria-hidden="true">{[1, 2, 3, 4].map((bar) => <b className={quality >= [20, 40, 60, 80][bar - 1] ? "on" : ""} key={bar} />)}</i></span>
              <span className="fieldlink-battery"><Cpu size={17} />AI</span>
            </div>
            </div>
            <div className="fieldlink-topbar-trailing">
              <div className="fieldlink-tuner" aria-label="Frequenza radio">
                <span>Frequenza</span>
                <strong>{frequency.toFixed(1)} <small>MHz</small></strong>
                <button type="button" aria-label="Diminuisci frequenza" onClick={() => tune(-0.1)} disabled={frequency <= MIN_FREQUENCY}><Minus size={15} /></button>
                <button type="button" aria-label="Aumenta frequenza" onClick={() => tune(0.1)} disabled={frequency >= MAX_FREQUENCY}><Plus size={15} /></button>
              </div>
            </div>
          </> : <>
            <div className="fieldlink-page-heading">
              <h1 id="fieldlink-page-title" className="fieldlink-page-title">{sectionTitle}</h1>
              <span className="fieldlink-workspace-name">OPERAZIONE SILENZIO · A.N.I.M.A.{archive?.latest_day ? ` · DATI G1–G${archive.latest_day} · ${archive.total.toLocaleString("it-IT")} DOCUMENTI` : ""}</span>
            </div>
            <div className="fieldlink-page-header-slot" ref={setPageHeaderTarget} />
          </>}
        </header>
        {section === "radio" && (
          <div className="fieldlink-response-line">
            <span className={`fieldlink-position fieldlink-response-time ${busy ? "measuring" : ""}`} role="status" aria-live={busy ? "off" : "polite"} title="Tempo dall'invio alla ricezione completa"><i /><span>{responseFailed ? "TEMPO TENTATIVO" : "TEMPO RISPOSTA"}</span><strong>{responseTime === null ? "—" : `${responseTime.toFixed(2).replace(".", ",")} s`}</strong></span>
            {showcase?.simulata && <span className="fieldlink-showcase-flag" title={showcase.motivo || "Percorso guidato, senza modello"}>Vetrina simulata</span>}
          </div>
        )}
        <PageHeaderTarget.Provider value={pageHeaderTarget}>
        <div className="fieldlink-body">
          {section === "radio" ? <>
            <LetterGlitch
              className="fieldlink-chat-glitch"
              glitchColors={radioTheme.colors}
              baseColor={radioTheme.base}
              fontSize={14}
              spacing={0.6}
              density={0.75}
              baseOpacity={0.18}
              glitchAmount={0.26}
              speed={0.5}
              flow={0.35}
              clickEffect="none"
              edgeFade={0.08}
              centerFade={1}
              cursorRadius={110}
              lightMode={false}
              smooth
              interactive
              aria-hidden="true"
            />
            <div className={`fieldlink-conversation${messages.length === 1 ? " is-booting" : ""}`}>
              <div className={`fieldlink-log ${messages.length === 1 ? "is-opening" : ""}`} ref={logRef} onScroll={trackChatScroll} role="log" aria-label="Conversazione con A.N.I.M.A." aria-live="polite" data-testid="radio-log">
                {messages.length === 1 && <AnimaBoot canTransmit={canTransmit} />}
                {messages.map((message, index) => (
                  <article className={`fieldlink-message ${message.role}`} key={`${message.role}-${index}`}>
                    <div className="fieldlink-message-meta">
                      <strong>{message.role === "marco" ? message.respondent === "team" ? "Team investigativo" : "A.N.I.M.A." : "Tu"}</strong>
                      <time>{message.time}</time>
                      {message.responseSeconds !== undefined && <span className="fieldlink-message-duration">{message.failed ? "Interrotta dopo" : "Risposta in"} {message.responseSeconds.toFixed(2).replace(".", ",")} s</span>}
                    </div>
                    {message.role === "marco" ? (
                      <ModelResponseRenderer
                        text={message.text}
                        quality={quality}
                        respondent={message.respondent || "marco"}
                        pending={message.pending}
                        groqSaturated={groqSaturated}
                        onOpen={queryDestinations(message.query).database ? (id) => openQuery(id, message.query) : undefined}
                        onOpenSource={message.pending ? undefined : (sourceId) => openCitedSource(sourceId, message.query)}
                        onOpenTimeline={message.pending ? undefined : (sourceId) => openCitedTimeline(sourceId, message.query)}
                        onOpenDatabase={message.pending ? undefined : () => openQuery("database", message.query)}
                        onAsk={message.pending ? undefined : send}
                      />
                    ) : (
                      <div className="model-response-unstructured model-response-section section-answer">
                        <div className="model-response-plain-text">
                          <p><TypedText text={message.text || ""} quality={quality} animate={quality < 85} typewriter={false} /></p>
                        </div>
                      </div>
                    )}
                    <CopyMessageButton text={message.text} pending={message.pending} />
                  </article>
                ))}
              </div>
              {chatQuestions.length > 0 && <nav className="fieldlink-chat-dots" aria-label="Navigazione delle domande">{chatQuestions.map((question, index) => <button key={question.index} type="button" className={activeChat === index ? "active" : ""} aria-label={question.label} aria-current={activeChat === index ? "location" : undefined} onClick={() => goToQuestion(index)} />)}</nav>}
              <footer className="fieldlink-footer">
                <div className="fieldlink-terminal-console">
                  <form className="fieldlink-terminal-bar" onSubmit={(event) => { event.preventDefault(); send(input); }}>
                    <label className="fieldlink-sr-only" htmlFor="fieldlink-input">Scrivi ad A.N.I.M.A.</label>
                    <input
                      ref={inputRef}
                      id="fieldlink-input"
                      type="text"
                      data-testid="radio-input"
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      disabled={busy || !canTransmit}
                      placeholder={busy ? "In trasmissione…" : !canTransmit ? "Sintonizza 156.8 MHz per trasmettere" : "Da quale indizio partiamo?"}
                      autoComplete="off"
                    />
                    <button
                      className={`fieldlink-terminal-mic ${dictating ? "recording" : ""}`}
                      type="button"
                      disabled={busy || !canTransmit}
                      aria-label={dictating ? "Interrompi dettatura" : "Tieni premuto per parlare"}
                      title={dictating ? "Rilascia per trasmettere" : "Tieni premuto per parlare"}
                      onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); startDictation(); }}
                      onPointerUp={stopDictation}
                      onPointerCancel={stopDictation}
                      onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && !event.repeat) { event.preventDefault(); startDictation(); } }}
                      onKeyUp={(event) => { if (event.key === "Enter" || event.key === " ") stopDictation(); }}
                    >
                      <Mic size={17} strokeWidth={1.8} />
                      <span>{dictating ? "In ascolto" : "Parla"}</span>
                    </button>
                    <button
                      className="fieldlink-terminal-send"
                      type="submit"
                      disabled={busy || !input.trim() || !canTransmit}
                      aria-label="Invia messaggio"
                    >
                      <span>INVIA</span>
                    </button>
                  </form>
                  <div className="fieldlink-terminal-subbar">
                    <div className="fieldlink-terminal-subbar-left">
                      <ResponsePreferences value={responsePreferences} onChange={setResponsePreferences} disabled={busy || dictating} />
                      {notice ? (
                        <span className="fieldlink-terminal-hint" role="status">
                          * {notice}
                        </span>
                      ) : null}
                    </div>
                    <QueryShortcuts onOpen={openLatestQuery} disabled={busy} query={latestQuery} documents={catalog} logs={radioLogs} />
                  </div>
                </div>
              </footer>
            </div>
          </> : section === "vetrina" ? <FieldlinkVetrina busy={busy} simulata={Boolean(showcase?.simulata)} motivo={showcase?.motivo || ""} onAsk={(question) => { openSection("radio"); send(question, { guided: true }); }} /> : <FieldlinkSectionPage section={section} unlocked={unlocked} fresh={fresh} activity={activity} onOpen={openSection} query={queryContext} documents={liveDocuments} />}
        </div>
        </PageHeaderTarget.Provider>
      </section>
    </main>
  );
}
