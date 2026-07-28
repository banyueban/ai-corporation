export function App() {
  const { versions } = window.desktop;

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
