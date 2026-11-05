import { NAV } from "./TopBar";

export default function FieldlinkRail({ section, onOpen, latestDay }) {
  return (
    <aside className="fieldlink-rail" aria-label="Navigazione">
      <button className="fieldlink-mark" type="button" aria-label="Torna alla console radio" title="Console radio" onClick={(event) => onOpen("radio", event.currentTarget)}>
        <span className="lds-spinner" aria-hidden="true">
          {Array.from({ length: 12 }, (_, index) => <div key={index} style={{ "--spinner-index": index }} />)}
        </span>
      </button>
      <nav>
        {NAV.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" title={label} aria-label={label} aria-current={id === section ? "page" : undefined} className={`fieldlink-nav-${id} ${id === section ? "selected" : ""}`} onClick={(event) => onOpen(id, event.currentTarget)}>
            <Icon className="fieldlink-nav-icon" size={20} strokeWidth={1.65} aria-hidden="true" /><span className="fieldlink-nav-label">{label}</span>
          </button>
        ))}
      </nav>
      {latestDay > 0 && <span className="fieldlink-collection-day" title={`Materiali disponibili fino al giorno ${latestDay}`} aria-label={`Dati fino al giorno ${latestDay}`}>G{latestDay}</span>}
    </aside>
  );
}
