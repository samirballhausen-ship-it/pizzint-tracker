# PIZZINT Tracker - Webapp mit automatischer Datensammlung

Diese Webapp sammelt automatisch Pizza Index Daten und speichert sie direkt im GitHub Repository.
Die Daten werden alle 10 Minuten erfasst - auch wenn dein PC aus ist!

**⚠️ Hinweis**: GitHub Actions scheduled workflows können verzögert sein (bis zu mehreren Stunden). Dies ist eine bekannte Einschränkung von GitHub Actions auf Free Tier. Für 100% zuverlässiges Timing sollte ein externer Cron-Service verwendet werden.

## 🚀 Schnell-Setup (2 Minuten)

### Setup ist bereits erledigt!

Das Repository ist fertig konfiguriert:
- ✅ GitHub Actions Workflow läuft automatisch alle 10 Minuten
- ✅ Daten werden in `data/readings.json` gespeichert
- ✅ Frontend lädt Daten direkt von GitHub
- ✅ Keine externe Datenbank benötigt!

### Optional: Manueller Workflow-Start

Falls die automatische Sammlung verzögert ist:

**Option 1: Via GitHub UI** (Empfohlen)
1. Gehe zu **Actions** → **Collect Pizza Index Data**
2. Klicke **Run workflow** → **Run workflow**
3. Warte ~10 Sekunden bis neue Daten gesammelt sind

**Option 2: Lokales Script ausführen** (benötigt Node.js 18+)
```bash
# Im Repository-Verzeichnis:
node scripts/collect-manual.js

# Dann committen und pushen:
git add data/readings.json
git commit -m "Manual data collection"
git push
```

### GitHub Pages aktivieren (falls noch nicht aktiv)

1. Gehe zu **Settings** → **Pages**
2. Wähle **Source**: `Deploy from a branch`
3. Wähle **Branch**: `master` / `root`
4. Speichern - fertig!

## 📁 Dateien

```
webapp/
├── index.html              # Frontend (kann auch lokal geöffnet werden)
├── api/
│   └── collect.js          # Vercel Serverless Function
├── scripts/
│   ├── collect.js          # Standalone Collector (einmalig)
│   └── continuous.js       # Endlos-Collector (alle 10 Min)
├── .github/workflows/
│   └── collect.yml         # GitHub Actions Cron (KOSTENLOS!)
├── supabase-schema.sql     # Datenbank-Schema
├── vercel.json             # Vercel Konfiguration
├── package.json            # Dependencies
└── README.md               # Diese Datei
```

## 🤖 Automatische Datensammlung

### GitHub Actions Workflow

Der Workflow `.github/workflows/collect.yml` läuft automatisch:
- **Zeitplan**: Alle 10 Minuten (cron: `*/10 * * * *`)
- **Kostenlos**: GitHub Free Tier inkludiert 2000 Min/Monat
- **Daten**: Werden in `data/readings.json` im Repository gespeichert

### ⚠️ Bekannte Einschränkungen

**GitHub Actions scheduled workflows sind nicht 100% zuverlässig:**
- Runs können verzögert sein (Minuten bis Stunden)
- Free Tier hat niedrigere Priorität als bezahlte Accounts
- Bei hoher Last auf GitHub werden Free Tier Workflows gedrosselt
- Dies ist eine bekannte GitHub-Einschränkung und kein Bug

**Workarounds:**
1. **Manueller Start**: Actions → "Collect Pizza Index Data" → "Run workflow"
2. **Externe Überwachung**: Services wie cron-job.org können GitHub Actions triggern
3. **Längere Intervalle**: Auf `*/30` (alle 30 Min) ändern für stabilere Ausführung

### Für 100% zuverlässiges Timing

Nutze einen externen Cron-Service der GitHub Actions per API triggert:
- [cron-job.org](https://cron-job.org) (kostenlos)
- Eigener Server mit cron + GitHub Actions API
- Vercel Cron (kostenpflichtig)

## 📊 Datenstruktur

Die Daten werden in `data/readings.json` gespeichert:

```json
{
  "readings": [
    {
      "timestamp": "2026-01-19T09:01:47Z",
      "index_value": 4.22,
      "dc_hour": 4,
      "dc_weekday": 1,
      "is_overtime": true,
      "is_weekend": false
    }
  ],
  "spikes": [],
  "lastUpdate": "2026-01-19T09:01:47Z"
}
```

### Felder:
- `index_value`: Durchschnittliche Popularität aller Locations (0-100)
- `dc_hour`: Stunde in DC-Zeit (0-23)
- `dc_weekday`: Wochentag (0=Sonntag, 6=Samstag)
- `is_overtime`: Außerhalb 6-18 Uhr?
- `is_weekend`: Samstag oder Sonntag?
- `spikes`: Array von erkannten Spikes (>20 Punkte oder >70 von <55)

## 💰 Kosten

- **Komplett kostenlos!**
- GitHub Actions Free: 2000 Min/Monat (bei ~1 Min pro Run = ausreichend für tausende Runs)
- GitHub Pages: Kostenlos für public repositories
- Keine externe Datenbank benötigt

## 🛠 Architektur

### Stack:
- **Frontend**: Vanilla HTML/JS mit Chart.js
- **Datenquelle**: [pizzint.watch API](https://www.pizzint.watch/api/dashboard-data)
- **Storage**: Git-basiert in `data/readings.json`
- **Automation**: GitHub Actions scheduled workflow
- **Hosting**: GitHub Pages

### Vorteile:
- ✅ Keine externe Datenbank
- ✅ Keine API Keys / Secrets benötigt
- ✅ Daten sind versioniert (Git History)
- ✅ Komplett kostenlos
- ✅ Einfaches Setup

### Nachteile:
- ⚠️ GitHub Actions Cron nicht 100% zuverlässig (siehe oben)
- ⚠️ Daten sind öffentlich (public repository)
- ⚠️ Keine Realtime-Updates (Frontend pollt alle paar Sekunden)

---

**Fragen?** Die Datenquelle ist [pizzint.watch](https://www.pizzint.watch)
