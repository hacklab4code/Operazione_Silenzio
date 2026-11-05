import ModelResponseRenderer, { parseSqlToolResponse } from "./ModelResponseRenderer";
import { SourceChips } from "./FieldlinkSourcePreview";

export default function QueryResult({ query }) {
  const sql = parseSqlToolResponse(query?.answer);
  return <section className="fieldlink-query-result" aria-label="Ultima query">
    <span className="fl-db-eyebrow">{sql ? "QUERY E RISULTATO" : "ULTIMA QUERY"}</span>
    {query ? <>
      {!sql && <h2>{query.question}</h2>}
      <ModelResponseRenderer text={query.answer} respondent={query.resolved_respondent_mode === "team" ? "team" : "marco"} sqlVariant="database" />
      {!sql && <SourceChips ids={query.source_ids || []} />}
    </> : <p>Nessuna query completata. Invia una domanda dalla console radio.</p>}
  </section>;
}
