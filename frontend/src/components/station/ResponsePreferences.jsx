import { useId } from "react";
import * as Popover from "@radix-ui/react-popover";
import {
  BookOpen,
  Check,
  ChevronDown,
  FileSearch,
  MessageSquare,
  SlidersHorizontal,
  Sparkles,
  Cpu,
  UsersRound,
  X,
  Radio,
} from "lucide-react";

const STORAGE_KEY = "fieldlink-response-preferences";

export const RESPONDENTS = [
  {
    value: "auto",
    label: "Automatico",
    shortLabel: "Auto",
    kicker: "SMART ROUTING",
    description: "Il sistema seleziona autonomamente trad A.N.I.M.A. e il Team.",
    icon: Sparkles,
  },
  {
    value: "marco",
    label: "A.N.I.M.A.",
    shortLabel: "A.N.I.M.A.",
    kicker: "AGENTE AI · ROMA",
    description: "Analisi Neurale per l’Investigazione e il Monitoraggio Avanzato. Analisi di prove e anomalie del caso.",
    icon: Cpu,
  },
  {
    value: "team",
    label: "Team Investigativo",
    shortLabel: "Team",
    kicker: "UNITÀ D'ANALISI",
    description: "Confronto analitico tra reperti, indizi e perizie della squadra.",
    icon: UsersRound,
  },
];

export const PROCESSING_MODES = [
  {
    value: "auto",
    label: "Automatico",
    shortLabel: "Archivio Auto",
    kicker: "RILEVAMENTO DINAMICO",
    description: "Consulta l'archivio solo quando la domanda tocca il caso.",
    icon: SlidersHorizontal,
  },
  {
    value: "documentary",
    label: "Ricerca documentale",
    shortLabel: "Archivio Attivo",
    kicker: "CITAZIONI PUNTUALI",
    description: "Consulta i documenti di tutti i giorni e cita le fonti recuperate.",
    icon: FileSearch,
  },
  {
    value: "free",
    label: "Elaborazione libera",
    shortLabel: "Risposta Libera",
    kicker: "SENZA FONTI",
    description: "Risponde liberamente senza consultare i registri d'archivio.",
    icon: MessageSquare,
  },
];

export function readResponsePreferences() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    return {
      respondent_mode: RESPONDENTS.some(({ value }) => value === saved?.respondent_mode)
        ? saved.respondent_mode
        : "auto",
      processing_mode: PROCESSING_MODES.some(({ value }) => value === saved?.processing_mode)
        ? saved.processing_mode
        : "auto",
    };
  } catch {
    return { respondent_mode: "auto", processing_mode: "auto" };
  }
}

export function saveResponsePreferences(preferences) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    /* Preferences still work in-memory if storage is disabled */
  }
}

function PreferenceOptionCard({ name, option, checked, onChange }) {
  const Icon = option.icon;
  return (
    <label className={`fieldlink-pref-card ${checked ? "is-selected" : ""}`}>
      <input
        className="fieldlink-sr-only"
        type="radio"
        name={name}
        value={option.value}
        checked={checked}
        onChange={() => onChange(option.value)}
      />
      <div className="fieldlink-pref-card-body">
        <div className="fieldlink-pref-card-top">
          <span className="fieldlink-pref-card-icon">
            <Icon size={15} strokeWidth={2} />
          </span>
          <div className="fieldlink-pref-card-titles">
            <span className="fieldlink-pref-card-kicker">{option.kicker}</span>
            <strong className="fieldlink-pref-card-label">{option.label}</strong>
          </div>
          <span className="fieldlink-pref-card-check" aria-hidden="true">
            {checked ? <Check size={12} strokeWidth={3} /> : null}
          </span>
        </div>
        <p className="fieldlink-pref-card-desc">{option.description}</p>
      </div>
    </label>
  );
}

