# PIZZINT Tracker - Webapp mit automatischer Datensammlung

Diese Webapp sammelt automatisch Pizza Index Daten und speichert sie in Supabase.
Die Daten werden alle 10 Minuten erfasst - auch wenn dein PC aus ist!

## 🚀 Schnell-Setup (10 Minuten)

### 1. Supabase Projekt erstellen

1. Gehe zu [supabase.com](https://supabase.com) und erstelle ein kostenloses Projekt
2. Warte bis das Projekt initialisiert ist (~2 Min)
3. Gehe zu **SQL Editor** und führe den Inhalt von `supabase-schema.sql` aus
4. Gehe zu **Project Settings → API** und kopiere:
   - `Project URL` (z.B. `https://xxxxx.supabase.co`)
   - `anon/public` Key (für Frontend)
   - `service_role` Key (für Collector - GEHEIM halten!)

### 2. Frontend konfigurieren

In `index.html`, ersetze diese Zeilen (~Zeile 170):

```javascript
const SUPABASE_URL = 'YOUR_SUPABASE_URL';  // ← Project URL einfügen
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';  // ← anon key einfügen
```

### 3. Auf Vercel deployen

1. Push den `webapp` Ordner zu GitHub
2. Gehe zu [vercel.com](https://vercel.com) und importiere das Repo
3. Füge Environment Variables hinzu:
   - `SUPABASE_URL` = deine Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = dein service_role key (geheim!)
4. Deploy!

Der Vercel Cron Job sammelt automatisch alle 10 Minuten Daten.

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

## 🆓 GitHub Actions Cron (EMPFOHLEN - Kostenlos!)

GitHub Actions bietet kostenlose Cron Jobs - keine Kosten!

### Setup:

1. **Repository zu GitHub pushen**
   ```bash
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/DEIN_USERNAME/pizzint-tracker.git
   git push -u origin main
   ```

2. **Secrets hinzufuegen** (Repository → Settings → Secrets → Actions)
   - `SUPABASE_URL` = deine Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = dein service_role key

3. **Fertig!** Der Workflow laeuft automatisch alle 10 Minuten.

Du kannst den Workflow auch manuell starten: Actions → "Collect Pizza Index Data" → "Run workflow"

### Kosten-Hinweis:
- GitHub Free: 2000 Min/Monat (reicht fuer ~1400 Runs = alle 10 Min)
- Fuer sparsameren Betrieb: In `.github/workflows/collect.yml` den Cron auf `*/30` aendern (alle 30 Min)

## 🔧 Alternative: Lokaler Collector

### Option A: Einmal ausfuehren
```bash
# .env Datei erstellen
cp .env.example .env
# Dann SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY eintragen

npm install
npm run collect
```

### Option B: Endlos laufen lassen (alle 10 Min)
```bash
npm run collect:continuous

# Mit pm2 im Hintergrund:
pm2 start scripts/continuous.js --name pizzint

# Oder auf Windows:
start /B node scripts/continuous.js > collector.log 2>&1
```

### Option C: System Cron (Linux/Mac)
```bash
# Crontab oeffnen
crontab -e

# Zeile hinzufuegen (alle 10 Min):
*/10 * * * * cd /path/to/webapp && node scripts/collect.js >> /var/log/pizzint.log 2>&1
```

## 🔍 Datenbankstruktur

### `pizza_readings`
- `timestamp` - Zeitstempel
- `index_value` - Pizza Index (0-100)
- `dc_hour` - Stunde in DC-Zeit (0-23)
- `dc_weekday` - Wochentag (0=So, 6=Sa)
- `is_overtime` - Außerhalb Bürozeiten?
- `is_weekend` - Wochenende?
- `raw_data` - Original API Response

### `pizza_spikes`
- Automatisch erkannte Spikes (>20 Punkte Anstieg oder >70 erreicht)

### `hourly_patterns` / `weekday_patterns`
- Automatisch berechnete Durchschnitte für Prognose

## 💰 Kosten

- **Supabase Free Tier**: 500MB Datenbank, reicht fuer ~2 Jahre Daten
- **GitHub Actions Free**: 2000 Min/Monat - KOMPLETT KOSTENLOS!
- **Vercel Free**: Hosting des Frontends (optional)
- **Vercel Pro** ($20/Monat): Nur wenn du Vercel Cron nutzen willst

## 🛠 Lokale Entwicklung

```bash
npm install
npm run dev
```

Dann http://localhost:5173 öffnen.

## 📊 Daten exportieren

Im Frontend gibt es einen "Export CSV" Button der alle Daten herunterlädt.

Oder direkt aus Supabase:
```sql
SELECT * FROM pizza_readings
ORDER BY timestamp DESC;
```

## ⚡ Realtime Updates

Das Frontend nutzt Supabase Realtime - neue Datenpunkte erscheinen automatisch ohne Refresh!

## 🔒 Sicherheit

- `anon` Key ist öffentlich (nur Lesen erlaubt durch RLS)
- `service_role` Key ist geheim (kann schreiben)
- Row Level Security ist aktiviert

---

**Fragen?** Die Datenquelle ist [pizzint.watch](https://www.pizzint.watch)
