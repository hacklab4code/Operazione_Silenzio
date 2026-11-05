import { useEffect, useState } from "react";
import { DataMessage, useFieldlinkData } from "./FieldlinkData";

export function Dossier() {
  const { documents, loading, error } = useFieldlinkData();
  const [selectedId, setSelectedId] = useState(null);
  const doc = documents.find((item) => item.id === selectedId) || documents[0];

  useEffect(() => {
    if (documents.length && !documents.some((item) => item.id === selectedId)) setSelectedId(documents[0].id);
  }, [documents, selectedId]);

  return (
    <div className="dossier">
      <DataMessage loading={loading} error={error} isEmpty={!documents.length} empty="L’archivio non contiene documenti G1." />
      {!loading && !error && documents.length > 0 && <>
        <ul aria-label="Documenti dell’archivio">
          {documents.map((document) => (
            <li key={document.id}><button data-testid={`dossier-doc-${document.id}`} className={doc?.id === document.id ? "on" : ""} onClick={() => setSelectedId(document.id)}>{document.id} · {document.title}</button></li>
          ))}
        </ul>
        {doc && <article data-testid="dossier-doc-body" className="paper">
          <div className="fieldlink-evidence-meta"><span>{doc.id}</span><span>{doc.filename}</span></div>
          <h4>{doc.title}</h4>
          <p className="fieldlink-document-content">{doc.content}</p>
        </article>}
      </>}
    </div>
  );
}

