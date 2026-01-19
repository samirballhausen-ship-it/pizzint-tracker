# FIX: Automatic Data Collection Without Manual Triggering

## Problem Statement

The GitHub Actions scheduled workflow (cron) is unreliable on free tier accounts. Workflows can be delayed by minutes to hours, causing the app to show stale data. Users should not need to manually trigger data collection.

## Root Cause

- **GitHub Actions scheduled workflows** (`schedule` event with cron) are throttled on free tier
- Runs can be delayed arbitrarily during high load periods
- No guarantees on execution timing
- This is a known GitHub platform limitation, not a bug

## Solution Options

Below are three production-ready solutions to replace the unreliable GitHub Actions cron. Choose one based on your needs.

---

## Option 1: GitHub Actions with Repository Dispatch (RECOMMENDED)

Use an external free cron service to trigger GitHub Actions via `repository_dispatch` event. This is more reliable than scheduled workflows.

### Implementation Steps:

#### 1. Update Workflow File

Edit `.github/workflows/collect.yml`:

```yaml
name: Collect Pizza Index Data

on:
  # Remove or comment out the schedule trigger
  # schedule:
  #   - cron: '*/10 * * * *'
  
  # Add repository_dispatch trigger
  repository_dispatch:
    types: [collect-data]
  
  # Keep manual trigger for testing
  workflow_dispatch:

permissions:
  contents: write

jobs:
  collect:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Collect and save data
        run: |
          # [Keep existing collection logic unchanged]
          # ... (all the bash script from lines 38-135 stays the same)

      - name: Commit and push
        run: |
          git config --local user.email "github-actions[bot]@users.noreply.github.com"
          git config --local user.name "github-actions[bot]"
          git add data/readings.json
          git diff --quiet && git diff --staged --quiet || (git commit -m "Auto-collect: $(date -u +%Y-%m-%d\ %H:%M) UTC" && git push)
```

#### 2. Create GitHub Personal Access Token

1. Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click "Generate new token (classic)"
3. Name it: `pizzint-tracker-cron`
4. Select scopes:
   - `repo` (Full control of private repositories)
   - `workflow` (Update GitHub Action workflows)
5. Generate and **save the token securely**

#### 3. Configure External Cron Service

**Option A: cron-job.org (Free, Reliable)**

1. Go to https://cron-job.org/en/
2. Sign up for free account
3. Create new cron job:
   - **Title**: `Pizza Index Collector`
   - **URL**: `https://api.github.com/repos/samirballhausen-ship-it/pizzint-tracker/dispatches`
   - **Schedule**: `*/10 * * * *` (every 10 minutes)
   - **Request Method**: `POST`
   - **Request Body** (JSON):
     ```json
     {
       "event_type": "collect-data"
     }
     ```
   - **Headers**:
     ```
     Authorization: Bearer YOUR_GITHUB_TOKEN_HERE
     Accept: application/vnd.github+json
     Content-Type: application/json
     X-GitHub-Api-Version: 2022-11-28
     ```
4. Save and enable the job

**Option B: EasyCron (Free tier available)**

1. Go to https://www.easycron.com/
2. Sign up and create new cron job
3. Configure similarly to cron-job.org above

**Option C: UptimeRobot (Monitor + Trigger)**

1. Sign up at https://uptimerobot.com/
2. Create HTTP(s) monitor that POSTs to GitHub API
3. Check interval: 5 minutes (minimum on free tier)

#### 4. Verification

- Check cron-job.org dashboard for successful executions
- Monitor GitHub Actions tab for workflow runs
- Verify `data/readings.json` updates every 10 minutes

### Pros:
✅ Free and reliable (99.9% uptime from external services)  
✅ Exact timing (no GitHub throttling)  
✅ Easy to monitor and debug  
✅ Can switch providers if needed

### Cons:
❌ Requires external service account  
❌ Need to manage GitHub token securely  
❌ Dependency on third-party service

