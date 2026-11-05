import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  ArrowUpRight,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  Gauge,
  HelpCircle,
  Info,
  Lightbulb,
  Link2,
  Radio,
  Search,
  ShieldAlert,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

const SECTION_LABELS = "RISPOSTA(?:\\s+(?:PRINCIPALE|DOCUMENTALE|DAI DOCUMENTI|DEI DOCUMENTI))?|SINTESI|COLLEGAMENTI(?:\\s+(?:TRA DOCUMENTI|RAPIDI))?|PROVENIENZA(?:\\s+DEI RISCONTRI)?|IPOTESI PLAUSIBILE|IPOTESI|LIVELLO DI CERTEZZA|CERTEZZA|COSA MANCA(?:\\s*\\/\\s*INCERTEZZE(?:\\s+APERTE)?)?|ELEMENTI MANCANTI(?:\\s*\\/\\s*DA VERIFICARE)?|FONTI(?:\\s+(?:CITATE|RECUPERATE)|\\s*(?:&|E)\\s*ATTENDIBILIT[AÀ])?";
const RELIABILITY = {
  verified: { label: "Verificata", icon: ShieldCheck, cls: "status-verified" },
  unconfirmed: { label: "Da verificare", icon: HelpCircle, cls: "status-unconfirmed" },
  disputed: { label: "Contestata", icon: ShieldAlert, cls: "status-disputed" },
  missing: { label: "Non disponibile", icon: FileText, cls: "status-missing" },
};
const CitationContext = createContext(new Map());
const OpenSourceContext = createContext(null);
const OpenTimelineContext = createContext(null);
const OpenDatabaseContext = createContext(null);
const EMOJI_SEQUENCE = /(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}[\uFE0E\uFE0F]?\p{Emoji_Modifier}?(?:\u200D\p{Extended_Pictographic}[\uFE0E\uFE0F]?\p{Emoji_Modifier}?)*)/gu;
const INLINE_ICONS = [
  { symbols: ["✅", "✔", "☑", "🟢", "🟩"], icon: ShieldCheck, label: "Confermato", tone: "verified" },
  { symbols: ["🟡", "🟨", "❓"], icon: HelpCircle, label: "Da verificare", tone: "unconfirmed" },
  { symbols: ["🔴", "🟥", "⛔", "🚫", "❌"], icon: ShieldAlert, label: "Contestato", tone: "disputed" },
  { symbols: ["⚫", "⚪", "⬛", "⬜"], icon: FileText, label: "Non disponibile", tone: "missing" },
  { symbols: ["⚠", "❗", "🚨"], icon: AlertTriangle, label: "Attenzione", tone: "unconfirmed" },
  { symbols: ["📢", "📣", "📻", "📡"], icon: Radio, label: "Comunicazione radio" },
  { symbols: ["📌", "📎", "📄", "📚", "📝"], icon: FileText, label: "Documento" },
  { symbols: ["🔎", "🔍"], icon: Search, label: "Indagine" },
  { symbols: ["💡"], icon: Lightbulb, label: "Ipotesi" },
  { symbols: ["👥"], icon: UsersRound, label: "Squadra" },
  { symbols: ["🕒", "⏰", "⌚"], icon: Clock3, label: "Orario" },
];

