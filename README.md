# Brandschutz-Prüfung

Wiederkehrende Prüfung von Feuer- und Rauchschutztüren: **zur Tür gehen, QR-Code scannen, Prüfung erfassen, fertig.**

Das Repository enthält zwei Versionen:

| Version | Ort | Status |
|---|---|---|
| **Android-App** (neu) | Ordner [`app/`](app/) | empfohlen, komplett offline, SQLite-Datenbank |
| Web-Version (alt) | Hauptordner (`start.html`, `pruefung.html`, `verwaltung.html`) | läuft weiter auf GitHub Pages |

---

## 1. APK herunterladen

Die App wird bei jedem Push automatisch von GitHub gebaut.

1. Auf GitHub im Repository oben auf **Actions** tippen.
2. Den obersten grünen Lauf **„Android Debug-APK“** öffnen.
3. Ganz unten unter **Artifacts** auf **Brandschutz-Pruefung-APK** tippen → es wird eine ZIP-Datei heruntergeladen.
4. ZIP entpacken → darin liegt `Brandschutz-Pruefung-debug-xxxxxxx.apk`.

> Hinweis: Zum Herunterladen von Artifacts muss man bei GitHub angemeldet sein. Artifacts werden 30 Tage aufbewahrt.

## 2. Auf Android installieren

1. Die APK-Datei aufs Handy bringen (direkt am Handy herunterladen, per USB-Kabel, Google Drive o. Ä.).
2. Im Dateimanager auf die APK tippen.
3. Android fragt nach **„Installation aus unbekannten Quellen“** → für den Dateimanager/Browser erlauben.
4. **Installieren** tippen. Evtl. warnt Google Play Protect, weil die App nicht aus dem Play Store kommt → „Trotzdem installieren“.
5. Beim ersten Scan fragt die App nach der **Kamera-Berechtigung** → erlauben.

**Update:** Neue APK einfach drüber installieren – die Daten bleiben erhalten.
**Wichtig:** Vor dem Deinstallieren immer ein Backup machen, sonst sind die Daten weg.

Voraussetzung: Android 7.0 oder neuer.

## 3. Bedienung (Kurzfassung)

1. **Objekte → + Neues Objekt**: Name, Kürzel (z. B. `RM`), Kunde, Adresse.
2. Im Objekt **+ Tür hinzufügen**: Die Tür-ID wird automatisch vergeben (`RM-0001`, `RM-0002`, …).
3. Im Objekt **QR-Etiketten (PDF)** → Druckbogen A4 mit 3 × 8 Etiketten (70 × 37 mm, z. B. Avery Zweckform 3474) drucken und an die Türen kleben.
4. Vor Ort: **Scan** (roter Knopf unten) → QR-Code in den Rahmen halten (🔦 Licht bei dunklen Fluren).
   - Bekannte Tür → Türansicht mit letzter Prüfung → **Prüfung erfassen**.
   - Unbekannte ID → die App bietet an, die Tür anzulegen.
5. Im Prüfdialog:
   - **„Alles in Ordnung“** = ein Tipp, gespeichert, fertig.
   - Bei Mangel: Checkliste-Punkt auf **Mangel** tippen → Beschreibung, Maßnahme (reparieren / bestellen / vor Ort erledigt), Material und Fotos erfassen.
   - Die nächste Prüfung wird aus dem Intervall berechnet (Standard 12 Monate) und kann geändert werden.
6. QR-Code nicht lesbar? **Suche** → nach ID, Positionsnummer, Geschoss oder Raum suchen.
7. **Start** zeigt: überfällig, in 30 Tagen fällig, offene Mängel, Bestellliste, noch nie geprüft.

Mangel erledigt? Mangel öffnen → **„Mangel behoben“** mit Datum. Wird eine Tür später „in Ordnung“ geprüft, fragt die App, ob offene Mängel als behoben markiert werden sollen.

## 4. Export, Backup und Teilen

Alles unter **Mehr**:

- **Excel-Export (.xlsx)** – Blätter *Türen*, *Prüfungen*, *Offene Mängel*, *Bestellliste*; alle Objekte oder ein bestimmtes Objekt.
- **Prüfbericht (PDF)** für den Kunden – im jeweiligen Objekt.
- **Backup erstellen** – eine JSON-Datei mit allen Daten **inkl. Fotos**. Danach öffnet sich das Android-Teilen-Menü (Mail, WhatsApp, Google Drive, „In Dateien speichern“ …).
  → **Regelmäßig machen und außerhalb des Handys ablegen!**
- **Backup wiederherstellen** – ersetzt **alle** Daten in der App durch das Backup (z. B. auf einem neuen Handy).
- **Gespeicherte Dateien** – alle erzeugten Exporte bleiben in der App gespeichert und können später erneut geteilt werden.

## 5. Daten aus der alten Web-Version übernehmen

Die alte Web-Version speichert ihre Daten im Browser (localStorage). Die App kann diese nicht direkt lesen, deshalb:

1. Am Handy (bzw. an dem Gerät, auf dem bisher geprüft wurde) die **alte Web-Version** im gleichen Browser öffnen → **Verwaltung → Prüfprotokoll → „Daten für Android-App exportieren“**. Es wird `brandschutz_web_export_JJJJ-MM-TT.json` heruntergeladen.
2. In der App: **Mehr → Import aus alter Web-Version** → die Datei auswählen.

So werden die Daten übernommen:

| Alt (Web) | Neu (App) |
|---|---|
| Firma / Objekt | Objekt (Kürzel wird automatisch gebildet); ohne Firma → Objekt „Importiert (ohne Objekt)“ |
| Tür-ID | Tür-ID **unverändert** → alte QR-Aufkleber funktionieren weiter (auch QR-Codes mit Link `…/pruefung.html?tuer=…`) |
| Etage (+ Gebäude) | Geschoss |
| Standort | Raum |
| Türtyp T30/T90/RS | Typ T30/T90/RS; T60, Fluchttür, Sonstige → „sonstige“ (Original in der Notiz) |
| Bezeichnung, Baujahr, Gebäude | Notiz |
| Status OK / Mangel / Dringend | in Ordnung / Mangel / Mangel mit Vermerk „DRINGEND:“ |
| Bemerkung | Mangelbeschreibung (bei OK: Bemerkung) |
| Checkliste (abgehakte Punkte) | Checkliste, abgehakte Punkte = „i.O.“ |

- Nächste Prüfung = Prüfdatum + 12 Monate.
- Ein Mangel gilt als behoben, wenn es danach eine OK-Prüfung derselben Tür gibt.
- Tür-IDs, die in der App schon existieren, werden übersprungen (doppelter Import ist also unschädlich).

---

## Für Entwickler

```bash
cd app
npm install
npm run dev        # Browser-Version zum Testen (SQLite via sql.js, kein Kamera-Scan)
npm test           # Unit-Tests der Logik
npm run sync       # Web-App bauen und ins Android-Projekt kopieren
cd android && ./gradlew assembleDebug
```

Technik: Capacitor 8, Vite, Vanilla-JS (keine Framework-Abhängigkeit), SQLite über `@capacitor-community/sqlite`,
QR-Scan über ML Kit (`@capacitor-mlkit/barcode-scanning`, gebündeltes Modell → offline), `qrcode`, `jspdf` + `jspdf-autotable`,
`write-excel-file`, `@capacitor/filesystem` + `@capacitor/share`, `@capacitor/camera`, `@capacitor/local-notifications`.

App-Icons neu erzeugen (nach `npx cap add android`): `python3 scripts/make_icons.py`.
