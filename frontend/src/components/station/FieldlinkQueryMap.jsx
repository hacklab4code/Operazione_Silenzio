import { sqlQueryRows } from "./queryContext";

export default function FieldlinkQueryMap({ query, documents = [], board }) {
  const sourceIds = query?.source_ids || [];
  const sources = sourceIds.map((id) => ({ id, label: documents.find((doc) => doc.id === id)?.title || id }));
  const places = [...new Set((board?.items || []).filter((item) => sourceIds.includes(item.source_id)).flatMap((item) => item.places || []))];
  const sql = sqlQueryRows(query?.answer);
  if (sql) {
    const deposit = sql.colonne.indexOf("deposito");
    const sector = sql.colonne.indexOf("settore");
    sql.righe.forEach((row) => {
      if (deposit >= 0 && row[deposit]) places.push(`${row[deposit]}${sector >= 0 ? ` · settore ${row[sector]}` : ""}`);
    });
  }
  return <div className="fieldlink-query-map" data-testid="fieldlink-query-map">
    <h3>Mappa della spiegazione</h3>
    <p>Il passaggio selezionato nella Time line, le sue fonti e i luoghi citati nelle fonti.</p>
    {query && <div className="fieldlink-query-graph" aria-label="Mappa dei collegamenti">
      <strong className="fieldlink-query-node is-question">{query.question}</strong>
      <div className="fieldlink-query-branches">{sources.map((source) => <article className="fieldlink-query-node" key={source.id}><small>FONTE · {source.id}</small><span>{source.label}</span></article>)}</div>
      {places.length > 0 && <div className="fieldlink-query-branches">{[...new Set(places)].map((place) => <article className="fieldlink-query-node" key={place}><small>LUOGO</small><span>{place}</span></article>)}</div>}
      {!sources.length && <p>Questo passaggio non contiene fonti recuperate.</p>}
    </div>}
  </div>;
}
