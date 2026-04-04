# Brandschutz-Prüfungs-App

Eine einfache, kostenlose Web-App für die wiederkehrende Prüfung von Brandschutztüren – ohne Login, ohne Abo, ohne App-Installation.

## Dateien

| Datei | Beschreibung |
|---|---|
| `index.html` | Verwaltung: Türen anlegen, Protokoll einsehen, QR-Codes generieren |
| `pruefung.html` | Prüfformular: Wird per QR-Code geöffnet, mobil-optimiert |

## Einrichtung auf GitHub Pages (kostenlos)

### Schritt 1 – GitHub-Account erstellen
Falls noch keiner vorhanden: [github.com](https://github.com) → „Sign up"

### Schritt 2 – Neues Repository erstellen
1. Auf GitHub oben rechts auf „+" klicken → „New repository"
2. Name eingeben, z.B. `brandschutz`
3. **„Public"** auswählen (wichtig für kostenlose Pages)
4. Auf „Create repository" klicken

### Schritt 3 – Dateien hochladen
1. Im neuen Repository auf „uploading an existing file" klicken
2. Beide Dateien (`index.html` und `pruefung.html`) hochladen
3. Auf „Commit changes" klicken

### Schritt 4 – GitHub Pages aktivieren
1. Im Repository oben auf „Settings" klicken
2. Links auf „Pages" klicken
3. Unter „Branch" → „main" auswählen → „Save"
4. Nach ca. 1 Minute ist die Seite erreichbar unter:
   `https://DEIN-BENUTZERNAME.github.io/brandschutz/`

### Schritt 5 – Basis-URL eintragen
1. `index.html` öffnen → Tab „QR-Codes"
2. Die vollständige URL eintragen:
   `https://DEIN-BENUTZERNAME.github.io/brandschutz`
3. Die QR-Codes werden sofort aktualisiert

## Wie der QR-Code funktioniert

Jeder QR-Code enthält eine URL mit der Tür-ID:
```
https://dein-name.github.io/brandschutz/pruefung.html?tuer=T-001
```

Beim Scan öffnet sich `pruefung.html` automatisch mit der richtigen Tür vorausgewählt.

## Daten

Alle Daten (Türen + Protokolle) werden im **Browser-LocalStorage** des Geräts gespeichert.

**Wichtig:** Immer vom selben Gerät (Tablet/Laptop) prüfen, oder regelmäßig ein Backup machen:
- `index.html` → Tab „Einstellungen" → „Backup herunterladen"

## Hinweise

- Keine Internetverbindung während der Prüfung nötig (außer für den ersten Aufruf)
- Funktioniert auf jedem Smartphone, Tablet und PC
- QR-Codes können aus dem Browser ausgedruckt werden
- Export als CSV → direkt in Excel öffnen
