import { createContext, useContext } from "react";
import { createPortal } from "react-dom";

export const PageHeaderTarget = createContext(null);

export default function PageHeaderDetails({ children }) {
  const target = useContext(PageHeaderTarget);
  const content = <div className="fieldlink-page-controls">{children}</div>;
  return target ? createPortal(content, target) : content;
}