export default function ResponsePreferences({ value, onChange, disabled }) {
  const id = useId();
  const respondent =
    RESPONDENTS.find((option) => option.value === value.respondent_mode) || RESPONDENTS[0];
  const processing =
    PROCESSING_MODES.find((option) => option.value === value.processing_mode) ||
    PROCESSING_MODES[0];
  const Icon = respondent.icon;

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          className="fieldlink-response-trigger"
          type="button"
          disabled={disabled}
          aria-label={`Tipo di risposta del modello: ${respondent.label}, Modalità: ${processing.label}`}
          title="Configura chi risponde e la modalità di consultazione dell'archivio"
        >
          <div className="fieldlink-response-trigger-glow" />
          <span className="fieldlink-response-trigger-tag">
            <Radio size={11} className="trigger-tag-icon" />
            <span>TIPO RISPOSTA:</span>
          </span>
          <span className="fieldlink-response-trigger-content">
            <Icon size={13} strokeWidth={2} className="trigger-main-icon" />
            <strong className="trigger-respondent-text">{respondent.shortLabel || respondent.label}</strong>
            <span className="trigger-separator">/</span>
            <span className="trigger-mode-text">{processing.shortLabel}</span>
          </span>
          <ChevronDown className="fieldlink-response-chevron" size={13} strokeWidth={2.2} />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          className="fieldlink-response-panel"
          side="top"
          align="end"
          sideOffset={10}
          collisionPadding={16}
          avoidCollisions={true}
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-desc`}
        >
          {/* Header */}
          <div className="fieldlink-preferences-header">
            <div className="fieldlink-preferences-header-text">
              <div className="fieldlink-preferences-eyebrow">
                <SlidersHorizontal size={12} />
                <span>CONFIGURAZIONE PROTOCOLLO IA // 156.8 MHz</span>
              </div>
              <h2 id={`${id}-title`} className="fieldlink-preferences-title">
                Tipo di risposta del modello
              </h2>
              <p id={`${id}-desc`} className="fieldlink-preferences-description">
                Scegli l’agente di analisi e la strategia di consultazione dell'archivio.
              </p>
            </div>
            <Popover.Close
              className="fieldlink-preferences-close"
              aria-label="Chiudi configurazione"
            >
              <X size={15} />
            </Popover.Close>
          </div>

          <div className="fieldlink-preferences-scrollable">
            {/* Group 1: Chi risponde */}
            <fieldset className="fieldlink-preference-group">
              <legend className="fieldlink-preference-legend">
                <span className="legend-badge">01</span>
                <span>INTERLOCUTORE IA (Chi risponde)</span>
              </legend>
              <div className="fieldlink-pref-grid">
                {RESPONDENTS.map((opt) => (
                  <PreferenceOptionCard
                    key={opt.value}
                    name={`${id}-respondent`}
                    option={opt}
                    checked={value.respondent_mode === opt.value}
                    onChange={(respondent_mode) => onChange({ ...value, respondent_mode })}
                  />
                ))}
              </div>
            </fieldset>

            {/* Group 2: Modalità elaborazione */}
            <fieldset className="fieldlink-preference-group">
              <legend className="fieldlink-preference-legend">
                <span className="legend-badge">02</span>
                <span>ARCHIVIO & FONTI (Modalità elaborazione)</span>
              </legend>
              <div className="fieldlink-pref-grid">
                {PROCESSING_MODES.map((opt) => (
                  <PreferenceOptionCard
                    key={opt.value}
                    name={`${id}-processing`}
                    option={opt}
                    checked={value.processing_mode === opt.value}
                    onChange={(processing_mode) => onChange({ ...value, processing_mode })}
                  />
                ))}
              </div>
            </fieldset>
          </div>

          {/* Tactical Footer Note */}
          <div
            className={`fieldlink-preferences-footer-note ${
              value.processing_mode === "free" ? "is-unverified" : ""
            }`}
          >
            <BookOpen size={13} className="footer-note-icon" />
            <span>
              {value.processing_mode === "free"
                ? "Attenzione: in Elaborazione Libera le risposte non citano i documenti del caso."
                : "Configurazione attiva: applicata istantaneamente alle prossime trasmissioni radio."}
            </span>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
