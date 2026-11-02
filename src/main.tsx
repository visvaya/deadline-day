import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/app";
import { ErrorBoundary } from "./ui/components/error-boundary";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

// Keeps this release for offline play (scripts/service-worker-template.js). Production builds only: the
// development server's files change under it. A registration that fails leaves the game working online, and
// the next start tries again.
if (import.meta.env.PROD && window.isSecureContext && "serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/sw.js", { scope: "/", updateViaCache: "none" })
    .catch(() => undefined);
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
