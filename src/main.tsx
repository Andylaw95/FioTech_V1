
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";
  import { initSentry, Sentry } from "./lib/sentry";

  initSentry();

  const FallbackUI = () => (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h2>Something went wrong.</h2>
      <p>The error has been reported. Please refresh the page.</p>
      <button onClick={() => window.location.reload()}>Reload</button>
    </div>
  );

  createRoot(document.getElementById("root")!).render(
    <Sentry.ErrorBoundary fallback={<FallbackUI />}>
      <App />
    </Sentry.ErrorBoundary>
  );
  