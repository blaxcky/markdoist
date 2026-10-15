# Fragen zur Planung

## Runde 1

### F001

Wie soll die App heißen, und welche Android-Paketkennung (applicationId) soll sie bekommen?

Der Name erscheint in Fenstertitel, Startmenü, Android-Launcher und Paketnamen. Die applicationId (z. B. `de.markus.aufgaben`) lässt sich später nicht ändern, ohne dass Android sie als neue App behandelt. Empfehlung: ein kurzer deutscher Name, etwa „Aufgaben“, mit der Kennung `de.markus.aufgaben`. Ein Arbeitstitel genügt, solange die Kennung feststeht.

> [!NOTE] Antwort
> Markdoist soll sie heißen
> de.markdoist.aufgaben wäre gut

### F002

Nach welchem Schema sollen neue Aufgabendateien benannt werden?

Varianten:
- (a) aus dem Titel bei der Erstellung, z. B. `Zahnarzttermin vereinbaren.md`. Keine automatische Umbenennung bei Titeländerung, stattdessen die ausdrückliche Aktion „Dateinamen angleichen“.
- (b) ID-basiert, z. B. `01K7C9V3QH.md`.
- (c) Datum plus Titel, z. B. `2026-10-12 Zahnarzttermin vereinbaren.md`.

Empfehlung: (a). Die Dateien bleiben in Obsidian und im Dateimanager gut lesbar, und es entsteht keine unnötige Umbenennung. Maßgeblich bleibt in allen Fällen `title` im YAML.

> [!NOTE] Antwort
> Dateinamen bleiben lesbar, Titel kommt aber wie du sagst aus title YAML, wegen sondernzeichen und allem

### F003

Soll die App nur Dateien direkt im gewählten Aufgabenordner einlesen oder auch Unterordner?

Empfehlung: nur die oberste Ebene. Das ist einfacher, schneller (gerade über SAF) und vermeidet, dass Notizen aus Unterordnern versehentlich als Aufgaben gelten. Neue Aufgaben legt die App immer in der obersten Ebene an. Liest sie auch Unterordner, kannst du Aufgaben in Obsidian manuell in Unterordner einsortieren; der Unterordner hätte für die App aber keine Bedeutung (keine Projekte).

> [!NOTE] Antwort
> Soll eigtl keine Unterorder geben, aber oberste Ebene wäre sicherer.

### F004

Wo sollen gelöschte Aufgaben landen, und wie lange sollen sie aufbewahrt werden?

Empfehlung: im versteckten Ordner `.todo-trash/` innerhalb des Aufgabenordners. Syncthing gleicht ihn ab, sodass du auf jedem Gerät wiederherstellen kannst; Obsidian blendet ihn aus. Endgültig gelöscht wird nur über „Papierkorb leeren“, ohne automatische Frist. Alternative: ein gerätelokaler Papierkorb (nicht synchronisiert), oder automatisches Löschen nach z. B. 30 Tagen.

> [!NOTE] Antwort
> Empfehlung klingt gut, synchroniseren ist gut, automatisches löschen für die zukunft vlt mal, jetzt eher nicht

### F005

Welcher zeitliche Umfang soll in v1 bei Wiederholungen unterstützt werden?

Spezifikation Abschnitt 6 beschreibt den Aufwand. Stufen:
- (1) nur ganze Tage (keine Uhrzeiten in Serien);
- (2) zusätzlich eine feste Uhrzeit pro Vorkommen, z. B. „jeden Freitag 12:00“ (geringer Mehraufwand);
- (3) zusätzlich mehrere Vorkommen pro Tag, z. B. `BYHOUR=8,20` (mittlerer Aufwand; Historie mit Datumszeit-Schlüsseln);
- (4) zusätzlich stündliche oder minütliche Regeln (hoher Aufwand, die Historie wächst stark).

Empfehlung: (2) in v1. Der Kern wird so gebaut, dass (3) später ohne Formatbruch ergänzt werden kann; (4) nicht. Regeln einer nicht gewählten Stufe werden gelesen, angezeigt und unverändert gelassen, aber nicht fortgeschrieben.

> [!NOTE] Antwort
> Grundsätzlich habe ich nicht vor, mit Uhrzeiten viel zu arbeiten, aber (2) wäre als offene Alternative wohl ein guter weg

### F006

Soll die Historie zu jedem Vorkommen auch den tatsächlichen Erledigungszeitpunkt speichern?

Nach deiner Vorgabe (einfaches TaskNotes-Prinzip) gibt es zunächst nur Listen der Vorkommensdaten (`complete_instances`, `skipped_instances`) plus `last_completed_at` für die letzte Erledigung. Die Historie zeigt dann „Vorkommen Fr 02.10. erledigt“, aber nicht „erledigt am Sa 10.10.“ (außer bei der letzten Erledigung). Eine Ergänzung wäre eine zusätzliche Liste `completion_times` mit Einträgen wie `2026-10-02 @ 2026-10-10T10:32:00+02:00`. Empfehlung: nein, die einfachen Listen genügen; eine Ergänzung ist später ohne Formatbruch möglich.

