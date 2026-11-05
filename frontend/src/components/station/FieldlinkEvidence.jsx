import { useFieldlinkData, DataMessage } from "./FieldlinkData";

export default function FieldlinkEvidence() {
  const { documents, loading, error } = useFieldlinkData();
  return (
    <section className="fieldlink-evidence" aria-label="Documenti che costituiscono le prove">
      <p className="fieldlink-data-caption">Fonti lette direttamente dall’archivio del backend · {documents.length} documenti</p>
      <DataMessage loading={loading} error={error} isEmpty={!documents.length} empty="Nessun documento disponibile nell’archivio." />
      {!loading && !error && documents.length > 0 && <div className="fieldlink-evidence-list">
        {documents.map((document) => (
          <article className="fieldlink-evidence-card" key={document.id}>
            <div className="fieldlink-evidence-meta"><span>{document.id}</span><span>{document.filename}</span></div>
            <h2>{document.title}</h2>
            <p>{document.content}</p>
          </article>
        ))}
      </div>}
    </section>
  );
}
