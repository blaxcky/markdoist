import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { runSpike, type SpikeResult } from "./src/spike";

export default function App() {
  const [results, setResults] = useState<SpikeResult[]>([]);
  useEffect(() => {
    const r = runSpike();
    setResults(r);
    console.log(`MARKDOIST_SPIKE ${JSON.stringify(r)}`);
  }, []);
  const allOk = results.length > 0 && results.every((r) => r.ok);
  return (
    <View style={styles.container}>
      <Text style={styles.title} testID="title">
        Markdoist
      </Text>
      <Text testID="spike-status">{results.length ? (allOk ? "Kern-Spike: OK" : "Kern-Spike: FEHLER") : "…"}</Text>
      <ScrollView style={styles.list}>
        {results.map((r) => (
          <Text key={r.name} style={r.ok ? styles.ok : styles.fail}>
            {r.ok ? "✓" : "✗"} {r.name} ({r.ms} ms): {r.detail}
          </Text>
        ))}
      </ScrollView>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 48, paddingHorizontal: 16 },
  title: { fontSize: 24, fontWeight: "600", marginBottom: 8 },
  list: { marginTop: 12 },
  ok: { color: "#2E7D32", marginBottom: 6 },
  fail: { color: "#C62828", marginBottom: 6 },
});
