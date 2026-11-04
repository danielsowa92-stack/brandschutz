# Brandschutz-Prüfung

Wiederkehrende Prüfung von Feuer- und Rauchschutztüren: **zur Tür gehen, QR-Code scannen, Prüfung erfassen, fertig.**

Das Repository enthält zwei Versionen:

| Version | Ort | Status |
|---|---|---|
| **Android-App** (neu) | Ordner [`app/`](app/) | empfohlen, komplett offline, SQLite-Datenbank |
| Web-Version (alt) | Hauptordner (`start.html`, `pruefung.html`, `verwaltung.html`) | läuft weiter auf GitHub Pages |

---

## 1. App herunterladen

**Fester Download-Link (immer die neueste Version, ohne GitHub-Anmeldung):**
https://github.com/danielsowa92-stack/brandschutz/releases/latest/download/Brandschutz-Pruefung.apk

Eine neue Version entsteht automatisch, sobald Änderungen in den Branch `main` übernommen werden (Pull Request „Merge“).
Alle Versionen: https://github.com/danielsowa92-stack/brandschutz/releases

## 2. Auf Android installieren

1. Den Link oben am Handy öffnen → `Brandschutz-Pruefung.apk` wird heruntergeladen.
2. Datei antippen (Benachrichtigung oder App „Dateien“ → Downloads).
3. Android fragt nach **„Installation aus unbekannten Quellen“** → für Browser/Dateimanager erlauben.
4. **Installieren** tippen. Warnt Google Play Protect („unbekannte App“) → „Trotzdem installieren“.
5. Beim ersten Scan nach der **Kamera-Berechtigung** fragen lassen → erlauben.

Voraussetzung: Android 7.0 oder neuer.

## Updates – ohne Datenverlust

- Hat das Handy Internet, zeigt die App auf der Startseite **„Neue App-Version verfügbar“** → *Update herunterladen* → APK antippen → **Aktualisieren**.
- Manuell: **Mehr → App-Version → Nach Updates suchen**, oder einfach den Download-Link oben erneut öffnen.
- Die Daten bleiben beim Update erhalten. Änderungen an der Datenbank werden beim ersten Start automatisch übernommen.
- **Niemals die App deinstallieren** – dabei löscht Android alle Daten. Falls doch nötig: vorher Backup!
- Die App erinnert auf der Startseite an ein Backup, wenn das letzte älter als 30 Tage ist.

Warum das funktioniert: Jede Version ist mit demselben Schlüssel signiert und hat eine höhere Versionsnummer (fortlaufende Build-Nummer).
Android akzeptiert nur Updates mit gleicher Signatur – deshalb ist der Schlüssel wichtig (siehe unten).

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

## Einrichtung (einmalig, für den Betreuer)

Damit Updates funktionieren, braucht GitHub den Signaturschlüssel als **Secret**:

1. GitHub → Repository → **Settings → Secrets and variables → Actions → New repository secret**
2. Secret `KEYSTORE_BASE64` = Inhalt der Datei `keystore-base64.txt` (eine lange Zeile)
3. Secret `KEYSTORE_PASSWORD` = Inhalt von `keystore-passwort.txt`

Ohne diese Secrets baut GitHub nur eine Debug-APK (Warnung im Actions-Lauf), die **nicht** updatefähig ist, und es wird kein Release veröffentlicht.

> ⚠️ Die Datei `brandschutz-release.keystore` und das Passwort zusätzlich **sicher aufbewahren** (z. B. Passwort-Manager, USB-Stick).
> GitHub-Secrets lassen sich nicht wieder auslesen. Geht der Schlüssel verloren, kann keine Update-Version mehr gebaut werden –
> dann wäre eine Neuinstallation mit Backup/Wiederherstellung nötig.

## Für Entwickler

```bash
cd app
npm install
npm run dev        # Browser-Version zum Testen (SQLite via sql.js, kein Kamera-Scan)
npm test           # Unit-Tests der Logik
npm run sync       # Web-App bauen und ins Android-Projekt kopieren
cd android && ./gradlew assembleDebug
```

Änderungen an der Datenbankstruktur **nur als neue Migration** in `app/src/db.js` (Array `MIGRATIONS` ergänzen), nie bestehende ändern – so werden vorhandene Daten beim Update automatisch angepasst.

Technik: Capacitor 8, Vite, Vanilla-JS (keine Framework-Abhängigkeit), SQLite über `@capacitor-community/sqlite`,
QR-Scan über ML Kit (`@capacitor-mlkit/barcode-scanning`, gebündeltes Modell → offline), `qrcode`, `jspdf` + `jspdf-autotable`,
`write-excel-file`, `@capacitor/filesystem` + `@capacitor/share`, `@capacitor/camera`, `@capacitor/local-notifications`.

App-Icons neu erzeugen (nach `npx cap add android`): `python3 scripts/make_icons.py`.
