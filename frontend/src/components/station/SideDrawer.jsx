import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { NAV } from "./TopBar";
import FieldlinkArchive from "./FieldlinkArchive";
import FieldlinkReport from "./FieldlinkReport";
import FieldlinkBoard from "./FieldlinkBoard";

export default function SideDrawer({ menu, onClose, unlocked, fresh }) {
  const item = NAV.find((n) => n.id === (menu === "prove" ? "archivio" : menu));
  const wide = menu === "archivio" || menu === "prove" || menu === "rapporto";
  return (
    <Sheet open={!!menu} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side={menu === "prove" ? "left" : "right"} data-testid={`drawer-${menu}`} className={`drawer ${wide ? "wide" : ""}`}>
        <SheetTitle className="drawer-title">{item && <item.icon size={18} />} {item?.label}</SheetTitle>
        <div className="drawer-body">
          {(menu === "prove" || menu === "archivio") && <FieldlinkArchive />}
          {menu === "rapporto" && <FieldlinkReport />}
          {menu === "bacheca" && <FieldlinkBoard />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
