import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

export default function CopyMessageButton({ text, pending = false }) {
  const [status, setStatus] = useState("");
  const timer = useRef(null);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      try {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(text);
      } catch {
        // Support local installations served over HTTP as well.
        const previousFocus = document.activeElement;
        const field = document.createElement("textarea");
        field.value = text;
        field.readOnly = true;
        field.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
        document.body.appendChild(field);
        try {
          field.select();
          if (!document.execCommand("copy")) throw new Error("Copy failed");
        } finally {
          field.remove();
          previousFocus?.focus({ preventScroll: true });
        }
      }
      setStatus("Testo copiato");
    } catch {
      setStatus("Copia non riuscita. Riprova.");
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setStatus(""), 2000);
  };

  const copied = status === "Testo copiato";
  return (
    <div className="fieldlink-message-actions">
      <button
        type="button"
        className={`fieldlink-message-copy ${copied ? "is-copied" : ""}`}
        onClick={copy}
        disabled={pending || !text}
        aria-label={copied ? "Testo copiato" : "Copia messaggio"}
        title={copied ? "Testo copiato" : "Copia messaggio"}
      >
        {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
      </button>
      <span className="fieldlink-message-copy-status" role="status">{status}</span>
    </div>
  );
}
