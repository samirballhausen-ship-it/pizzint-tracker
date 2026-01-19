#!/usr/bin/env node
// =====================================================
// MANUAL COLLECTOR FOR GITHUB-BASED STORAGE
// =====================================================
// Usage: node scripts/collect-manual.js
// Requires: Node.js 18+ (for built-in fetch API)
// This script collects data and updates data/readings.json
// Run this manually when GitHub Actions scheduled runs are delayed

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '..', 'data', 'readings.json');
const PIZZINT_API = 'https://www.pizzint.watch/api/dashboard-data';

// Check Node version
const nodeVersion = parseInt(process.version.slice(1).split('.')[0]);
if (nodeVersion < 18) {
    console.error('❌ This script requires Node.js 18 or higher (for built-in fetch API)');
    console.error(`   Current version: ${process.version}`);
    console.error('   Please upgrade Node.js or use the GitHub Actions workflow instead');
    process.exit(1);
}

function getDCTimeInfo(date = new Date()) {
    const dcTime = date.toLocaleString('en-US', { timeZone: 'America/New_York' });
    const dcDate = new Date(dcTime);
    const hour = dcDate.getHours();
    const weekday = dcDate.getDay();
    return {
        hour,
        weekday,
        isOvertime: hour >= 18 || hour < 6,
        isWeekend: weekday === 0 || weekday === 6
    };
}

function calculateIndex(data) {
    if (!data || !Array.isArray(data)) {
        throw new Error('Invalid data array');
    }
    const pops = data.map(loc => loc.current_popularity || 0);
    return pops.reduce((a, b) => a + b, 0) / pops.length;
}

async function collect() {
    const now = new Date().toISOString();
    console.log(`\n[${now}] 🍕 Starting manual data collection...`);

    try {
        // Fetch API
        console.log(`[${now}] 📡 Fetching from ${PIZZINT_API}...`);
        const response = await fetch(PIZZINT_API);
        const json = await response.json();

        if (!json.success || !json.data) {
            throw new Error('Invalid API response');
        }

        const data = json.data;
        const index = calculateIndex(data);
        const dcInfo = getDCTimeInfo();

        console.log(`[${now}] 📊 Index: ${index.toFixed(2)} | DC Hour: ${dcInfo.hour} | Overtime: ${dcInfo.isOvertime} | Weekend: ${dcInfo.isWeekend}`);

        // Load existing data
        let db = { readings: [], spikes: [], lastUpdate: null };
        try {
            const fileContent = fs.readFileSync(DATA_FILE, 'utf8');
            db = JSON.parse(fileContent);
            console.log(`[${now}] 📂 Loaded existing data: ${db.readings.length} readings`);
        } catch (e) {
            console.log(`[${now}] 📝 Creating new data file`);
        }

        // Create new reading
        const newReading = {
            timestamp: now,
            index_value: parseFloat(index.toFixed(2)),
            dc_hour: dcInfo.hour,
            dc_weekday: dcInfo.weekday,
            is_overtime: dcInfo.isOvertime,
            is_weekend: dcInfo.isWeekend
        };

        // Check for duplicate (same minute)
        const lastTs = db.readings.length > 0 ? db.readings[db.readings.length - 1].timestamp : null;
        if (lastTs && lastTs.substring(0, 16) === newReading.timestamp.substring(0, 16)) {
            console.log(`[${now}] ⏭️  Skipped - duplicate timestamp (same minute)`);
            return { status: 'skipped', message: 'Duplicate timestamp' };
        }

        // Check for spike
        let spikeDetected = false;
        if (db.readings.length > 0) {
            const prev = db.readings[db.readings.length - 1].index_value;
            const change = newReading.index_value - prev;
            if (change > 20 || (newReading.index_value > 70 && prev < 55)) {
                console.log(`[${now}] 🚨 SPIKE DETECTED: ${prev.toFixed(0)} → ${newReading.index_value.toFixed(0)}`);
                spikeDetected = true;
                db.spikes.push({
                    timestamp: newReading.timestamp,
                    index_from: prev,
                    index_to: newReading.index_value,
                    change_amount: change,
                    is_overtime: newReading.is_overtime,
                    is_weekend: newReading.is_weekend
                });
                // Keep only last 100 spikes
                if (db.spikes.length > 100) {
                    db.spikes = db.spikes.slice(-100);
                }
            }
        }

        // Add new reading
        db.readings.push(newReading);
        db.lastUpdate = newReading.timestamp;

        // Keep only last 10000 readings (~70 days at 10min intervals)
        if (db.readings.length > 10000) {
            const removed = db.readings.length - 10000;
            db.readings = db.readings.slice(-10000);
            console.log(`[${now}] 🗑️  Trimmed ${removed} old readings`);
        }

        // Save to file
        fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
        console.log(`[${now}] ✅ Saved to ${DATA_FILE}`);
        console.log(`[${now}] 📈 Total readings: ${db.readings.length}`);

        if (spikeDetected) {
            console.log(`[${now}] 🔔 Note: Spike detected and recorded`);
        }

        console.log(`\n✨ Collection complete!`);
        console.log(`   Next step: Commit and push the updated data file`);
        console.log(`   Example: git add data/readings.json && git commit -m "Manual collect" && git push`);

        return { 
            status: 'success', 
            index: index.toFixed(2), 
            spike: spikeDetected,
            totalReadings: db.readings.length
        };

    } catch (error) {
        console.error(`[${now}] ❌ Error:`, error.message);
        console.error(error.stack);
        return { status: 'error', error: error.message };
    }
}

// Run
collect().then(result => {
    console.log(`\nResult: ${JSON.stringify(result, null, 2)}`);
    process.exit(result.status === 'error' ? 1 : 0);
});
