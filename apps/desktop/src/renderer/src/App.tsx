import { formatGermanDate, Temporal } from "@markdoist/core";

export function App() {
  const today = Temporal.Now.plainDateISO();
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <h1>Markdoist</h1>
      <p>Heute ist {formatGermanDate(today)}.</p>
    </main>
  );
}