> [!NOTE] Antwort
> wie in tasknote, wenn das dort nicht vorhanden ist, brauch ich das erstmal auch icht

### F007

Brauchst du in v1 eine manuelle Reihenfolge (Aufgaben per Ziehen anordnen)?

Eine manuelle Reihenfolge ist nicht aus den Aufgabendaten ableitbar und müsste in einer zusätzlichen synchronisierten Datei (z. B. `.todo/order.json`) oder in einem Feld pro Aufgabe gespeichert werden. Beides erhöht die Gefahr von Sync-Konflikten. Empfehlung: nein. v1 sortiert nur nach Fälligkeit, Planung, Priorität, Titel und Erstelldatum.

> [!NOTE] Antwort
> dann bleiben wir bei nein, genau

### F008

Soll es auf dem Desktop eine systemweite Schnellerfassung geben, die auch funktioniert, wenn das App-Fenster nicht im Vordergrund ist?

Globale Tastenkürzel funktionieren aus Electron heraus unter GNOME/Wayland nicht zuverlässig. Wayland-taugliche Lösung: Die App versteht den Aufruf `<app> --capture`. Du legst in den GNOME-Einstellungen ein eigenes Tastenkürzel an, das ihn ausführt; es öffnet den Erfassungsdialog der laufenden (oder startenden) App. Empfehlung: ja, in dieser Form (geringer Aufwand). Innerhalb der App gibt es die Tastenkürzel ohnehin.

> [!NOTE] Antwort
> brauchts eigtl nix globales

### F009

Welche zusätzlichen Einstiege zur Schnellerfassung soll Android in v1 bekommen?

Optionen:
- (a) App-Verknüpfung „Neue Aufgabe“ beim langen Drücken auf das App-Symbol (geringer Aufwand);
- (b) „Teilen an …“ aus anderen Apps, z. B. Text oder Link aus dem Browser als neue Eingangsaufgabe (mittlerer Aufwand);
- (c) keine, nur der Plus-Button in der App.

Empfehlung: (a). (b) später, wenn gewünscht.

> [!NOTE] Antwort
> als app verknüpfung könnte man das gleich machen, ja

### F010

In welchem Paketformat soll die Desktop-App für Fedora gebaut werden?

Optionen: RPM (Installation mit `dnf`, sauberer Desktop-Eintrag), AppImage (eine einzelne ausführbare Datei ohne Installation), Flatpak (erheblicher Mehraufwand; Dateizugriff nur über Portale bzw. Freigaben). Empfehlung: RPM als Hauptformat, optional zusätzlich AppImage (fast ohne Mehraufwand).

> [!NOTE] Antwort
> bleiben wir dann per dnf, grundsätzlich nutze auch nur ich das programm

### F011

Auf welchem Android-Gerät mit welcher Android-Version soll die App laufen, und kannst du Tests auf diesem Gerät selbst durchführen (z. B. per USB-Debugging oder durch Installation einer APK)?

Ich kann nur Emulatoren und automatisierte Prüfungen selbst ausführen. Echte Gerätetests (Berechtigungen nach Neustart, Syncthing-Zusammenspiel, Herstelleranpassungen) bräuchten deine Mitwirkung; in Berichten trenne ich das ausdrücklich. Bitte Gerätemodell, Android-Version und ob USB-Debugging möglich ist.

> [!NOTE] Antwort
> immer apk builden, das soll dann github erledigen und die apk bereit stellen, ich installiere das am handy dann manuell über optainium.. expo soll für react native halt gentzt werden, ist das im plan wo erwähnt? 

### F012

Wie sieht dein Synchronisations-Setup aus?

Konkret: Welche Syncthing-App nutzt du auf Android (die offizielle App wurde meines Wissens Ende 2024 eingestellt; verbreitet ist die Community-Fortführung „Syncthing-Fork“)? Wo liegt der Vault auf Android (interner gemeinsamer Speicher, z. B. `Documents/…`, oder SD-Karte)? Wo liegt er auf Fedora? Ist Obsidian auf beiden Geräten aktiv und bearbeitet dort ggf. gleichzeitig dieselben Dateien? Die Antworten bestimmen die M1-Speicherprobe. Ordner im Bereich `Android/data`, das Speicher-Wurzelverzeichnis und `Download` selbst kann Android über SAF nicht freigeben.

> [!NOTE] Antwort
> obsidian kann den ordner lesen, der befindet sich in documents am handy, kümmere dich nicht darum, wie ich das synce, das läuft bereits schon

### F013

Gibt es bereits Aufgabendateien, die die App beim ersten Start vorfinden soll (z. B. aus TaskNotes oder einem anderen Werkzeug)?

Falls ja: wo, ungefähr wie viele, und soll die App sie nur tolerant lesen (fehlende Felder im Speicher ergänzen, nichts umschreiben) oder soll es eine ausdrückliche, einmalige Übernahme mit Vorschau geben? Empfehlung, falls vorhanden: nur tolerant lesen. Eine Übernahme-Funktion nur bei Bedarf.

