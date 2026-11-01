import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/app";
import { ErrorBoundary } from "./ui/components/error-boundary";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