function renderReportIcons(value) {
  const parts = [];
  let cursor = 0;
  for (const match of value.matchAll(EMOJI_SEQUENCE)) {
    if (match.index > cursor) parts.push(value.slice(cursor, match.index));
    const symbol = match[0].replace(/[\uFE0E\uFE0F]/g, "");
    if (symbol.endsWith("\u20E3")) {
      parts.push(symbol.slice(0, -1));
    } else {
      const meta = INLINE_ICONS.find((item) => item.symbols.includes(symbol));
      const Icon = meta?.icon || Info;
      parts.push(<span key={`icon-${match.index}`} className="model-response-inline-icon" role="img" aria-label={meta?.label || "Informazione"}><Icon size={14} strokeWidth={1.6} aria-hidden="true" /></span>);
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) parts.push(value.slice(cursor));
  return parts;
}

function normalizeModelHeadings(text) {
  const boldHeadings = new RegExp(
    `(?:\\p{Extended_Pictographic}[\\uFE0E\\uFE0F]?\\s*)?(?:\\*\\*|__)\\s*(${SECTION_LABELS})\\s*:?[ \\t]*(?:\\*\\*|__)\\s*(?::|·)?`,
    "giu",
  );

  return text
    .replace(new RegExp(`(^|\\n)[ \\t]*#{1,6}[ \\t]+(${SECTION_LABELS})[ \\t]*:?[ \\t]*(?=\\r?$)`, "gim"), "$1$2:\n")
    .replace(boldHeadings, "\n$1:\n")
    .replace(
      /(^|[.!?]\s+)(?:\*\*)?CERTEZZA\s+(molto\s+alta|alta|media|bassa|molto\s+bassa)(?:\*\*)?\.?/gim,
      "$1\nCERTEZZA:\n$2\n",
    );
}

function getSourceReliability(line) {
  if (line.includes("⚫") || /assente|non disponibile|non recuperabile/i.test(line)) return "missing";
  if (line.includes("🔴") || /contestat[ao]|sospett[ao]|anomalia|sospetta/i.test(line)) return "disputed";
  if (line.includes("🟡") || /da verificare|da riscontrare|dichiarazione|non (?:verificat|confermat)[ao]|non usat[ao] come prova|recuperat[ao] dal dossier|incongruenz|fonte centrale|testimone|\bcentrale\b/i.test(line)) return "unconfirmed";
  if (line.includes("🟢") || /confermat[ao]|verificat[ao]|accertat[ao]|ufficiale|schema del database|misura diretta|risultato della query/i.test(line)) return "verified";
  return "unconfirmed";
}

/** Parse section labels even when the model puts Markdown labels inline. */
export function parseModelResponse(rawText) {
  if (!rawText || typeof rawText !== "string") {
    return { isStructured: false, raw: "", title: "", lead: "", answer: "", links: "", provenance: "", hypothesis: "", confidence: "", missing: "", sources: [] };
  }

  const raw = rawText.trim();
  const clean = normalizeModelHeadings(raw);
  const sectionPattern = new RegExp(
    `(?:^|\\n)[ \\t]*(?:#{1,6}[ \\t]+)?(?:\\p{Extended_Pictographic}[\\uFE0E\\uFE0F]?[ \\t]*)?(${SECTION_LABELS})[ \\t]*:[ \\t]*(?:\\r?\\n)?`,
    "giu",
  );
  const sections = [];
  let match;
  while ((match = sectionPattern.exec(clean)) !== null) {
    sections.push({
      label: match[1].toUpperCase().replace(/\s+/g, " ").trim(),
      start: match.index,
      contentStart: sectionPattern.lastIndex,
    });
  }

  if (sections.length === 0) {
    return { isStructured: false, raw, title: "", lead: "", answer: "", links: "", provenance: "", hypothesis: "", confidence: "", missing: "", sources: [] };
  }

  const parsed = { isStructured: true, raw, title: "", lead: "", answer: "", links: "", provenance: "", hypothesis: "", confidence: "", missing: "", sources: [] };
  const beforeFirstSection = clean.slice(0, sections[0].start).trim();
  const hasAnswerSection = sections.some(({ label }) => /^(RISPOSTA|SINTESI)/.test(label));

  if (beforeFirstSection) {
    const lines = beforeFirstSection.split(/\r?\n/);
    const titleIndex = lines.findIndex((line) => line.trim());
    const titleLine = titleIndex < 0 ? "" : lines[titleIndex].trim();
    const looksLikeReportTitle = titleLine.length <= 100 && /^(?:[📢📻🔎]\s*)?(?:["'\[*_]*)(?:RAPPORTO|ANALISI|RESOCONTO|SINTESI TEAM)\b/iu.test(titleLine);

    if (looksLikeReportTitle) {
      parsed.title = titleLine.replace(/^["'\[\*_]+|["'\]\*_]+$/g, "").trim();
      const remaining = lines.slice(titleIndex + 1).join("\n").trim();
      if (hasAnswerSection) parsed.lead = remaining;
      else parsed.answer = remaining;
    } else if (hasAnswerSection) {
      parsed.lead = beforeFirstSection;
    } else {
      // Older answers can begin with the answer itself and omit the RISPOSTA label.
      parsed.answer = beforeFirstSection;
    }
  }

  sections.forEach((section, index) => {
    const end = sections[index + 1]?.start ?? clean.length;
    const content = clean.slice(section.contentStart, end).trim();
    if (!content) return;

    if (/^(RISPOSTA|SINTESI)/.test(section.label)) parsed.answer = [parsed.answer, content].filter(Boolean).join("\n\n");
    else if (section.label.startsWith("COLLEGAMENTI")) parsed.links = [parsed.links, content].filter(Boolean).join("\n\n");
    else if (section.label.startsWith("PROVENIENZA")) parsed.provenance = [parsed.provenance, content].filter(Boolean).join("\n\n");
    else if (section.label.startsWith("IPOTESI")) parsed.hypothesis = [parsed.hypothesis, content].filter(Boolean).join("\n\n");
    else if (section.label.includes("CERTEZZA")) parsed.confidence = [parsed.confidence, content].filter(Boolean).join("\n\n");
    else if (/^(COSA MANCA|ELEMENTI MANCANTI)/.test(section.label)) parsed.missing = [parsed.missing, content].filter(Boolean).join("\n\n");
    else if (section.label.startsWith("FONTI")) {
      content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => {
        const idMatch = line.match(/\[([A-Za-z0-9_.\/-]+)\]/);
        const text = line
          .replace(/^(?:[-*•]|\d+[.)])?\s*/, "")
          .replace(/^[\u{1F7E0}-\u{1F7EB}\u{1F534}\u{26AB}\u{26AA}\u{1F7E2}\u{1F7E1}\u{26D4}\u{2705}\u{26A0}\u{1F4CC}\u{1F4E2}\u{1F4FB}\u{1F50E}\s]+/u, "")
          .replace(/^(?:\*\*|__)?\[[A-Za-z0-9_.\/-]+\](?:\*\*|__)?\s*/, "")
          .replace(/^[·:–—-]\s*/, "")
          .trim();
        if (!text && !idMatch) return;
        const usage = /non usat[ao] come prova|recuperat[ao] dal dossier/i.test(line) ? "secondary"
          : /usat[ao] come prova/i.test(line) ? "evidence" : "unknown";
        const description = text.replace(/\s*[—–-]\s*(?:recuperat[ao] dal dossier,\s*non usat[ao] come prova|usat[ao] come prova)\s*$/i, "");
        const [title, ...details] = description.split(/\s+·\s+/);
        parsed.sources.push({ type: getSourceReliability(line), id: idMatch?.[1] || null, text, title, details: details.join(" · "), usage, raw: line });
      });
    }
  });

  return parsed;
}

function CitationPreview({ id, source, status, StatusIcon, actionable, onOpen, onOpenTimeline, onOpenDatabase }) {
  return (
    <>
      <span className="model-citation-popover-id">[{id}]</span>
      <strong className="model-citation-popover-title">{renderReportIcons(source?.title || "Fonte non elencata nella risposta")}</strong>
      {source?.details && <span className="model-citation-popover-detail">{source.details}</span>}
      <span className="source-badge"><StatusIcon size={13} aria-hidden="true" />{source ? status.label : "Verifica non disponibile"}</span>
      {source?.usage !== "unknown" && source?.usage && <span className="model-citation-popover-usage">{source.usage === "evidence" ? "Usata come prova" : "Recuperata dal dossier · non usata come prova"}</span>}
      {(actionable || onOpenTimeline || onOpenDatabase) && <div className="model-citation-popover-actions">
        {actionable && <button type="button" className="model-citation-popover-action" onClick={onOpen}>Apri nelle prove <ArrowUpRight size={13} aria-hidden="true" /></button>}
        {onOpenTimeline && <button type="button" className="model-citation-popover-action" onClick={onOpenTimeline}>Apri nella timeline <ArrowUpRight size={13} aria-hidden="true" /></button>}
        {onOpenDatabase && <button type="button" className="model-citation-popover-action" onClick={onOpenDatabase}>Apri nel database <ArrowUpRight size={13} aria-hidden="true" /></button>}
      </div>}
    </>
  );
}

function CitationChip({ id }) {
  const sources = useContext(CitationContext);
  const openSource = useContext(OpenSourceContext);
  const openTimeline = useContext(OpenTimelineContext);
  const openDatabase = useContext(OpenDatabaseContext);
  const source = sources.get(id.toUpperCase());
  const isDatabasePath = /(?:^|\/)accessi\.sqlite$/i.test(id);
  const status = RELIABILITY[source?.type] || RELIABILITY.unconfirmed;
  const StatusIcon = status.icon;
  const [open, setOpen] = useState(false);
  const closeTimer = useRef(null);
  const trigger = useRef(null);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const show = () => {
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hide = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 160);
  };
  const openInProve = () => {
    if (!openSource?.(id)) return false;
    window.clearTimeout(closeTimer.current);
    setOpen(false);
    return true;
  };
  const openInTimeline = () => {
    if (!openTimeline?.(id)) return false;
    window.clearTimeout(closeTimer.current);
    setOpen(false);
    return true;
  };
  const openInDatabase = () => {
    if (!openDatabase?.()) return false;
    window.clearTimeout(closeTimer.current);
    setOpen(false);
    return true;
  };
  const chipLabel = isDatabasePath ? "accessi.sqlite" : `[${id}]`;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          ref={trigger}
          type="button"
          className={`model-citation-chip ${status.cls}`}
          aria-label={isDatabasePath ? `Apri il database ${id}` : `Fonte ${id}: ${source ? status.label.toLowerCase() : "non elencata"}`}
          title={isDatabasePath ? id : undefined}
          onMouseEnter={show}
          onMouseLeave={() => { if (document.activeElement !== trigger.current) hide(); }}
          onFocus={show}
          onBlur={hide}
          onClick={(event) => { event.preventDefault(); show(); }}
        >{chipLabel}</button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={`model-citation-popover ${status.cls}`}
          side="top"
          align="start"
          sideOffset={7}
          collisionPadding={12}
          aria-label={`Anteprima fonte ${id}`}
          onMouseEnter={show}
          onMouseLeave={hide}
          onFocus={show}
          onBlur={hide}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <CitationPreview id={id} source={source} status={status} StatusIcon={StatusIcon} actionable={Boolean(openSource && !isDatabasePath)} onOpen={openInProve} onOpenTimeline={openTimeline && !isDatabasePath ? openInTimeline : null} onOpenDatabase={isDatabasePath && openDatabase ? openInDatabase : null} />
          <Popover.Arrow className="model-citation-popover-arrow" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function renderTextTokens(value) {
  const parts = [];
  const pattern = /\[([A-Za-z0-9_.\/-]+)\]|\b[A-Z]{1,5}-?\d+(?:[-_]\d+)*\b/g;
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    if (match.index > cursor) parts.push(...renderReportIcons(value.slice(cursor, match.index)));
    parts.push(match[1]
      ? <CitationChip key={`citation-${match.index}`} id={match[1]} />
      : <code key={`code-${match.index}`} className="model-inline-code">{match[0]}</code>);
    cursor = match.index + match[0].length;
  }
  if (cursor < value.length) parts.push(...renderReportIcons(value.slice(cursor)));
  return parts;
}

function renderInlineText(value) {
  let text = value;
  const starCount = (text.match(/\*/g) || []).length;
  if (text.startsWith("*") && !text.startsWith("**") && starCount % 2 === 1) text = text.slice(1);

  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|(?<!\w)_[^_]+_(?!\w))/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={`inline-${index}`} className="model-inline-code">{part.slice(1, -1)}</code>;
    }
    if ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__"))) {
      return <strong key={`strong-${index}`}>{renderTextTokens(part.slice(2, -2))}</strong>;
    }
    if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_"))) {
      return <em key={`em-${index}`}>{renderTextTokens(part.slice(1, -1))}</em>;
    }
    return <React.Fragment key={`text-${index}`}>{renderTextTokens(part)}</React.Fragment>;
  });
}

