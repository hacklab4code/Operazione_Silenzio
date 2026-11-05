import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, Box, ChevronLeft, ChevronRight, Database, FileText, Layers3, List, Orbit, Search, X } from 'lucide-react';
import RagSpace from './RagSpace';
import PageHeaderDetails from './PageHeaderDetails';
import QueryFocusTrail from './QueryFocusTrail';
import { queryDocuments } from './queryContext';
import { CATEGORY_GROUPS, DAY_GROUPS, filterDocuments, prepareDocuments } from './ragModel';
import { readCatalog, originalUrl } from './FieldlinkSourcePreview';
import './rag.css';

const number = (value) => value.toLocaleString('it-IT');
const PAGE_SIZE = 40;
const FORMATS = [
  { label: 'TXT', shape: 'dot' },
  { label: 'HTML', shape: 'ring' },
  { label: 'JSON', shape: 'square' },
  { label: 'XML', shape: 'diamond' },
  { label: 'XLSX', shape: 'square' },
  { label: 'IPYNB', shape: 'ring' },
];
function Inspector({ document: doc, documents, filtered, scopeLabel, onClose, onSelect, onCategory }) {
  const selectedIndex = doc ? filtered.findIndex((item) => item.key === doc.key) : -1;
  const neighbours = useMemo(() => {
    if (!doc?.embedding) return [];
    return filtered.filter((item) => item.key !== doc.key && item.embedding)
      .map((item) => ({ doc: item, distance: Math.hypot(...item.embedding.map((value, axis) => value - doc.embedding[axis])) }))
      .sort((a, b) => a.distance - b.distance).slice(0, 3).map((entry) => entry.doc);
  }, [doc, filtered]);

  if (!doc) return <aside className="rag-inspector rag-overview" aria-label="Riepilogo della vista">
    <div className="rag-panel-label"><Database size={14} />NELLA VISTA</div>
    <div className="rag-total"><strong>{number(filtered.length)}</strong><span>{scopeLabel} · {number(documents.length)} file nel corpus</span></div>
    <p>Clicca un punto per leggere la fonte. Un cerchio numerato raccoglie i file vicini: aprilo per scegliere un documento.</p>
    <div className="rag-day-summary" aria-label="Gruppi nella vista">{CATEGORY_GROUPS.map((group) => {
      const count = filtered.filter((item) => item.category === group.id).length;
      return <button type="button" key={group.id} onClick={() => onCategory(group.id)} disabled={!count} aria-label={`Filtra ${group.label}, ${count} documenti`}><span><i style={{ background: group.color }} />{group.label}</span><strong>{number(count)}</strong></button>;
    })}</div>
    <div className="rag-panel-label rag-formats-title">DOCUMENTI DA ESPLORARE</div>
    <div className="rag-quick-documents">{filtered.slice(0, 4).map((item) => <button type="button" key={item.key} onClick={() => onSelect(item.key)}><span><small>{item.id} · G{item.day}</small><strong>{item.title}</strong></span><ChevronRight size={14} /></button>)}{!filtered.length && <p>Nessuna fonte con questi filtri.</p>}</div>
  </aside>;

  const sourceUrl = doc.source?.match(/^https?:\/\/[^\s]+/)?.[0];
  const group = CATEGORY_GROUPS.find((item) => item.id === doc.category);
  return <aside className="rag-inspector" aria-label="Documento selezionato" key={doc.key} data-testid="rag-inspector">
    <header className="rag-inspector-header"><span className="rag-panel-label"><FileText size={14} />DOCUMENTO SELEZIONATO</span><button type="button" aria-label="Chiudi documento" onClick={onClose}><X size={17} /></button></header>
    <div className="rag-doc-navigation"><span>{selectedIndex + 1} di {number(filtered.length)} nella vista</span><div><button type="button" aria-label="Documento precedente" disabled={selectedIndex <= 0} onClick={() => onSelect(filtered[selectedIndex - 1].key)}><ChevronLeft size={15} /></button><button type="button" aria-label="Documento successivo" disabled={selectedIndex >= filtered.length - 1} onClick={() => onSelect(filtered[selectedIndex + 1].key)}><ChevronRight size={15} /></button></div></div>
    <div className="rag-doc-scroll">
      <div className="rag-document-tags"><span>GIORNO {doc.day}</span><span>{doc.format}</span>{group && <span style={{ color: group.color }}>{group.label}</span>}</div>
      <h2>{doc.title}</h2><span className="rag-document-id">{doc.id}</span>
      <div className="rag-document-file"><span>{doc.filename}</span><small>{number(doc.bytes)} byte · {number(doc.content.length)} caratteri</small></div>
      <p className="rag-document-text">{doc.content}</p>
      <div className="rag-source"><strong>Provenienza</strong>{sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer">{doc.source}</a> : <span>{doc.source}</span>}{doc.license && <small>{doc.license}</small>}</div>
      {neighbours.length > 0 && <div className="rag-related"><div className="rag-panel-label">TESTI VICINI NELLA VISTA</div><p>Per distanza nella proiezione lessicale.</p><div className="rag-quick-documents">{neighbours.map((item) => <button type="button" key={item.key} onClick={() => onSelect(item.key)}><span><small>{item.id} · G{item.day}</small><strong>{item.title}</strong></span><ChevronRight size={14} /></button>)}</div></div>}
      <details className="rag-integrity"><summary>Integrità del file · SHA-256</summary><code>{doc.sha256}</code></details>
    </div>
    <a className="rag-download" href={originalUrl(doc.key)} download={doc.filename}><ArrowDownToLine size={15} />Scarica originale<ArrowRight size={14} /></a>
  </aside>;
}

export default function FieldlinkArchive({ latestQuery, onReturn }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState('');
  const [day, setDay] = useState('all');
  const [category, setCategory] = useState('all');
  const [format, setFormat] = useState('all');
  const [view, setView] = useState('space');
  const [selectedKey, setSelectedKey] = useState(null);
  const focusedQueryRef = useRef(null);
  const appliedFocusRef = useRef(null);
  const stripRef = useRef(null);
  const [page, setPage] = useState(0);
  const deferredQuery = useDeferredValue(query);
  const searchRef = useRef(null);
  useEffect(() => {
    const focusSearch = (event) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey || event.target.closest('input, textarea, select, [contenteditable]')) return;
      event.preventDefault(); searchRef.current?.focus({ preventScroll: true });
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  useEffect(() => {
    let active = true;
    const load = () => readCatalog()
      .then((catalog) => { if (active) { setDocuments(prepareDocuments(catalog)); setError(''); } })
      .catch(() => { if (active) setError('Impossibile caricare il catalogo locale. Riprova.'); })
      .finally(() => { if (active) setLoading(false); });
    load();
    const timer = window.setInterval(load, 15000);
    window.addEventListener('fieldlink:data-updated', load);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('fieldlink:data-updated', load); };
  }, [retry]);

  const querySources = useMemo(() => {
    const cited = queryDocuments(latestQuery, documents);
    const focusId = String(latestQuery?.focus_id || "").toUpperCase();
    if (!focusId || cited.some((doc) => String(doc.id || "").toUpperCase() === focusId)) return cited;
    const focused = documents.filter((doc) => String(doc.id || "").toUpperCase() === focusId);
    return focused.length ? [...focused, ...cited] : cited;
  }, [documents, latestQuery]);
  const scopedDocuments = latestQuery ? querySources : documents;
  const filtered = useMemo(() => filterDocuments(scopedDocuments, { query: deferredQuery, day, category, format }), [scopedDocuments, deferredQuery, day, category, format]);
  const visibleKeys = useMemo(() => new Set(filtered.map((doc) => doc.key)), [filtered]);
  const selected = documents.find((doc) => doc.key === selectedKey && visibleKeys.has(doc.key));
  const focusStamp = latestQuery ? `${latestQuery.id || ""}|${String(latestQuery.focus_id || "").toUpperCase()}|${latestQuery.answer || ""}` : "";
  useEffect(() => {
    if (!latestQuery || !documents.length || focusedQueryRef.current === focusStamp) return;
    focusedQueryRef.current = focusStamp;
    setQuery(''); setDay('all'); setCategory('all'); setFormat('all'); setView('space');
  }, [documents.length, focusStamp, latestQuery]);
  useEffect(() => {
    if (!latestQuery || !documents.length || !focusStamp || appliedFocusRef.current === focusStamp) return;
    if (query || day !== 'all' || category !== 'all' || format !== 'all') return;
    const focusId = String(latestQuery.focus_id || '').toUpperCase();
    const focused = querySources.find((doc) => String(doc.id || '').toUpperCase() === focusId);
    appliedFocusRef.current = focusStamp;
    const next = focused?.key || querySources[0]?.key || null;
    if (next) setSelectedKey(next);
  }, [category, day, documents.length, focusStamp, format, latestQuery, query, querySources]);
  useEffect(() => {
    const selectedButton = stripRef.current?.querySelector('[aria-pressed="true"]');
    if (typeof selectedButton?.scrollIntoView === 'function') {
      try { selectedButton.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch { /* The test DOM has no layout. */ }
    }
  }, [selectedKey]);
  const dayGroups = useMemo(() => [...new Set(documents.map((doc) => doc.day).filter(Boolean))].sort((a, b) => a - b).map((day) => DAY_GROUPS.find((group) => group.day === day) || { day, label: 'Materiali della missione' }), [documents]);
  const dayCounts = useMemo(() => dayGroups.map((group) => documents.filter((doc) => doc.day === group.day).length), [documents, dayGroups]);
  const formats = [...new Set(documents.map((doc) => doc.format))].sort().map((label) => FORMATS.find((item) => item.label === label) || { label, shape: 'dot' });
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const shown = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const filtersActive = query || day !== 'all' || category !== 'all' || format !== 'all';
  const scopeLabel = latestQuery ? 'Fonti della risposta' : day === 'all' ? 'Tutti i giorni' : `Giorno ${day}`;
  useEffect(() => { setPage(0); }, [deferredQuery, day, category, format]);
  useEffect(() => { if (selectedKey && !visibleKeys.has(selectedKey)) setSelectedKey(null); }, [visibleKeys, selectedKey]);
  const clearFilters = () => { setQuery(''); setDay('all'); setCategory('all'); setFormat('all'); };
  const selectDocument = (key) => { setSelectedKey(key); };
  const selectCategory = (id) => { setCategory((current) => current === id ? 'all' : id); };
  const selectFormat = (value) => { setFormat((current) => current === value ? 'all' : value); };

  return <section className={`rag-workspace ${latestQuery ? 'fl-query-focused' : ''}`} aria-label="Prove" data-testid="fieldlink-page-archivio">
    <PageHeaderDetails>
        <div className="rag-search-group">
          <label className="rag-search"><Search size={17} /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca per nome, ID o contenuto…" aria-label="Cerca nei documenti" />{query && <button type="button" aria-label="Cancella ricerca" onClick={() => setQuery('')}><X size={15} /></button>}<kbd>/</kbd></label>
        </div>
        <div className="rag-view-switch-wrap"><div className="rag-view-switch" aria-label="Modalità di visualizzazione">
          <button type="button" aria-label="Mappa 3D" aria-pressed={view === 'space'} onClick={() => setView('space')}><Box size={15} /><span>Mappa</span></button>
          <button type="button" aria-label="Elenco" aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={16} /><span>Elenco</span></button>
        </div></div>
    </PageHeaderDetails>
    {loading ? <div className="rag-loading" role="status"><Orbit size={32} />Caricamento del catalogo completo…</div> : error ? <div className="rag-loading" role="alert"><p>{error}</p><button type="button" onClick={() => setRetry((value) => value + 1)}>Riprova</button></div> : <>
      <QueryFocusTrail query={latestQuery} label={`${querySources.length} fonti collegate`} onReturn={onReturn} />
      {latestQuery && <div ref={stripRef} className="fl-query-source-strip" role="group" aria-label="Fonti collegate alla risposta">{querySources.map((doc) => <button key={doc.key} type="button" aria-pressed={selectedKey === doc.key} onClick={() => { clearFilters(); selectDocument(doc.key); }}><FileText size={13} /><span>{doc.id} · {doc.title}</span></button>)}</div>}
      {!latestQuery && <div className="rag-time-navigation">
        <div className="rag-time-heading"><span className="rag-panel-label"><Layers3 size={14} />EVOLUZIONE DEL CORPUS</span></div>
        <div className="rag-day-timeline" style={{ "--rag-days": Math.max(1, dayGroups.length) }} aria-label="Scegli il giorno">
          <button type="button" className="rag-all-days" aria-pressed={day === 'all'} onClick={() => setDay('all')}><Orbit size={18} /><span><strong>Tutto il corpus</strong><small>{number(documents.length)} documenti</small></span></button>
          {dayGroups.map((group, index) => <button type="button" key={group.day} aria-label={`Giorno ${group.day}, ${number(dayCounts[index])} documenti`} aria-pressed={day === String(group.day)} onClick={() => setDay(String(group.day))}><span className="rag-day-marker">0{group.day}</span><span><strong>Giorno {group.day}<em>{number(dayCounts[index])}</em></strong><small>{group.label}</small></span><span className="rag-day-track" /></button>)}
        </div>
      </div>}
      <div className={`rag-main ${selected ? 'has-selection' : ''}`}>
        <div className="rag-browser">
          <div className="rag-resultbar" aria-live="polite"><span><i />{scopeLabel}<b>{number(filtered.length)} / {number(documents.length)} file</b></span>{filtersActive ? <button type="button" onClick={clearFilters}>Azzera filtri<X size={12} /></button> : <span>CATALOGO LOCALE</span>}</div>
          {view === 'space' ? <div className="rag-map-wrap"><RagSpace documents={documents} visibleKeys={visibleKeys} selectedKey={selectedKey} onSelect={selectDocument} viewScope={day} scopeLabel={scopeLabel} />{filtered.length === 0 && <div className="rag-empty" role="status"><Search size={26} /><h3>{'Nessun documento trovato'}</h3><p>{'Prova altre parole o modifica i filtri.'}</p><button type="button" onClick={clearFilters}>Mostra tutti i file</button></div>}</div> : <div className="rag-list-view">
            <div className="rag-list-columns"><span>DOCUMENTO</span><span>GIORNO</span><span>FORMATO</span></div>
            <div className="rag-document-list" aria-label="Elenco dei documenti">{shown.map((doc) => <button type="button" key={doc.key} className={selectedKey === doc.key ? 'is-selected' : ''} aria-pressed={selectedKey === doc.key} onClick={() => selectDocument(doc.key)}><FileText size={17} /><span><strong>{doc.title}</strong><small>{doc.id} · {doc.filename}</small></span><span className="rag-list-day">0{doc.day}</span><span className="rag-list-format">{doc.format}</span><ChevronRight size={14} /></button>)}{!filtered.length && <div className="rag-list-empty"><h3>{'Nessun documento trovato'}</h3><p>{'Prova altre parole o modifica i filtri.'}</p><button type="button" onClick={clearFilters}>Mostra tutti i file</button></div>}</div>
            {totalPages > 0 && <div className="rag-pagination"><span>{safePage * PAGE_SIZE + 1}—{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} di {number(filtered.length)}</span><div><button type="button" aria-label="Pagina precedente" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}><ChevronLeft size={16} /></button><span>{safePage + 1} / {totalPages}</span><button type="button" aria-label="Pagina successiva" disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)}><ChevronRight size={16} /></button></div></div>}
          </div>}
          <div className="rag-map-caption"><span className="rag-legend-label">GRUPPI</span>{CATEGORY_GROUPS.map((group) => <button key={group.id} type="button" className={`rag-map-cat-btn${category === group.id ? ' is-active' : ''}`} onClick={() => selectCategory(group.id)} aria-pressed={category === group.id}><i style={{ background: group.color }} />{group.label}</button>)}<span className="rag-caption-divider" /><div className="rag-format-key" role="group" aria-label="Filtra per formato">{formats.map((item) => <button key={item.label} type="button" className="rag-format-btn" aria-label={`Filtra formato ${item.label}`} aria-pressed={format === item.label} title={format === item.label ? 'Clicca di nuovo per mostrare tutti i formati' : `Mostra i documenti ${item.label}`} onClick={() => selectFormat(item.label)}><i className={`is-${item.shape}`} />{item.label}</button>)}</div></div>
        </div>
        <Inspector document={selected} documents={documents} filtered={filtered} scopeLabel={scopeLabel} onClose={() => setSelectedKey(null)} onSelect={selectDocument} onCategory={selectCategory} />
      </div>
    </>}
  </section>;
}
