import { useCallback, useEffect, useRef, useState } from "react";
import "@/station.css";
import "@/fieldlink.css";
import { Toaster } from "@/components/ui/sonner";
import FieldlinkDashboard from "@/components/station/FieldlinkDashboard";
import SideDrawer from "@/components/station/SideDrawer";
import LetterGlitch from "@/components/station/LetterGlitch";
import { getRadioTheme } from "@/components/station/radioTheme";

const CLEAR_FREQUENCY = 156.8;
const MAX_FREQUENCY = 180;

export default function App() {
  const [menu, setMenu] = useState(null);
  const [section, setSection] = useState("vetrina");
  const [signal] = useState("forte");
  const [frequency, setFrequency] = useState(156.8);
  const [clearChannelSnr] = useState(() => 85 + Math.floor(Math.random() * 15));
  const ambientSnr = signal === "forte" ? clearChannelSnr : signal === "debole" ? 52 : 0;
  const quality = Math.round(ambientSnr * Math.max(0, 1 - Math.abs(frequency - CLEAR_FREQUENCY) * 3.33));
  const radioTheme = getRadioTheme(quality);
  const [frequencyRevision, setFrequencyRevision] = useState(0);
  const [frequencyTuning, setFrequencyTuning] = useState(false);
  const previousFrequency = useRef(frequency);
  const frequencyGlitched = Math.abs(frequency - CLEAR_FREQUENCY) > 0.001;
  const [danger, setDanger] = useState(false);
  const activity = [];
  const unlocked = [];

  useEffect(() => {
    // Include portalled citation previews and preferences in the page palette.
    const root = document.documentElement;
    const previous = root.style.getPropertyValue("--fl-hue");
    if (radioTheme.hue === null) root.style.removeProperty("--fl-hue");
    else root.style.setProperty("--fl-hue", String(radioTheme.hue));
    return () => {
      if (previous) root.style.setProperty("--fl-hue", previous);
      else root.style.removeProperty("--fl-hue");
    };
  }, [radioTheme.hue]);

  useEffect(() => {
    if (previousFrequency.current === frequency) return undefined;
    previousFrequency.current = frequency;
    setFrequencyRevision((revision) => revision + 1);
    setFrequencyTuning(true);
    const timer = window.setTimeout(() => setFrequencyTuning(false), 850);
    return () => window.clearTimeout(timer);
  }, [frequency]);

  const triggerDanger = useCallback(() => {
    setDanger(true);
    window.setTimeout(() => setDanger(false), 2600);
  }, []);

  const signalGroqExhausted = useCallback(() => {
    setFrequency((current) => Math.min(MAX_FREQUENCY, Number((current + 0.2).toFixed(1))));
  }, []);

  return (
    <div data-testid="station-root" className={`station fieldlink-app quality-${radioTheme.name} ${danger ? "is-danger" : ""}`}>
      <FieldlinkDashboard
        quality={quality}
        frequency={frequency}
        frequencyTuning={frequencyTuning}
        setFrequency={setFrequency}
        unlocked={unlocked}
        activity={activity}
        section={section}
        onDanger={triggerDanger}
        onGroqSaturated={signalGroqExhausted}
        onOpen={(id) => {
          setMenu(null);
          setSection(id === "prove" ? "archivio" : id);
        }}
      />
      {frequencyGlitched && <LetterGlitch
        key={frequencyRevision}
        className={`fieldlink-frequency-glitch ${frequencyTuning ? "is-tuning" : ""}`}
        glitchColors={radioTheme.colors}
        baseColor={radioTheme.base}
        fontSize={14}
        spacing={0.6}
        density={0.75}
        baseOpacity={0.18}
        glitchAmount={0.72}
        speed={1.4}
        flow={0.35}
        clickEffect="none"
        edgeFade={0}
        centerFade={0}
        cursorRadius={110}
        lightMode={false}
        smooth
        interactive={false}
        intro={false}
        aria-hidden="true"
      />}
      <SideDrawer menu={menu} onClose={() => setMenu(null)} unlocked={unlocked} />
      <Toaster position="top-center" toastOptions={{ className: "radio-toast" }} />
    </div>
  );
}
