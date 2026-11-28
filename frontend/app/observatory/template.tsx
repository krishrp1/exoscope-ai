import type { ReactNode } from "react";

/** Re-mounts on every observatory route change, so each tool settles in (see .fx-route in globals.css). */
export default function ObservatoryTemplate({ children }: { children: ReactNode }) {
  return <div className="fx-route">{children}</div>;
}
