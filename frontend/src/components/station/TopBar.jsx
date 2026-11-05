import { useEffect, useState } from "react";
import { Orbit, ClipboardList, Pin, Menu, GitBranch, Database, Workflow, ScrollText } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

const LABEL = { forte: "Segnale forte", debole: "Segnale debole", silenzio: "Silenzio radio" };
const BARS = { forte: 4, debole: 2, silenzio: 0 };

export const NAV = [
  { id: "vetrina", label: "Vetrina", icon: ScrollText },
  { id: "timeline", label: "Timeline", icon: GitBranch },
  { id: "archivio", label: "Prove", icon: Orbit },
  { id: "database", label: "Database", icon: Database },
  { id: "schema", label: "Archivio", icon: Workflow },
  { id: "rapporto", label: "Rapporto", icon: ClipboardList },
  { id: "bacheca", label: "Bacheca", icon: Pin },
];

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return now.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function NavButtons({ onOpen, badges, mobile }) {
  return NAV.map(({ id, label, icon: Icon }) => (
    <button key={id} data-testid={`${mobile ? "mnav" : "nav"}-${id}-btn`} className="nav-btn" onClick={() => onOpen(id)}>
      <Icon size={17} /><span>{label}</span>
      {badges[id] && <em className="badge">{badges[id]}</em>}
    </button>
  ));
}

export default function TopBar({ signal, danger, onOpen, badges }) {
  const time = useClock();
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <header data-testid="radio-header" className="topbar">
      <div className="static-noise" />
      <div className="brand-block">
        <span className="rec-dot" />
        <div>
          <strong className="brand">A.N.I.M.A.</strong>
          <span className="freq-line"><b data-testid="frequency" className="freq">156.8</b> MHz · In diretta</span>
        </div>
      </div>
      <div className="status-block">
        <span data-testid="signal-state" className={`pill s-${signal}`}>
          <span className="bars">{[1, 2, 3, 4].map((b) => <i key={b} className={b <= BARS[signal] ? "on" : ""} style={{ height: 4 + b * 3 }} />)}</span>
          {LABEL[signal]}
        </span>
        <span data-testid="transmission-status" className={`pill ghost ${danger ? "alarm" : ""}`}>{danger ? "Pericolo imminente" : "Trasmissione attiva"}</span>
        <span data-testid="depth" className="meta">AGENTE AI</span>
        <span data-testid="clock" className="meta">{time}</span>
      </div>
      <nav className="nav-desktop"><NavButtons onOpen={onOpen} badges={badges} /></nav>
      <button data-testid="mobile-menu-btn" className="nav-btn menu-btn" onClick={() => setMobileOpen(true)}><Menu size={18} /><span>Menu</span></button>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="right" className="drawer" data-testid="mobile-menu">
          <SheetTitle className="drawer-title">Menu</SheetTitle>
          <div className="mobile-nav"><NavButtons mobile badges={badges} onOpen={(id) => { setMobileOpen(false); onOpen(id); }} /></div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
