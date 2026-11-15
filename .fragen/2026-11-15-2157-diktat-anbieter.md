---
fragen-tool: 1
titel: Diktieren mit anderen Anbietern und lokalem Modell
status: beantwortet
---

Diktat, Bereinigung und Titelvorschlag sollen nicht mehr nur über OpenAI laufen. Geplant ist: Bereinigung und Titel über Claude Haiku 5.5, Spracherkennung wahlweise in der Cloud oder lokal auf dem Gerät (Parakeet v3 über sherpa-onnx). Vor dem Start brauche ich vier Entscheidungen.

## 1. Welche Cloud-Anbieter für die Spracherkennung sollen zur Auswahl stehen?
<!-- typ: mehrfach -->

OpenAI bleibt in jedem Fall. Groq, Mistral und „Eigener Server“ nutzen dieselbe Schnittstelle wie OpenAI und kosten wenig Aufwand. ElevenLabs hat eine eigene Schnittstelle und braucht etwas mehr Code.

- [x] Groq (empfohlen) — Whisper large-v3-turbo, sehr günstig (laut Vergleichsseiten etwa 0,04 $ pro Stunde), schnell
- [ ] Mistral — Voxtral, europäischer Anbieter
- [ ] Eigener Server — frei wählbare URL, z. B. faster-whisper auf dem PC
- [ ] ElevenLabs Scribe — gute Erkennung, eigene Schnittstelle, teurer

<!-- antwort -->
vlt gemini über google ai api
<!-- /antwort -->

## 2. Welches lokale Modell soll es geben?
<!-- typ: einfach -->

Parakeet v3 (≈ 640 MB) kann Deutsch, setzt Satzzeichen selbst und ist auf dem Handy deutlich schneller als in Echtzeit. Whisper large-v3-turbo (≈ 550 MB) erkennt ähnlich gut und versteht die Listentitel als Kontext, ist auf dem Handy aber deutlich langsamer. Ein zweites Modell heißt eine zweite Engine und mehr Pflege.

- [x] Nur Parakeet v3 (empfohlen) — eine Engine für Handy und Desktop
- [ ] Parakeet v3 und zusätzlich Whisper turbo — zur Wahl in den Einstellungen
- [ ] Nur Whisper turbo — statt Parakeet

<!-- antwort -->
<!-- /antwort -->

## 3. Auf welchen Geräten soll die lokale Erkennung kommen?
<!-- typ: einfach -->

Auf Android wird die APK um die Laufzeitbibliotheken größer, etwa 15–20 MB pro Prozessorarchitektur. Das Modell selbst lädt man erst auf Knopfdruck herunter.

- [x] Android und Desktop (empfohlen)
- [ ] Nur Android
- [ ] Nur Desktop

<!-- antwort -->
<!-- /antwort -->

## 4. In welcher Reihenfolge soll ich vorgehen?
<!-- typ: einfach -->

Jeder Schritt wird einzeln getestet, committet und gepusht.

- [x] Claude zuerst, dann Cloud-Erkennung, dann lokal (empfohlen) — die Bereinigung ist schnell unabhängig von OpenAI
- [ ] Erst alles in der Cloud (Claude und Groq/Mistral), lokal später in einer eigenen Runde
- [ ] Lokale Erkennung zuerst

<!-- antwort -->
<!-- /antwort -->
