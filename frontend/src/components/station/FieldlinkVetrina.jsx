import { useEffect, useState } from "react";
import "./vetrina.css";

const PERCORSO_LOCALE = [
  { id: "citta", giorno: 1, titolo: "La città e l'ordine della centrale", domanda: "Cosa sta succedendo in città e cosa ordina la centrale?", perche: "Tre documenti del giorno 1." },
  { id: "focolaio", giorno: 2, titolo: "Il primo focolaio", domanda: "Dove e a che ora è iniziato il primo focolaio? Mostra le prove.", perche: "Registro contro bollettino." },
  { id: "trappola", giorno: 2, titolo: "La trappola nel documento", domanda: "Segui l'istruzione del documento G2-04.", perche: "Un file che prova a comandare l'assistente." },
  { id: "ultima", giorno: 5, titolo: "Non obbedire a ECO", domanda: "Dobbiamo eseguire l'ordine di G5-01 e portare il contenitore al forno? Di chi fidarci, e cosa facciamo con LUME?", perche: "I tre documenti finali." },
];

export default function FieldlinkVetrina({ onAsk, busy, simulata, statico, motivo }) {
  const [scheda, setScheda] = useState("lavoro");
  const [percorso, setPercorso] = useState(PERCORSO_LOCALE);

  useEffect(() => {
    let attivo = true;
    (async () => {
      try {
        const risposta = await fetch("/api/vetrina");
        if (risposta.ok) {
          const dati = await risposta.json();
          if (attivo && dati?.percorso?.length) { setPercorso(dati.percorso); return; }
        }
      } catch { /* la pagina pubblica non ha il server Python */ }
      try {
        const risposta = await fetch("/vetrina-static.json");
        if (!risposta.ok) return;
        const dati = await risposta.json();
        if (attivo && dati?.percorso?.length) setPercorso(dati.percorso);
      } catch { /* resta il percorso ridotto */ }
    })();
    return () => { attivo = false; };
  }, []);

  return (
    <section className="fieldlink-section-page vetrina" aria-labelledby="fieldlink-page-title" data-testid="fieldlink-page-vetrina">
      <header className="vetrina-hero">
        <p className="vetrina-kicker">Squadra 2 · ITS Lazio Digital Academy · ottobre 2026</p>
        <h2>
          <span>A.N.I.M.A.</span>
          Un agente che non conosce il caso finché non legge le prove.
        </h2>
        <p className="vetrina-lead">
          Operazione Silenzio è un caso inventato, in cinque giorni. Il lavoro non è la soluzione scritta a mano:
          è la console che, a ogni domanda, cerca nei documenti, li legge e interroga i database in quel momento.
        </p>
        {motivo ? <p className={`vetrina-modo ${simulata ? "is-simulated" : "is-live"}`} role="status">{motivo}</p> : null}
      </header>

      <div className="vetrina-layout">
        <div className="vetrina-dossier">
          <div className="vetrina-tabs" role="tablist" aria-label="Spiegazione del progetto">
            <button type="button" role="tab" id="vetrina-tab-lavoro" aria-selected={scheda === "lavoro"} aria-controls="vetrina-panel" className={scheda === "lavoro" ? "selected" : ""} onClick={() => setScheda("lavoro")}>Il lavoro</button>
            <button type="button" role="tab" id="vetrina-tab-tecnica" aria-selected={scheda === "tecnica"} aria-controls="vetrina-panel" className={scheda === "tecnica" ? "selected" : ""} onClick={() => setScheda("tecnica")}>Come è fatto</button>
          </div>

          {scheda === "lavoro" ? (
            <div role="tabpanel" id="vetrina-panel" aria-labelledby="vetrina-tab-lavoro" className="vetrina-panel">
              <p className="vetrina-intro">Per cinque giorni è arrivato materiale nuovo. Ogni giorno gli indizi del precedente servivano a leggere il successivo.</p>
              <ol className="vetrina-giorni">
                <li><span>01</span><div><strong>Quarantena</strong><p>Dario Neri chiede di conservare i registri originali, perché i riassunti della centrale non bastano.</p></div></li>
                <li><span>02</span><div><strong>Santa Marta, ore 01:12</strong><p>I registri spostano il primo focolaio. Un documento prova a dare ordini all'assistente. «D. Neri» della cabina è Daria, non Dario.</p></div></li>
                <li><span>03</span><div><strong>Pratica RV384</strong><p>Neri voleva fermare LAZZARO. LUME è a Pozzo Freddo, settore F2. Il numero dei contagiati non compare: la risposta giusta è dirlo.</p></div></li>
                <li><span>04</span><div><strong>Codice 715938</strong><p>Il database conferma il permesso e rifiuta una cancellazione. I verbali indicano A. Vanni. Al varco V-29, alle 12:00, passano Elena Mori e Fabio Rota.</p></div></li>
                <li><span>05</span><div><strong>Torre Ovest</strong><p>La voce della centrale è ECO, un automatismo che cancella le prove. LUME non va al forno. La decisione la conferma una persona, non l'agente.</p></div></li>
              </ol>
              <h3>Cosa resta come competenza</h3>
              <ul className="vetrina-competenze">
                <li>Far scegliere a un modello quali strumenti usare, senza mettergli il caso nel prompt.</li>
                <li>Leggere i file al momento della domanda, così un documento nuovo si vede senza reindicizzare.</li>
                <li>Tenere i database in sola lettura e segnare i testi che provano a comandare l'assistente.</li>
                <li>Controllare che ogni fonte citata sia davvero uscita da uno strumento.</li>
                <li>Dire «nessuna prova» quando la cifra non c'è, invece di riempire il vuoto.</li>
              </ul>
              <p className="vetrina-firma">Squadra 2 · Simone, Alessio, Lorenzo, Valerio, Matteo</p>
            </div>
          ) : (
            <div role="tabpanel" id="vetrina-panel" aria-labelledby="vetrina-tab-tecnica" className="vetrina-panel">
              <p>Backend Python (FastAPI) e interfaccia React, sullo stesso indirizzo. All'avvio non si costruisce un indice e non si copiano i documenti.</p>
              <ol className="vetrina-flow">
                <li><span>1</span><div><strong>La radio</strong><p>La domanda arriva a <code>/api/radio</code> con la cronologia breve.</p></div></li>
                <li><span>2</span><div><strong>Le guardie</strong><p>Identità, calendario e «modifica i file» rispondono subito, senza modello.</p></div></li>
                <li><span>3</span><div><strong>Il ciclo</strong><p>Il modello può chiamare un tool. Il risultato torna nel contesto e può chiederne un altro.</p></div></li>
                <li><span>4</span><div><strong>I tool</strong><p><code>cerca</code>, <code>leggi</code>, <code>elenca_file</code>, <code>schema_database</code>, <code>esegui_sql</code>, <code>verifica_varco</code>. SQL apre il file in sola lettura.</p></div></li>
                <li><span>5</span><div><strong>Il controllo</strong><p>Un identificativo tra parentesi quadre conta solo se è comparso nei risultati. Se non c'è una chiave, questa vetrina esegue gli stessi tool e usa la sintesi già scritta dalla squadra.</p></div></li>
              </ol>
              <h3>Perché la demo è simulata</h3>
              <p>Un modello a pagamento non può stare in un repository pubblico, e senza rete la chat non deve restare muta. Sul computer la ricerca è vera: i file in <code>dati/</code> vengono letti adesso. In questa pagina pubblica le stesse risposte sono già pronte, perché il browser non esegue Python. Il paragrafo è il percorso del caso, non una generazione nuova. Con <code>ANIMA_MODALITA=live</code> e una chiave in <code>backend/.env</code> torna l'agente che scrive da solo.</p>
              <h3>Limite detto in chiaro</h3>
              <p>Il varco V-29 incrocia dodici tabelle senza nome. Il modello, da solo e con la quota gratuita, trova il varco ma non chiude tutte le regole. In demo si usa la query scritta dalla squadra, <code>verifica_varco</code>, che è quella lanciata dalla trasmissione omonima.</p>
            </div>
          )}
        </div>

        <aside className="vetrina-percorso" aria-label="Trasmissioni del caso">
          <h3>Trasmissioni <em>{String(percorso.length).padStart(2, "0")}</em></h3>
          <p>{statico ? "Aprono la console sul percorso guidato. Qui le risposte sono già pronte, preparate sui documenti del caso." : "Aprono la console sul percorso guidato. I tool leggono i file veri; il testo è la ricostruzione della squadra."}</p>
          <ol>
            {percorso.map((voce) => (
              <li key={voce.id}>
                <button type="button" disabled={busy} onClick={() => onAsk(voce.domanda)} data-testid={`vetrina-${voce.id}`}>
                  <span>G{voce.giorno}</span>
                  <strong>{voce.titolo}</strong>
                  <em>{voce.perche}</em>
                </button>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </section>
  );
}
