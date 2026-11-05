import { useId } from "react";
import "./animaBoot.css";

const LETTERS = ["A.", "N.", "I.", "M.", "A."];
const NODES = [[120, 52], [179, 86], [179, 154], [120, 188], [61, 154], [61, 86]];

// The sequence is decorative: connectivity still comes from the radio state.
export default function AnimaBoot({ canTransmit }) {
  const id = useId();
  const glowId = `${id}-glow`;
  const lightId = `${id}-light`;

  return (
    <div className={`fieldlink-chat-intro anima-boot${canTransmit ? "" : " is-silent"}`}>
      <div className="anima-boot-heading">
        <span className="fieldlink-boot-status"><i />{canTransmit ? "COLLEGAMENTO STABILITO" : "SINTONIZZA IL CANALE"}</span>
        <span className="anima-boot-unit">SQUADRA 2</span>
      </div>

      <div className="anima-boot-identity">
        <div className="anima-boot-wordmark">
          <h1 aria-label={canTransmit ? "A.N.I.M.A." : undefined}>
            {canTransmit ? <span className="anima-boot-letters" aria-hidden="true">{LETTERS.map((letter, index) => (
              <span key={index} style={{ "--letter": index }}>{letter}</span>
            ))}</span> : "Ritrova il segnale."}
          </h1>
          <p className="fieldlink-agent-definition">Analisi Neurale per l’Investigazione<br />e il Monitoraggio Avanzato</p>
        </div>

        <div className="anima-core" aria-hidden="true">
          <svg viewBox="0 0 240 240" fill="none" focusable="false">
            <defs>
              <radialGradient id={glowId}>
                <stop stopColor="currentColor" stopOpacity=".22" />
                <stop offset="1" stopColor="currentColor" stopOpacity="0" />
              </radialGradient>
              <radialGradient id={lightId} cx=".36" cy=".3" r=".75">
                <stop stopColor="#effff7" />
                <stop offset=".25" stopColor="currentColor" />
                <stop offset="1" stopColor="currentColor" stopOpacity=".06" />
              </radialGradient>
            </defs>
            <circle cx="120" cy="120" r="116" fill={`url(#${glowId})`} />
            <g className="anima-core-guides" stroke="currentColor">
              <circle cx="120" cy="120" r="102" strokeDasharray="1 9" />
              <circle cx="120" cy="120" r="88" />
              <path d="M120 8v12m0 200v12M8 120h12m200 0h12" />
              <path d="M42 42l7 7m142 142 7 7M42 198l7-7M191 49l7-7" />
            </g>
            <g className="anima-core-orbit anima-core-orbit-outer" stroke="currentColor">
              <circle cx="120" cy="120" r="88" strokeDasharray="72 481" />
              <circle cx="208" cy="120" r="3" fill="currentColor" stroke="none" />
            </g>
            <g className="anima-core-network" stroke="currentColor" strokeWidth=".8">
              <path pathLength="1" d="M120 52l59 34v68l-59 34-59-34V86zM120 52v136M61 86l118 68M179 86 61 154" />
              {NODES.map(([cx, cy], index) => <circle className="anima-core-node" key={index} cx={cx} cy={cy} r="2.5" fill="currentColor" style={{ "--node": index }} />)}
            </g>
            <g className="anima-core-orbit anima-core-orbit-inner" stroke="currentColor">
              <ellipse cx="120" cy="120" rx="57" ry="23" transform="rotate(-38 120 120)" />
              <ellipse cx="120" cy="120" rx="57" ry="23" transform="rotate(38 120 120)" />
            </g>
            <circle className="anima-core-pulse" cx="120" cy="120" r="34" stroke="currentColor" />
            <circle className="anima-core-nucleus" cx="120" cy="120" r="17" fill={`url(#${lightId})`} />
            <path className="anima-core-signal" d="M93 120h14l6-10 8 20 6-10h20" stroke="#e7fff4" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="anima-core-caption">{canTransmit ? "SEGNALE ATTIVO" : "RICERCA SEGNALE"}</span>
        </div>
      </div>
    </div>
  );
}
