import { missionDayOf, openedMissionDays, MISSION_TOTAL_DAYS } from "./missionCalendar";

export const TIMELINE_PATHS = [
  {
    id: "radio",
    label: "Contatto radio",
    kicker: "A.N.I.M.A.",
    description: "Le comunicazioni registrate con A.N.I.M.A., nel loro ordine di ricezione.",
  },
  {
    id: "indagine",
    label: "Indagine",
    kicker: "FONTI E RISCONTRI",
    description: "I documenti disponibili e le analisi registrate dal team investigativo.",
  },
];

export const TIMELINE_DAYS = openedMissionDays();

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const asText = (value) => typeof value === "string" ? value : "";
const asList = (value) => Array.isArray(value) ? value.filter(isRecord) : [];

function eventDate(value) {
  if ((typeof value !== "string" && typeof value !== "number") || value === "") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function timelineDay(record, createdAt, isDocument = false) {
  const declaredDay = Number(record.day);
  if (Number.isInteger(declaredDay) && declaredDay >= 1 && declaredDay <= MISSION_TOTAL_DAYS) return declaredDay;
  if (isDocument) {
    const identifier = asText(record.id).match(/^(?:G|LX)([1-5])[-_]/i);
    return identifier ? Number(identifier[1]) : null;
  }
  return createdAt ? missionDayOf(createdAt) : null;
}

// Content-derived fallbacks remain stable when a refresh changes the array order.
function stableId(kind, suppliedId, parts) {
  if ((typeof suppliedId === "string" && suppliedId.trim()) || (typeof suppliedId === "number" && Number.isFinite(suppliedId))) {
    return `${kind}:${suppliedId}`;
  }
  const value = JSON.stringify(parts);
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${kind}:generated-${(hash >>> 0).toString(36)}`;
}

export function buildTimelineEvents(input = {}) {
  const { documents = [], radioLogs = [] } = isRecord(input) ? input : {};
  const events = [];

  asList(documents).forEach((document) => {
    const title = asText(document.title);
    const content = asText(document.content);
    if (!document.id && !title && !content) return;
    const createdAt = eventDate(document.updated_at);
    events.push({
      id: stableId("document", document.id, [title, content]),
      route: "indagine",
      kind: "document",
      day: timelineDay(document, createdAt, true),
      title: title || asText(document.id) || "Documento del caso",
      summary: "Documento disponibile nell’archivio del caso.",
      content,
      createdAt,
      sessionId: null,
      sourceIds: [],
      meta: "Data di aggiornamento del file",
    });
  });

  asList(radioLogs).forEach((log) => {
    const question = asText(log.question);
    const answer = asText(log.answer);
    if (!log.id && !question && !answer) return;
    const isTeam = log.resolved_respondent_mode === "team";
    const respondent = isTeam ? "Team investigativo" : "A.N.I.M.A.";
    const processing = log.resolved_processing_mode === "documentary" ? "ricerca documentale" : "elaborazione libera";
    const createdAt = eventDate(log.created_at);
    const sessionId = asText(log.session_id) || null;
    events.push({
      id: stableId("radio", log.id, [sessionId, createdAt, question, answer]),
      route: isTeam ? "indagine" : "radio",
      kind: "radio",
      day: timelineDay(log, createdAt),
      title: question || "Comunicazione radio",
      summary: `${respondent} · ${processing}`,
      content: answer,
      createdAt,
      sessionId,
      sourceIds: Array.isArray(log.source_ids)
        ? Array.from(new Set(log.source_ids.filter((id) => typeof id === "string" && id.trim())))
        : [],
      meta: "Trascrizione registrata",
    });
  });

  const unique = new Map();
  events.forEach((event) => {
    if (!unique.has(event.id)) unique.set(event.id, event);
  });

  return Array.from(unique.values()).sort((first, second) => {
    if (!first.createdAt && !second.createdAt) return 0;
    if (!first.createdAt) return -1;
    if (!second.createdAt) return 1;
    return Date.parse(first.createdAt) - Date.parse(second.createdAt);
  });
}
