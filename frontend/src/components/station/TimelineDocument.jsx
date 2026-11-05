import { Archive, CalendarDays, Clock3, FileText, Hash, RadioTower, TriangleAlert, Zap } from "lucide-react";

export function parseTimelineDocument(event) {
  const sourceId = event.id?.replace(/^document:/, "") || "";
  const lines = (event.content || "").trim().split(/\r?\n/);
  const separator = lines.findIndex(line => !line.trim());
  const prelude = lines.slice(0, separator < 0 ? lines.length : separator);
  const hasHeader = prelude.some(line => [event.title?.trim(), `ID ${sourceId}`, `Documento: ${sourceId}`].includes(line.trim()));
  let archive = "";
  let cursor = 0;
  while (hasHeader && cursor < lines.length) {
    const line = lines[cursor].trim();
    if (!line) { cursor += 1; break; }
    if (/^ARCHIVIO\s+/i.test(line)) archive = line;
    else if (line !== event.title?.trim() && line !== `ID ${sourceId}` && line !== `Documento: ${sourceId}`) break;
    cursor += 1;
  }
  const timing = (event.title || "").match(/\s*[—–-]\s*giorno operativo\s+(\d{1,2})(?:,?\s*ore\s+((?:[01]?\d|2[0-3]):[0-5]\d))?\s*$/i);
  const title = timing ? event.title.slice(0, timing.index).trim() : event.title;
  return {
    title: title || event.title || "Documento",
    sourceId: sourceId.startsWith("generated-") ? "" : sourceId,
    archive,
    operationalDay: timing?.[1] || "",
    time: timing?.[2] || "",
    paragraphs: lines.slice(cursor).join("\n").trim().split(/\n\s*\n/).filter(Boolean),
  };
}

// Highlight the original wording; a missing check is never shown as confirmation.
const TOKEN_PATTERN = /(?<warning>[^.!?\n]*\b(?:non\s+(?:(?:è|e')\s+)?(?:stat[oa]\s+)?(?:ricontrollat[oa]|verificat[oa]|confermat[oa])|da\s+(?:verificare|confermare)|senza\s+(?:verifica|conferma))\b[^.!?\n]*[.!?]?)|(?<code>\b[A-Z][A-Z0-9]{0,5}-\d{2,}\b)|(?<place>\b(?:[Rr]ipetitore|[Ll]aboratorio|[Cc]abina|[Mm]agazzino|[Pp]iazza|[Gg]alleria)\s+\p{Lu}[\p{L}\p{N}’'-]*(?:\s+\p{Lu}[\p{L}\p{N}’'-]*){0,2})|(?<state>\b(?:[Aa]limentazione presente|[Rr]icezione stabile|[Tt]rasmissione regolare)\b)|(?<time>\b(?:[Oo]re\s+)?(?:[01]?\d|2[0-3]):[0-5]\d\b)/gu;

export function timelineDocumentTokens(text) {
  const tokens = [];
  let cursor = 0;
  for (const match of text.matchAll(TOKEN_PATTERN)) {
    if (match.index > cursor) tokens.push({ kind: "text", text: text.slice(cursor, match.index) });
    tokens.push({ kind: Object.keys(match.groups).find(key => match.groups[key] !== undefined), text: match[0] });
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) tokens.push({ kind: "text", text: text.slice(cursor) });
  return tokens;
}

function Paragraph({ text }) {
  const communication = /trasmission|ripetitore|segnal|radio|ricezion/i.test(text);
  const archived = /\bcopi[ae]\b|archivio|scorte|consegna/i.test(text);
  const electrical = /batteri|alimentazion|circuit|quadro|elettric/i.test(text);
  const Icon = communication ? RadioTower : archived ? Archive : electrical ? Zap : FileText;
  return <div className={`fl-document-paragraph ${communication ? "is-communication" : archived ? "is-archive" : ""}`}>
    <Icon className="fl-document-paragraph-icon" size={18} strokeWidth={1.6} aria-hidden="true" />
    <p>{timelineDocumentTokens(text).map((token, index) => token.kind === "text" ? token.text
      : <mark key={index} className={`fl-document-token token-${token.kind}`}>
        {token.kind === "warning" && <TriangleAlert size={14} aria-hidden="true" />}{token.text}
      </mark>)}</p>
  </div>;
}

export default function TimelineDocument({ event }) {
  const document = parseTimelineDocument(event);
  return <article className="fl-document" aria-label={event.title}>
    <header className="fl-document-header">
      <div className="fl-document-title"><FileText size={24} strokeWidth={1.5} aria-hidden="true" /><h3>{document.title}</h3></div>
      <div className="fl-document-meta">
        {document.archive && <span className="fl-document-meta-item meta-archive"><Archive size={14} aria-hidden="true" />{document.archive}</span>}
        {document.sourceId && <span className="fl-document-meta-item meta-code"><Hash size={14} aria-hidden="true" />{document.sourceId}</span>}
        {document.operationalDay && <span className="fl-document-meta-item meta-day"><CalendarDays size={14} aria-hidden="true" />Giorno operativo {document.operationalDay}</span>}
        {document.time && <span className="fl-document-meta-item meta-time"><Clock3 size={14} aria-hidden="true" /><time dateTime={document.time}>{document.time}</time></span>}
      </div>
    </header>
    <div className="fl-document-body">
      {document.paragraphs.length ? document.paragraphs.map((paragraph, index) => <Paragraph key={index} text={paragraph} />)
        : <p className="fl-document-empty">Nessun contenuto registrato.</p>}
    </div>
  </article>;
}
