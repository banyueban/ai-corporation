import type { HealthResult } from "@ai-corporation/protocols";
import { useEffect, useState } from "react";

type NativeCoreState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly result: HealthResult }
  | { readonly status: "degraded" };

export function App() {
  const { versions } = window.desktop;
  const [nativeCore, setNativeCore] = useState<NativeCoreState>({
    status: "loading",
  });

  useEffect(() => {
    let active = true;

    void window.desktop
      .health()
      .then((result) => {
        if (active) {
          setNativeCore({ status: "ready", result });
        }
      })
      .catch(() => {
        if (active) {
          setNativeCore({ status: "degraded" });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="app-shell">
      <section className="hero" aria-labelledby="app-title">
        <p className="eyebrow">Milestone 0 · Engineering baseline</p>
        <h1 id="app-title">AI Corporation Desktop</h1>
        <p className="summary">
          The sandboxed renderer, typed preload boundary, and Electron main
          process are online.
        </p>
      </section>

      <section className="runtime-card" aria-labelledby="runtime-title">
        <h2 id="runtime-title">Runtime boundary</h2>
        <p className={`service-state service-state--${nativeCore.status}`}>
          {nativeCore.status === "loading" && "Native Core is starting"}
          {nativeCore.status === "ready" &&
            `Native Core ready · v${nativeCore.result.version}`}
          {nativeCore.status === "degraded" &&
            "Native Core unavailable · system actions are disabled"}
        </p>
        <dl>
          <div>
            <dt>Electron</dt>
            <dd>{versions.electron}</dd>
          </div>
          <div>
            <dt>Chrome</dt>
            <dd>{versions.chrome}</dd>
          </div>
          <div>
            <dt>Node</dt>
            <dd>{versions.node}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