function renderProseText(value) {
  if (!value?.trim()) return null;

  const blocks = [];
  let paragraph = [];
  let list = [];
  let listType = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };
  const flushList = () => {
    if (!list.length) return;
    blocks.push({ type: listType, items: list });
    list = [];
    listType = null;
  };

  value.trim().split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (/^(?:\*{1,3}|_{1,3}|`{1,3})$/.test(trimmed)) return;
    const bullet = trimmed.match(/^[-*•–—]\s+(.+)$/);
    const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (!trimmed) {
      flushParagraph();
      flushList();
    } else if (bullet || numbered) {
      flushParagraph();
      const nextType = numbered ? "ordered" : "unordered";
      if (listType && listType !== nextType) flushList();
      listType = nextType;
      list.push((bullet || numbered)[1]);
    } else {
      flushList();
      paragraph.push(trimmed);
    }
  });

  flushParagraph();
  flushList();
  return blocks.map((block, index) => {
    if (block.type === "paragraph") return <p key={`p-${index}`}>{renderInlineText(block.text)}</p>;
    const List = block.type === "ordered" ? "ol" : "ul";
    return <List key={`list-${index}`}>{block.items.map((item, itemIndex) => <li key={`item-${itemIndex}`}>{renderInlineText(item)}</li>)}</List>;
  });
}

// Archived replies contain literal, multiline excerpts. Only promote complete
// quote + attribution lines, so ordinary prose and partial streams stay intact.
function renderReadableText(value) {
  if (!value?.trim()) return null;
  const passagePattern = /(?:^|\r?\n)[ \t]*«([\s\S]*?)»[ \t]*[—–-][ \t]*\[([A-Za-z0-9_-]+)\](?:[ \t]+([A-Za-z0-9_.-]+\.(?:txt|pdf|html?|md|docx?)))?(?:[ \t]*(·[ \t]*raccolta giorno[ \t]+\d+))?(?=[ \t]*(?:\r?\n|$))/g;
  const passages = [...value.matchAll(passagePattern)];
  if (!passages.length) return renderProseText(value);

  const blocks = [];
  let cursor = 0;
  let group = [];
  let start = 1;
  const flushPassages = () => {
    if (!group.length) return;
    blocks.push(
      <ol className="model-response-passages" start={start} key={`passages-${start}`}>
        {group.map((passage, index) => (
          <li className="model-response-passage" key={`passage-${start + index}`}>
            <blockquote><p className="model-response-passage-text">{renderInlineText(passage[1])}</p></blockquote>
            <footer className="model-response-passage-source">
              <FileText size={13} aria-hidden="true" />
              <CitationChip id={passage[2]} />
              {passage[3] && <span className="model-response-passage-filename">{passage[3]}</span>}
              {passage[4] && <span>{passage[4]}</span>}
            </footer>
          </li>
        ))}
      </ol>,
    );
    start += group.length;
    group = [];
  };

  passages.forEach((passage) => {
    const before = value.slice(cursor, passage.index);
    if (before.trim()) {
      flushPassages();
      blocks.push(<React.Fragment key={`prose-${cursor}`}>{renderProseText(before)}</React.Fragment>);
    }
    group.push(passage);
    cursor = passage.index + passage[0].length;
  });
  flushPassages();
  const remainder = value.slice(cursor);
  if (remainder.trim()) blocks.push(<React.Fragment key="prose-tail">{renderProseText(remainder)}</React.Fragment>);
  return blocks;
}

function ResponseSection({ className, label, icon: Icon, children, caution = false }) {
  return (
    <section className={`model-response-section ${className}`} aria-label={label}>
      <div className="model-response-section-header">
        <Icon size={15} className="section-icon" aria-hidden="true" />
        <h3 className="section-title">{label}</h3>
        {caution && <span className="model-response-caution-tag">DA CONFERMARE</span>}
      </div>
      <div className="model-response-section-content">{children}</div>
    </section>
  );
}

function ResponseSources({ sources }) {
  if (!sources.length) return null;
  return (
    <ResponseSection className="section-sources" label="Fonti e attendibilità" icon={FileText}>
      <ul className="model-response-sources">
        {sources.map((source, index) => {
          const status = RELIABILITY[source.type] || RELIABILITY.unconfirmed;
          const StatusIcon = status.icon;
          return (
            <li className={`model-response-source ${status.cls}`} key={`${source.id || source.title}-${index}`}>
              <StatusIcon size={15} aria-hidden="true" />
              <span className="model-response-source-copy">
                {source.id && <CitationChip id={source.id} />}
                <strong>{renderInlineText(source.title || source.text)}</strong>
                {source.details && <small>{renderInlineText(source.details)}</small>}
                {source.usage !== "unknown" && source.usage && <small>{source.usage === "evidence" ? "Usata come prova" : "Recuperata dal dossier · non usata come prova"}</small>}
              </span>
              <span className="model-response-source-status">{status.label}</span>
            </li>
          );
        })}
      </ul>
    </ResponseSection>
  );
}

export default function ModelResponseContent({ text, pending = false, onOpenSource, onOpenTimeline, onOpenDatabase }) {
  if (!text) {
    return <span className="model-response-waiting"><i /><i /><i /> Ricezione trasmissione in corso…</span>;
  }

  const parsed = parseModelResponse(text);
  const sourceIndex = new Map(parsed.sources.filter((source) => source.id).map((source) => [source.id.toUpperCase(), source]));
  if (!parsed.isStructured) {
    return (
      <OpenSourceContext.Provider value={onOpenSource || null}>
        <OpenTimelineContext.Provider value={onOpenTimeline || null}>
        <OpenDatabaseContext.Provider value={onOpenDatabase || null}>
        <CitationContext.Provider value={sourceIndex}>
          <div className="model-response-unstructured model-response-section section-answer">
            <div className="model-response-plain-text">{renderReadableText(text)}</div>
            {pending && <span className="model-response-cursor">▌</span>}
          </div>
        </CitationContext.Provider>
        </OpenDatabaseContext.Provider>
        </OpenTimelineContext.Provider>
      </OpenSourceContext.Provider>
    );
  }

  const confidenceValue = parsed.confidence.toLowerCase();
  const confidenceDisplay = parsed.confidence.replace(/[.!\s]+$/g, "");
  const confidenceClass = /bassa/.test(confidenceValue) ? "is-low" : /alta/.test(confidenceValue) ? "is-high" : "is-medium";
  const answer = [parsed.lead, parsed.answer].filter(Boolean).join("\n\n");
  const visibleReferences = [answer, parsed.links, parsed.hypothesis, parsed.confidence, parsed.missing].join("\n");
  const referencedSources = new Set([...visibleReferences.matchAll(/\[([A-Za-z0-9_.\/-]+)\]/g)].map((match) => match[1].toUpperCase()));
  const unmentionedSources = parsed.sources.filter((source) => {
    const sourceId = source.id || source.raw.match(/\[([A-Za-z0-9_.\/-]+)\]/)?.[1];
    return !sourceId || !referencedSources.has(sourceId.toUpperCase());
  });

  return (
    <OpenSourceContext.Provider value={onOpenSource || null}>
    <OpenTimelineContext.Provider value={onOpenTimeline || null}>
    <OpenDatabaseContext.Provider value={onOpenDatabase || null}>
    <CitationContext.Provider value={sourceIndex}>
      <div className="model-response-structured-card" data-testid="model-structured-response">
        {answer && <ResponseSection className="section-answer" label="Risposta" icon={CheckCircle2}>{renderReadableText(answer)}</ResponseSection>}
        {parsed.links && <ResponseSection className="section-links" label="Collegamenti tra documenti" icon={Link2}>{renderReadableText(parsed.links)}</ResponseSection>}
        {parsed.hypothesis && <ResponseSection className="section-hypothesis" label="Ipotesi" icon={Lightbulb} caution>{renderReadableText(parsed.hypothesis)}</ResponseSection>}
        {parsed.confidence && (
          <section className={`model-response-section section-confidence ${confidenceClass}`} aria-label="Grado di certezza">
            <Gauge size={16} aria-hidden="true" />
            <h3 className="section-title">Grado di certezza</h3>
            <strong className="model-response-confidence-value">{renderInlineText(confidenceDisplay)}</strong>
          </section>
        )}
        {parsed.missing && <ResponseSection className="section-missing" label="Cosa manca" icon={AlertTriangle}>{renderReadableText(parsed.missing)}</ResponseSection>}
        <ResponseSources sources={unmentionedSources} />
        {pending && <div className="model-response-live-indicator" role="status" aria-live="polite"><span className="live-dot" /><span>Risposta in arrivo…</span></div>}
      </div>
    </CitationContext.Provider>
    </OpenDatabaseContext.Provider>
    </OpenTimelineContext.Provider>
    </OpenSourceContext.Provider>
  );
}
