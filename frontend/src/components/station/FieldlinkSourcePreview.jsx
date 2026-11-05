import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Download, FileText, RefreshCw, X } from "lucide-react";
import "./fieldlink-board.css";

const EMPTY_DOCUMENTS = [];
let catalogRequest;
let catalogExpires = 0;
const BACKEND = process.env.REACT_APP_BACKEND_URL || "";
export const originalUrl = (key) => `${BACKEND}/api/fieldlink/files/${key.split("/").map(encodeURIComponent).join("/")}`;
export function invalidateCatalog() { catalogRequest = null; catalogExpires = 0; }
export function readCatalog() {
  if (!catalogRequest || Date.now() >= catalogExpires) {
    catalogExpires = Date.now() + 10000;
    catalogRequest = fetch(`${BACKEND}/api/fieldlink/catalog`, { cache: "no-store" })
      .then((response) => { if (!response.ok) throw new Error("Catalogo non disponibile"); return response.json(); })
      .then((payload) => { if (!Array.isArray(payload.documents)) throw new Error("Catalogo non valido"); return payload.documents; })
      .catch((error) => { catalogRequest = null; throw error; });
  }
  return catalogRequest;
}

export function SourceChips({ ids = [], documents = EMPTY_DOCUMENTS }) {
  const [selected, setSelected] = useState(null);
  const triggerRef = useRef(null);
  const [matches, setMatches] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!selected) return undefined;
    let active = true;
    setLoading(true); setError(""); setMatches([]);
    readCatalog().then((catalog) => {
      if (!active) return;
      const found = catalog.filter((doc) => doc.id?.toUpperCase() === selected.toUpperCase());
      setMatches(found.length ? found : documents.filter((doc) => doc.id?.toUpperCase() === selected.toUpperCase()));
    }).catch(() => {
      if (active) {
        const local = documents.filter((doc) => doc.id?.toUpperCase() === selected.toUpperCase());
        if (local.length) setMatches(local);
        else setError("Impossibile leggere la fonte. Riprova a caricare il catalogo.");
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selected, retry, documents]);
  const unique = [...new Set(ids.filter((id) => typeof id === "string" && id.trim()))];
  if (!unique.length) return null;
  return <Dialog.Root open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
    <span className="fl-source-chips">{unique.map((id) => <Dialog.Trigger asChild key={id}><button type="button" onClick={(event) => { triggerRef.current = event.currentTarget; setSelected(id); }} aria-label={`Leggi fonte ${id}`}><FileText size={12} />{id}</button></Dialog.Trigger>)}</span>
    <Dialog.Portal>
      <Dialog.Overlay className="fl-source-overlay" />
      <Dialog.Content className="fl-source-dialog" onCloseAutoFocus={(event) => { event.preventDefault(); triggerRef.current?.focus(); }} aria-describedby="fl-source-description">
        <header><div><span className="fl-workspace-eyebrow"><FileText size={13} />FONTE ORIGINALE</span><Dialog.Title>{selected}</Dialog.Title></div><Dialog.Close asChild><button type="button" aria-label="Chiudi fonte"><X size={20} /></button></Dialog.Close></header>
        <Dialog.Description id="fl-source-description">Testo del documento conservato nell’archivio della missione.</Dialog.Description>
        <div className="fl-source-body">
          {loading && <p role="status">Caricamento del documento…</p>}
          {error && <div role="alert"><p>{error}</p><button className="fl-workspace-action" type="button" onClick={() => setRetry((n) => n + 1)}><RefreshCw size={14} />Riprova</button></div>}
          {!loading && !error && !matches.length && <p>Questo identificativo non è presente nel catalogo disponibile. La citazione resta consultabile nella trascrizione.</p>}
          {!loading && matches.map((doc, index) => <article key={doc.key || `${doc.id}-${index}`}>
            <div className="fl-source-document-meta">{doc.day && <span>GIORNO {doc.day}</span>}<span>{doc.format || "TXT"}</span><span>{doc.filename}</span></div>
            <h3>{doc.title}</h3><p className="fl-source-original">{doc.content || "Il documento non contiene testo consultabile."}</p>
            {doc.source && <p className="fl-source-provenance">{doc.source}</p>}
            {doc.key && !doc.key.split("/").includes("..") && <a className="fl-workspace-action" href={originalUrl(doc.key)} download={doc.filename}><Download size={14} />Scarica originale</a>}
          </article>)}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
