import { CURRENT_VERSION } from "../../data/changelog";

/** Shared wordmark header: start screen and archive screen both open on it. */
export const AppHero = () => (
  <header className="dd-setup-hero">
    <div className="dd-wrap">
      <p>
        Pięć sezonów decyzji transferowych{" "}
        <span className="dd-version-tag">v{CURRENT_VERSION}</span>
      </p>
      <h1 tabIndex={-1}>Deadline Day</h1>
      <div>
        Potem trzy sezony, na które nie masz już wpływu, i to one rozstrzygają, jak cię zapamiętają.
      </div>
    </div>
  </header>
);
