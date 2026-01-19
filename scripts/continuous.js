#!/usr/bin/env node
// =====================================================
// CONTINUOUS COLLECTOR - Runs forever, collects every 10 min
// =====================================================
// Usage: node scripts/continuous.js
// Keep running in background: pm2 start scripts/continuous.js --name pizzint
// Or on Windows: start /B node scripts/continuous.js > collector.log 2>&1

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env') });

const PIZZINT_API = 'https://www.pizzint.watch/api/dashboard-data';
const INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
}

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

function log(msg) {
    console.log(`[${new Date().toISOString()}] ${msg}`);
}

function getDCTimeInfo(date = new Date()) {
    const dcTime = date.toLocaleString('en-US', { timeZone: 'America/New_York' });
    const dcDate = new Date(dcTime);
    const hour = dcDate.getHours();
    const weekday = dcDate.getDay();
    return { hour, weekday, isOvertime: hour >= 18 || hour < 6, isWeekend: weekday === 0 || weekday === 6 };
}

function calculateIndex(data) {
    const pops = data.map(loc => loc.current_popularity || 0);
    return pops.reduce((a, b) => a + b, 0) / pops.length;
}

async function collect() {
    try {
        const response = await fetch(PIZZINT_API);
        const json = await response.json();

        if (!json.success || !json.data) {
            throw new Error('Invalid API response');
        }

        const index = calculateIndex(json.data);
        const dcInfo = getDCTimeInfo();

        const { error } = await supabase
            .from('pizza_readings')
            .insert({
                timestamp: new Date().toISOString(),
                index_value: index,
                dc_hour: dcInfo.hour,
                dc_weekday: dcInfo.weekday,
                is_overtime: dcInfo.isOvertime,
                is_weekend: dcInfo.isWeekend,
                raw_data: json.data
            });

        if (error) {
            if (error.code === '23505') {
                log(`⏭️  Skipped duplicate`);
                return;
            }
            throw error;
        }

        // Check for spike
        const { data: last } = await supabase
            .from('pizza_readings')
            .select('index_value')
            .order('timestamp', { ascending: false })
            .limit(2);

        if (last && last.length >= 2) {
            const prev = last[1].index_value;
            const change = index - prev;
            if (change > 20 || (index > 70 && prev < 55)) {
                log(`🚨 SPIKE: ${prev.toFixed(0)} → ${index.toFixed(0)}`);
                await supabase.from('pizza_spikes').insert({
                    timestamp: new Date().toISOString(),
                    index_from: prev,
                    index_to: index,
                    change_amount: change,
                    is_overtime: dcInfo.isOvertime,
                    is_weekend: dcInfo.isWeekend
                });
            }
        }

        log(`✅ Index: ${index.toFixed(1)} | Hour: ${dcInfo.hour} | OT: ${dcInfo.isOvertime}`);

    } catch (error) {
        log(`❌ Error: ${error.message}`);
    }
}

// Startup
log('🍕 PIZZINT Continuous Collector started');
log(`📊 Collecting every ${INTERVAL_MS / 60000} minutes`);
log(`🔗 Supabase: ${process.env.SUPABASE_URL}`);

// Initial collection
collect();

// Schedule
setInterval(collect, INTERVAL_MS);

// Keep alive
process.on('SIGINT', () => {
    log('👋 Shutting down...');
    process.exit(0);
});
