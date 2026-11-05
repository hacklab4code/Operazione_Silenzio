import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowUpRight, Link2 } from "lucide-react";
import "./queryFocus.css";

export default function QueryFocusTrail({ query, label, onReturn, showQuestion = true }) {
  const reducedMotion = useReducedMotion();
  if (!query) return null;
  return <motion.div className="fl-query-focus-trail" initial={reducedMotion ? false : { opacity: 0, y: 14, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: .5, ease: [.22, 1, .36, 1] }}>
    <span className="fl-query-focus-signal" aria-hidden="true"><Link2 size={19} /></span>
    <div className="fl-query-focus-context"><span>DALLA RISPOSTA <ArrowUpRight size={12} aria-hidden="true" /> {label}</span>{showQuestion && <strong>{query.question}</strong>}</div>
    {onReturn && <button type="button" onClick={onReturn}><ArrowLeft size={13} /><span>Torna alla chat</span></button>}
    <span className="fieldlink-sr-only" role="status">{label}: riferimento della risposta aperto.</span>
  </motion.div>;
}