---

## Option 2: Vercel Cron Jobs (Serverless Function)

Deploy a serverless function on Vercel that runs on schedule and updates GitHub.

### Implementation Steps:

#### 1. Create Vercel Account

1. Go to https://vercel.com
2. Sign up (free tier sufficient)
3. Connect your GitHub repository

#### 2. Create Serverless Function

Create file `api/collect-cron.js`:

```javascript
// api/collect-cron.js
export default async function handler(req, res) {
  // Verify Vercel cron secret (optional security)
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Fetch data from Pizza Index API
    const response = await fetch('https://www.pizzint.watch/api/dashboard-data');
    const json = await response.json();

    if (!json.success || !json.data) {
      throw new Error('Invalid API response');
    }

    // Calculate index
    const pops = json.data.map(l => l.current_popularity || 0);
    const index = pops.reduce((a, b) => a + b, 0) / pops.length;

    // Get DC time info
    const now = new Date();
    const dcTime = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
    const dcDate = new Date(dcTime);
    const hour = dcDate.getHours();
    const weekday = dcDate.getDay();
    
    const isOvertime = hour >= 18 || hour < 6;
    const isWeekend = weekday === 0 || weekday === 6;

    // Trigger GitHub Actions via repository_dispatch
    const githubResponse = await fetch(
      'https://api.github.com/repos/samirballhausen-ship-it/pizzint-tracker/dispatches',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        body: JSON.stringify({
          event_type: 'collect-data',
          client_payload: {
            index: index.toFixed(2),
            hour,
            weekday,
            isOvertime,
            isWeekend
          }
        })
      }
    );

    if (!githubResponse.ok) {
      throw new Error(`GitHub API error: ${githubResponse.statusText}`);
    }

    return res.status(200).json({
      success: true,
      index: index.toFixed(2),
      timestamp: now.toISOString()
    });

  } catch (error) {
    console.error('Collection error:', error);
    return res.status(500).json({
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
```

#### 3. Update vercel.json

```json
{
  "crons": [
    {
      "path": "/api/collect-cron",
      "schedule": "*/10 * * * *"
    }
  ]
}
```

#### 4. Configure Environment Variables

In Vercel dashboard:
- `GITHUB_TOKEN`: Your GitHub personal access token
- `CRON_SECRET`: Random secret string (optional, for security)

#### 5. Deploy

```bash
vercel deploy --prod
```

