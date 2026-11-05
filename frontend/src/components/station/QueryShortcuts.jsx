import { ArrowUpRight, Database, GitBranch, Orbit } from "lucide-react";
import { queryDestinations } from "./queryContext";

export default function QueryShortcuts({ onOpen, disabled, query, documents, logs }) {
  const available = queryDestinations(query, documents, logs);
  return <nav className="fieldlink-query-shortcuts" aria-label="Approfondisci la risposta della chat">
    {[["archivio", "Prove", Orbit], ["database", "Database", Database], ["timeline", "Time line", GitBranch]].map(([id, label, Icon]) =>
      <button key={id} type="button" data-lane={id} disabled={disabled || !available[id]} onClick={(event) => onOpen(id, event.currentTarget)} title={disabled ? "Attendi il completamento della risposta" : available[id] ? id === "timeline" ? "Mostra la prima comunicazione collegata ai dati di questa risposta" : `Mostra ${label}: riferimenti di questa risposta` : `Nessun riferimento collegato a ${label} in questa risposta`}><Icon size={13} aria-hidden="true" /><span>{label}</span>{available[id] && !disabled && <ArrowUpRight className="fl-shortcut-arrow" size={12} aria-hidden="true" />}</button>)}
  </nav>;
}