> [!NOTE] Antwort
> ich füge das dann manuell dazu, muss nix automatisch beim start importieren

### F014

Darf ich für den Android-Build zusätzliche Werkzeuge auf deinem System einrichten, falls der Build mit dem vorhandenen JDK 21 nicht funktioniert?

React Native empfiehlt JDK 17, Fedora 43 bietet nur JDK 21 und 25. Vorgehen: zuerst JDK 21 versuchen. Falls nötig: (a) Temurin JDK 17 als Archiv im Benutzerverzeichnis (ohne `sudo`, nur für diesen Build über `JAVA_HOME`), oder (b) Build in einem Podman-Container (nichts auf dem System selbst installiert, aber langsamer). Empfehlung: (a). Sonstige Installationen (z. B. `libxcrypt-compat` für den RPM-Bau, pnpm über corepack) würde ich ebenfalls vorher kurz ankündigen.

> [!NOTE] Antwort
> react native auf jeden fall mit expo nutzen, sonst kannt du gerne zusätzliche dinge installieren

## Runde 2

### F015

Bezug: F011. Unter welchem GitHub-Konto und welchem Repository-Namen soll Markdoist liegen, und soll das Repository öffentlich oder privat sein?

GitHub Actions baut die APK und hängt sie an ein Release; Obtainium verfolgt diese Releases. Ist das Repository öffentlich, findet Obtainium die Releases ohne weitere Einstellungen, und die Build-Minuten sind kostenlos. Ist es privat, braucht Obtainium ein persönliches GitHub-Zugriffstoken (nur Leserechte), und die kostenlosen Actions-Minuten sind begrenzt (2 000 Minuten im Monat; ein Android-Build braucht grob 10–15 Minuten). Der Signierschlüssel liegt in beiden Fällen nur als verschlüsseltes Secret bei GitHub, nie im Code. Empfehlung: öffentlich, Name `markdoist`, sofern es dich nicht stört, dass der Code sichtbar ist.

> [!NOTE] Antwort
> öffentlich markdoist ist ok, nutze github cli

### F016

Bezug: F011 („immer APK bauen“). Wann soll GitHub eine neue installierbare Version veröffentlichen, die Obtainium anzeigt?

- (a) Bei jedem Push auf `main` automatisch ein Release (z. B. `0.1.57`). Obtainium meldet jede Änderung als Update.
- (b) Nur wenn ich eine Version ausdrücklich mit einem Tag wie `v0.2.0` markiere. Pushes auf `main` bauen die APK nur zur Prüfung; sie ist dann in GitHub Actions herunterladbar, aber nicht in Obtainium.
- (c) Beides: Pushes auf `main` erzeugen Vorabversionen (pre-release), Tags normale Versionen. In Obtainium entscheidest du mit dem Schalter „Vorabversionen einbeziehen“, ob du jede Änderung oder nur fertige Versionen bekommst.

Empfehlung: (c). Damit wird wirklich immer gebaut und bereitgestellt, und du kannst jederzeit auf „nur stabile Versionen“ umschalten.

> [!NOTE] Antwort
> ich will grundsätzlich jede änderung als release zum testen, also (a)

### F017

Bezug: F010. Soll GitHub zusätzlich das RPM für Fedora bauen und an dasselbe Release hängen?

Dann lädst du das RPM von der Release-Seite herunter und installierst es mit `sudo dnf install ./markdoist-<version>.x86_64.rpm`. Ohne diese Option baue ich das RPM nur lokal auf deinem Rechner. Ein eigenes dnf-Repository mit automatischen Updates wäre für eine einzelne Person unnötiger Aufwand und ist nicht vorgesehen. Empfehlung: ja, mitbauen und anhängen; der lokale Build bleibt trotzdem möglich.

> [!NOTE] Antwort
> kannst du mal mitbauen, ja

### F018

Bezug: F011. Dieser Teil der Frage ist noch offen: Welche Android-Version hat dein Handy, und bist du bereit, an zwei Stellen eine kurze Prüfliste auf dem Handy abzuarbeiten und mir das Ergebnis zurückzumelden?

Die erste Stelle ist M1, die Speicherprobe: Ordner wählen, Datei anlegen, in Obsidian ändern, App und Handy neu starten, Abgleich mit deinem Sync. Die zweite ist die Abnahme der Android-Version. Jede Prüfliste hat etwa 10 Schritte und braucht rund 10–15 Minuten. Ich selbst prüfe nur im Emulator. Ohne deine Rückmeldung kennzeichne ich die betroffenen Punkte als „nur im Emulator geprüft“. Die Android-Version findest du unter Einstellungen → Über das Telefon.

> [!NOTE] Antwort
> _Android_ 16, ich will ja eigtl nix testen müssen für dich, das läuft dann schon, wieso sollte es auch nicht? total unnötig finde ich
