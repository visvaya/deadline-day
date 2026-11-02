import type { ReactNode } from "react";

import { CURRENT_VERSION } from "../../data/changelog";

/**
 * Shared wordmark header: start screen and archive screen both open on it. The version line takes what
 * belongs to the version, on the start screen the update check (`children`).
 */
export const AppHero = ({ children }: { children?: ReactNode }) => (
  <header className="dd-setup-hero">
    <div className="dd-wrap">
      <p>Pięć sezonów decyzji transferowych</p>
      <div className="dd-hero-version">
        <span className="dd-version-tag">v{CURRENT_VERSION}</span>
        {children}
      </div>
      <h1 tabIndex={-1}>Deadline Day</h1>
      <div>
        Potem trzy sezony, na które nie masz już wpływu, i to one rozstrzygają, jak cię zapamiętają.
      </div>
    </div>
  </header>
);
