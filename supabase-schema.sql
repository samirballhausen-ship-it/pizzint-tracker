-- =====================================================
-- PIZZINT TRACKER - SUPABASE SCHEMA
-- =====================================================
-- Run this in Supabase SQL Editor to create the tables

-- Main data table for pizza index readings
CREATE TABLE pizza_readings (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    index_value DECIMAL(5,2) NOT NULL,
    dc_hour INTEGER NOT NULL,
    dc_weekday INTEGER NOT NULL,
    is_overtime BOOLEAN DEFAULT FALSE,
    is_weekend BOOLEAN DEFAULT FALSE,
    raw_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster queries
CREATE INDEX idx_readings_timestamp ON pizza_readings(timestamp DESC);
CREATE INDEX idx_readings_dc_hour ON pizza_readings(dc_hour);
CREATE INDEX idx_readings_dc_weekday ON pizza_readings(dc_weekday);

-- Unique constraint to prevent duplicate timestamps (within same minute)
CREATE UNIQUE INDEX idx_readings_unique_minute
ON pizza_readings(DATE_TRUNC('minute', timestamp));

-- Table for detected spikes
CREATE TABLE pizza_spikes (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL,
    index_from DECIMAL(5,2),
    index_to DECIMAL(5,2),
    change_amount DECIMAL(5,2),
    is_overtime BOOLEAN DEFAULT FALSE,
    is_weekend BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_spikes_timestamp ON pizza_spikes(timestamp DESC);

-- Aggregated hourly patterns (updated by trigger)
CREATE TABLE hourly_patterns (
    hour INTEGER PRIMARY KEY,
    avg_index DECIMAL(5,2),
    min_index DECIMAL(5,2),
    max_index DECIMAL(5,2),
    std_dev DECIMAL(5,2),
    sample_count INTEGER,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default hourly patterns
INSERT INTO hourly_patterns (hour, avg_index, min_index, max_index, std_dev, sample_count)
SELECT generate_series(0, 23), 30, 0, 100, 15, 0;

-- Aggregated weekday patterns
CREATE TABLE weekday_patterns (
    weekday INTEGER PRIMARY KEY, -- 0=Sunday, 6=Saturday
    avg_index DECIMAL(5,2),
    min_index DECIMAL(5,2),
    max_index DECIMAL(5,2),
    std_dev DECIMAL(5,2),
    sample_count INTEGER,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default weekday patterns
INSERT INTO weekday_patterns (weekday, avg_index, min_index, max_index, std_dev, sample_count)
SELECT generate_series(0, 6), 30, 0, 100, 15, 0;

-- Function to update patterns after new reading
CREATE OR REPLACE FUNCTION update_patterns()
RETURNS TRIGGER AS $$
BEGIN
    -- Update hourly pattern
    UPDATE hourly_patterns SET
        avg_index = (SELECT AVG(index_value) FROM pizza_readings WHERE dc_hour = NEW.dc_hour),
        min_index = (SELECT MIN(index_value) FROM pizza_readings WHERE dc_hour = NEW.dc_hour),
        max_index = (SELECT MAX(index_value) FROM pizza_readings WHERE dc_hour = NEW.dc_hour),
        std_dev = (SELECT STDDEV(index_value) FROM pizza_readings WHERE dc_hour = NEW.dc_hour),
        sample_count = (SELECT COUNT(*) FROM pizza_readings WHERE dc_hour = NEW.dc_hour),
        updated_at = NOW()
    WHERE hour = NEW.dc_hour;

    -- Update weekday pattern
    UPDATE weekday_patterns SET
        avg_index = (SELECT AVG(index_value) FROM pizza_readings WHERE dc_weekday = NEW.dc_weekday),
        min_index = (SELECT MIN(index_value) FROM pizza_readings WHERE dc_weekday = NEW.dc_weekday),
        max_index = (SELECT MAX(index_value) FROM pizza_readings WHERE dc_weekday = NEW.dc_weekday),
        std_dev = (SELECT STDDEV(index_value) FROM pizza_readings WHERE dc_weekday = NEW.dc_weekday),
        sample_count = (SELECT COUNT(*) FROM pizza_readings WHERE dc_weekday = NEW.dc_weekday),
        updated_at = NOW()
    WHERE weekday = NEW.dc_weekday;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update patterns
CREATE TRIGGER trigger_update_patterns
AFTER INSERT ON pizza_readings
FOR EACH ROW
EXECUTE FUNCTION update_patterns();

-- View for easy querying of recent data with forecast
CREATE VIEW readings_with_forecast AS
SELECT
    r.*,
    h.avg_index as hourly_forecast,
    h.std_dev as hourly_stddev,
    w.avg_index as weekday_forecast,
    (h.avg_index * 0.6 + w.avg_index * 0.3 +
        (SELECT AVG(index_value) FROM pizza_readings) * 0.1) as combined_forecast
FROM pizza_readings r
LEFT JOIN hourly_patterns h ON r.dc_hour = h.hour
LEFT JOIN weekday_patterns w ON r.dc_weekday = w.weekday
ORDER BY r.timestamp DESC;

-- Row Level Security (enable for production)
ALTER TABLE pizza_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pizza_spikes ENABLE ROW LEVEL SECURITY;
ALTER TABLE hourly_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekday_patterns ENABLE ROW LEVEL SECURITY;

-- Public read access policy
CREATE POLICY "Public read access" ON pizza_readings FOR SELECT USING (true);
CREATE POLICY "Public read access" ON pizza_spikes FOR SELECT USING (true);
CREATE POLICY "Public read access" ON hourly_patterns FOR SELECT USING (true);
CREATE POLICY "Public read access" ON weekday_patterns FOR SELECT USING (true);

-- Service role write access (for the collector)
CREATE POLICY "Service write access" ON pizza_readings
FOR INSERT WITH CHECK (true);
CREATE POLICY "Service write access" ON pizza_spikes
FOR INSERT WITH CHECK (true);

-- =====================================================
-- USEFUL QUERIES
-- =====================================================

-- Get readings for last 24 hours
-- SELECT * FROM pizza_readings
-- WHERE timestamp > NOW() - INTERVAL '24 hours'
-- ORDER BY timestamp DESC;

-- Get hourly averages
-- SELECT * FROM hourly_patterns ORDER BY hour;

-- Get spikes in last 7 days
-- SELECT * FROM pizza_spikes
-- WHERE timestamp > NOW() - INTERVAL '7 days'
-- ORDER BY timestamp DESC;

-- Get readings with forecast comparison
-- SELECT * FROM readings_with_forecast LIMIT 100;
