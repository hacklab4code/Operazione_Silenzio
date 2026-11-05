import { parseSqlToolResponse } from "./sqlResponse";

export function querySourceIds(query) {
  // Retrieved context can include documents the answer explicitly did not use.
  // Only references in the explanation establish a destination for this reply.
  const explanation = (query?.answer || "").split(/(?:^|\n)\s*(?:#{1,6}\s*)?(?:📌\s*)?(?:\*\*|__)?FONTI(?:\s+(?:CITATE|RECUPERATE)|\s*(?:&|E)\s*ATTENDIBILIT[AÀ])?\s*(?:\*\*|__)?\s*:/i)[0];
  const cited = [...explanation.matchAll(/\[([A-Z][A-Z0-9_.\/-]+)\]/gi)].map((match) => match[1]);
  const tokens = new Set(explanation.toUpperCase().match(/[A-Z0-9]+(?:[-_.][A-Z0-9]+)+/g) || []);
  const mentioned = (Array.isArray(query?.source_ids) ? query.source_ids : []).filter((id) => typeof id === "string" && tokens.has(id.trim().toUpperCase()));
  return [...new Set([...cited, ...mentioned].map((id) => id.trim().toUpperCase()))];
}

export function queryDocuments(query, documents = []) {
  return querySourceIds(query).flatMap((id) => documents.filter((doc) => doc.id?.toUpperCase() === id));
}

export function matchingQueryLog(query, logs = []) {
  if (!query?.answer?.trim()) return null;
  const exact = query.id != null && logs.find((log) => log.id === query.id);
  if (exact) return exact;
  const createdAt = Date.parse(query.created_at);
  const candidates = logs.filter((log) => !log.failed && !log.pending && log.session_id === query.session_id && log.question === query.question && log.answer?.trim() === query.answer.trim()
    && (!Number.isFinite(createdAt) || Date.parse(log.created_at) <= createdAt));
  if (!Number.isFinite(createdAt)) return candidates[0] || null;
  // Local replies get their ID in the browser; the saved log has its own ID.
  // Use the closest prior timestamp to distinguish repeated exchanges without
  // linking an older reply to a later occurrence.
  return candidates.reduce((closest, log) => {
    const distance = Math.abs(Date.parse(log.created_at) - createdAt);
    const closestDistance = Math.abs(Date.parse(closest?.created_at) - createdAt);
    return !closest || (Number.isFinite(distance) && (!Number.isFinite(closestDistance) || distance < closestDistance)) ? log : closest;
  }, null);
}

export function firstReportedQuery(query, logs = []) {
  if (!query?.answer?.trim()) return null;
  const current = matchingQueryLog(query, logs) || query;
  const cutoff = Date.parse(current.created_at);
  const sourceIds = query.focus_id ? [query.focus_id.trim().toUpperCase()] : querySourceIds(query);
  // Search the full history: the first report may belong to another session or
  // use different wording. Retrieved-but-uncited documents are not reports.
  return logs.reduce((first, log) => {
    const createdAt = Date.parse(log.created_at);
    if (!log.answer?.trim() || log.failed || log.pending || !Number.isFinite(createdAt) || !Number.isFinite(cutoff) || createdAt > cutoff) return first;
    const related = sourceIds.length
      ? querySourceIds(log).some((id) => sourceIds.includes(id))
      : log.answer.trim() === query.answer.trim();
    return related && createdAt < Date.parse(first.created_at) ? log : first;
  }, current);
}

export function queryDestinations(query, documents = [], logs = []) {
  if (!query?.answer?.trim() || query.failed || query.pending) return { archivio: false, database: false, timeline: false };
  const sql = parseSqlToolResponse(query.answer);
  return {
    archivio: queryDocuments(query, documents).length > 0,
    database: Boolean(sql?.query && sql?.rows),
    timeline: Boolean(matchingQueryLog(query, logs) || (query.id?.startsWith("local-") && query.created_at && query.session_id)),
  };
}

export function latestCompletedQuery(logs = []) {
  return logs.filter((log) => log.answer?.trim()).reduce((latest, log) =>
    !latest || Date.parse(log.created_at) > Date.parse(latest.created_at) ? log : latest, null);
}

export function sqlQueryRows(answer = "") {
  const match = answer.match(/RIGHE RESTITUITE:\s*(\{[^\n]+\})/);
  if (!match) return null;
  try {
    const result = JSON.parse(match[1]);
    return Array.isArray(result.colonne) && Array.isArray(result.righe) ? result : null;
  } catch { return null; }
}
