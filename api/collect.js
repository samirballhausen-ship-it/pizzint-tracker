// =====================================================
// PIZZINT DATA COLLECTOR
// =====================================================
// This runs as a Vercel Cron Job or standalone
// Collects data every 10 minutes from pizzint.watch API

import { createClient } from '@supabase/supabase-js';

const PIZZINT_API = 'https://www.pizzint.watch/api/dashboard-data';

// Initialize Supabase (use service role key for write access)
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get DC time info
function getDCTimeInfo(date = new Date()) {
    const dcTime = date.toLocaleString('en-US', { timeZone: 'America/New_York' });
    const dcDate = new Date(dcTime);

    const hour = dcDate.getHours();
    const weekday = dcDate.getDay(); // 0 = Sunday

    return {
        hour,
        weekday,
        isOvertime: hour >= 18 || hour < 6,
        isWeekend: weekday === 0 || weekday === 6
    };
}

// Calculate aggregated index from location data
function calculateIndex(data) {
    const popularities = data.map(loc => loc.current_popularity || 0);
    return popularities.reduce((a, b) => a + b, 0) / popularities.length;
}

// Detect if this is a spike
async function detectSpike(currentIndex, dcInfo) {
    // Get last reading
    const { data: lastReadings } = await supabase
        .from('pizza_readings')
        .select('index_value')
        .order('timestamp', { ascending: false })
        .limit(1);

    if (!lastReadings || lastReadings.length === 0) return null;

    const prevIndex = lastReadings[0].index_value;
    const change = currentIndex - prevIndex;

    // Spike detection: >20 point jump OR value >70 from <55
    if (change > 20 || (currentIndex > 70 && prevIndex < 55)) {
        return {
            timestamp: new Date().toISOString(),
            index_from: prevIndex,
            index_to: currentIndex,
            change_amount: change,
            is_overtime: dcInfo.isOvertime,
            is_weekend: dcInfo.isWeekend
        };
    }

    return null;
}

// Main collection function
async function collectData() {
    console.log(`[${new Date().toISOString()}] Starting data collection...`);

    try {
        // Fetch from pizzint.watch API
        const response = await fetch(PIZZINT_API);
        const json = await response.json();

        if (!json.success || !json.data) {
            throw new Error('Invalid API response');
        }

        const data = json.data;
        const index = calculateIndex(data);
        const dcInfo = getDCTimeInfo();

        console.log(`[${new Date().toISOString()}] Index: ${index.toFixed(2)}, Hour: ${dcInfo.hour}, Weekend: ${dcInfo.isWeekend}`);

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
            // Likely duplicate timestamp - skip
            if (insertError.code === '23505') {
                console.log(`[${new Date().toISOString()}] Skipped - duplicate timestamp`);
                return { status: 'skipped', reason: 'duplicate' };
            }
            throw insertError;
        }

        // Check for spike
        const spike = await detectSpike(index, dcInfo);
        if (spike) {
            console.log(`[${new Date().toISOString()}] SPIKE DETECTED: ${spike.index_from} -> ${spike.index_to}`);

            await supabase
                .from('pizza_spikes')
                .insert(spike);
        }

        console.log(`[${new Date().toISOString()}] Data collection complete`);

        return {
            status: 'success',
            index: index,
            timestamp: new Date().toISOString(),
            spike: spike ? true : false
        };

    } catch (error) {
        console.error(`[${new Date().toISOString()}] Error:`, error.message);
        return {
            status: 'error',
            error: error.message
        };
    }
}

// Vercel Serverless Function Handler
export default async function handler(req, res) {
    // Verify cron secret (optional security)
    const authHeader = req.headers.authorization;
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await collectData();
    res.status(result.status === 'error' ? 500 : 200).json(result);
}

// For standalone execution
if (process.argv[1]?.includes('collect')) {
    collectData().then(console.log).catch(console.error);
}