### Pros:
✅ 100% reliable (Vercel's infrastructure)  
✅ Integrated with GitHub deployment  
✅ Easy monitoring via Vercel dashboard  
✅ Free tier sufficient for this use case

### Cons:
❌ Requires Vercel account  
❌ Cron requires Vercel Pro ($20/month) OR Hobby plan with limitations  
❌ Cold starts possible (but minimal impact)

---

## Option 3: Self-Hosted Solution (Raspberry Pi / Home Server)

Run a simple cron job on a home server or Raspberry Pi.

### Implementation Steps:

#### 1. Setup Node.js on Server

```bash
# Install Node.js 18+ on your server
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

#### 2. Clone Repository

```bash
git clone https://github.com/samirballhausen-ship-it/pizzint-tracker.git
cd pizzint-tracker
```

#### 3. Create Auto-Update Script

Create `scripts/collect-and-push.sh`:

```bash
#!/bin/bash
# Auto-collect script with git push

cd "$(dirname "$0")/.."

# Pull latest changes
git pull origin master

# Run collection
node scripts/collect-manual.js

# Push if changes exist
if git diff --quiet; then
  echo "No changes to commit"
else
  git add data/readings.json
  git commit -m "Auto-collect: $(date -u +%Y-%m-%d\ %H:%M) UTC"
  git push origin master
fi
```

Make executable:
```bash
chmod +x scripts/collect-and-push.sh
```

#### 4. Setup Git Authentication

```bash
# Configure git with SSH key or token
git config --global credential.helper store
# Or use SSH keys
```

#### 5. Add to Crontab

```bash
crontab -e

# Add this line:
*/10 * * * * /path/to/pizzint-tracker/scripts/collect-and-push.sh >> /var/log/pizzint-collector.log 2>&1
```

### Pros:
✅ 100% control  
✅ No external dependencies  
✅ Free (uses your hardware)  
✅ Very reliable if server is stable

### Cons:
❌ Requires always-on hardware  
❌ Depends on home internet connection  
❌ Need to manage server maintenance  
❌ Power outages affect data collection

---

## Option 4: Cloud VM with Cron (AWS/GCP/Azure Free Tier)

Use free tier cloud VM to run cron job.

### Quick Setup (AWS EC2 Free Tier):

1. Launch t2.micro instance (free tier)
2. Install Node.js
3. Clone repository
4. Setup cron (same as Option 3)
5. Configure auto-start on boot

### Pros:
✅ Reliable cloud infrastructure  
✅ Free tier available  
✅ No local hardware needed

### Cons:
❌ Need cloud account  
❌ Free tier expires after 12 months  
❌ Requires basic DevOps knowledge

---

## Comparison Table

| Solution | Reliability | Cost | Setup Time | Maintenance |
|----------|-------------|------|------------|-------------|
| External Cron + GitHub Actions | ⭐⭐⭐⭐⭐ | Free | 15 min | Very Low |
| Vercel Cron | ⭐⭐⭐⭐⭐ | $0-20/mo | 20 min | Very Low |
| Self-Hosted | ⭐⭐⭐⭐ | Free | 30 min | Medium |
| Cloud VM | ⭐⭐⭐⭐⭐ | Free-$5/mo | 45 min | Medium |
| GitHub Actions Scheduled | ⭐⭐ | Free | 0 min | Low |

---

## Recommended Implementation

**For this project, use Option 1** (External Cron + Repository Dispatch):

1. It's completely free
2. Takes 15 minutes to setup
3. Very reliable (external cron services have 99.9% uptime)
4. No ongoing maintenance
5. Easy to monitor and debug

### Quick Start Guide:

```bash
# 1. Update workflow to use repository_dispatch (shown above)
# 2. Create GitHub token with repo + workflow scopes
# 3. Sign up at cron-job.org
# 4. Create cron job with:
#    - URL: https://api.github.com/repos/samirballhausen-ship-it/pizzint-tracker/dispatches
#    - Method: POST
#    - Body: {"event_type": "collect-data"}
#    - Header: Authorization: Bearer YOUR_TOKEN
# 5. Test by checking Actions tab in GitHub
```

---

## Testing Your Fix

After implementing any solution:

1. Wait 10 minutes
2. Check GitHub Actions tab for new workflow run
3. Verify `data/readings.json` has new timestamp
4. Refresh the app - should show current data
5. Monitor for 1 hour to ensure consistency

---

## Monitoring & Alerting

Set up monitoring to catch failures:

1. **UptimeRobot**: Monitor the app URL, alert if data timestamp is >30min old
2. **GitHub Actions email notifications**: Enable in repository settings
3. **Cron service notifications**: Enable in cron-job.org settings

---

## Rollback Plan

If new solution fails:

1. Re-enable GitHub Actions scheduled workflow
2. Manually trigger when needed
3. Wait for scheduled runs to resume

---

## Notes

- All solutions avoid the GitHub Actions scheduled workflow limitation
- External triggers are more reliable than GitHub's native cron
- Consider redundancy: run multiple cron services for critical applications
- Keep the manual trigger option for emergencies

---

## Support

If issues arise:
1. Check cron service logs
2. Check GitHub Actions workflow logs
3. Test manual workflow trigger
4. Verify GitHub token permissions
5. Check API rate limits

---

**Implementation Priority**: Option 1 → Option 2 → Option 3 → Option 4
