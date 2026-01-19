#!/usr/bin/env node
// =====================================================
// STANDALONE COLLECTOR - Run locally or as cron job
// =====================================================
// Usage: node scripts/collect.js
// Or with cron: */10 * * * * node /path/to/collect.js

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load .env from project root
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env') });

const PIZZINT_API = 'https://www.pizzint.watch/api/dashboard-data';

// Check env
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
}

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
    const pops = data.map(loc => loc.current_popularity || 0);
    return pops.reduce((a, b) => a + b, 0) / pops.length;
}

async function detectSpike(currentIndex, dcInfo) {
    const { data: last } = await supabase
        .from('pizza_readings')
        .select('index_value')
        .order('timestamp', { ascending: false })
        .limit(1);

    if (!last || last.length === 0) return null;

    const prev = last[0].index_value;
    const change = currentIndex - prev;

    if (change > 20 || (currentIndex > 70 && prev < 55)) {
        return {
            timestamp: new Date().toISOString(),
            index_from: prev,
            index_to: currentIndex,
            change_amount: change,
            is_overtime: dcInfo.isOvertime,
            is_weekend: dcInfo.isWeekend
        };
    }
    return null;
}

async function collect() {
    const now = new Date().toISOString();
    console.log(`\n[${now}] 🍕 Starting data collection...`);

    try {
        // Fetch API
        const response = await fetch(PIZZINT_API);
        const json = await response.json();

        if (!json.success || !json.data) {
            throw new Error('Invalid API response');
        }

        const data = json.data;
        const index = calculateIndex(data);
        const dcInfo = getDCTimeInfo();

        console.log(`[${now}] 📊 Index: ${index.toFixed(2)} | Hour: ${dcInfo.hour} | Weekend: ${dcInfo.isWeekend}`);

        // Insert reading
        const { error: insertError } = await supabase
            .from('pizza_readings')
            .insert({
                timestamp: new Date().toISOString(),
                index_value: index,
                dc_hour: dcInfo.hour,
                dc_weekday: dcInfo.weekday,
                is_overtime: dcInfo.isOvertime,
                is_weekend: dcInfo.isWeekend,
                raw_data: data
            });

        if (insertError) {
            if (insertError.code === '23505') {
                console.log(`[${now}] ⏭️  Skipped - duplicate timestamp`);
                return { status: 'skipped' };
            }
            throw insertError;
        }

        console.log(`[${now}] ✅ Saved to database`);

        // Check spike
        const spike = await detectSpike(index, dcInfo);
        if (spike) {
            console.log(`[${now}] 🚨 SPIKE DETECTED: ${spike.index_from.toFixed(0)} → ${spike.index_to.toFixed(0)}`);
            await supabase.from('pizza_spikes').insert(spike);
        }

        // Get total count
        const { count } = await supabase
            .from('pizza_readings')
            .select('*', { count: 'exact', head: true });

        console.log(`[${now}] 📈 Total records in DB: ${count}`);

        return { status: 'success', index, spike: !!spike };

    } catch (error) {
        console.error(`[${now}] ❌ Error:`, error.message);
        return { status: 'error', error: error.message };
    }
}

// Run
collect().then(result => {
    console.log(`\nResult: ${JSON.stringify(result)}`);
    process.exit(result.status === 'error' ? 1 : 0);
});
