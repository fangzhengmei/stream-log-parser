const TimeWindowAggregator = require('../../src/utils/time-window-aggregator');

describe('TimeWindowAggregator', () => {
  let aggregator;
  const windowSizeMs = 60 * 1000; // 1 minute

  beforeEach(() => {
    aggregator = new TimeWindowAggregator({
      windowSizeMs,
      aggregationKeys: ['level']
    });
  });

  describe('getWindowStart()', () => {
    test('should calculate correct window start time', () => {
      const timestamp = Date.UTC(2024, 0, 15, 10, 30, 45, 123);
      const windowStart = aggregator.getWindowStart(timestamp);
      
      expect(windowStart % windowSizeMs).toBe(0);
      expect(windowStart).toBeLessThanOrEqual(timestamp);
      expect(windowStart + windowSizeMs).toBeGreaterThan(timestamp);
    });

    test('should align to minute boundaries', () => {
      const testCases = [
        { timestamp: Date.UTC(2024, 0, 15, 10, 30, 0, 0), expected: Date.UTC(2024, 0, 15, 10, 30, 0, 0) },
        { timestamp: Date.UTC(2024, 0, 15, 10, 30, 30, 500), expected: Date.UTC(2024, 0, 15, 10, 30, 0, 0) },
        { timestamp: Date.UTC(2024, 0, 15, 10, 30, 59, 999), expected: Date.UTC(2024, 0, 15, 10, 30, 0, 0) }
      ];

      testCases.forEach(({ timestamp, expected }) => {
        expect(aggregator.getWindowStart(timestamp)).toBe(expected);
      });
    });
  });

  describe('addLogEntry()', () => {
    test('should add log entry to correct window', () => {
      const timestamp = Date.UTC(2024, 0, 15, 10, 30, 45, 123);
      const logEntry = {
        timestamp,
        level: 'INFO',
        message: 'Test message'
      };

      const window = aggregator.addLogEntry(logEntry);
      
      expect(window).toBeDefined();
      expect(window.windowStart).toBe(aggregator.getWindowStart(timestamp));
      expect(window.count).toBe(1);
      expect(window.entries.length).toBe(1);
      expect(window.entries[0]).toBe(logEntry);
    });

    test('should aggregate by specified keys', () => {
      const timestamp1 = Date.UTC(2024, 0, 15, 10, 30, 15, 0);
      const timestamp2 = Date.UTC(2024, 0, 15, 10, 30, 30, 0);

      const entries = [
        { timestamp: timestamp1, level: 'INFO', message: 'Info 1' },
        { timestamp: timestamp2, level: 'INFO', message: 'Info 2' },
        { timestamp: timestamp2, level: 'ERROR', message: 'Error 1' }
      ];

      entries.forEach(entry => aggregator.addLogEntry(entry));

      const windows = aggregator.getAllWindows();
      expect(windows.length).toBe(1);

      const window = windows[0];
      expect(window.count).toBe(3);
      expect(window.aggregations.level.size).toBe(2);
      expect(window.aggregations.level.get('INFO').count).toBe(2);
      expect(window.aggregations.level.get('ERROR').count).toBe(1);
    });

    test('should return null for entries without timestamp', () => {
      const logEntry = {
        timestamp: null,
        level: 'INFO',
        message: 'No timestamp'
      };

      const result = aggregator.addLogEntry(logEntry);
      expect(result).toBeNull();
    });

    test('should create separate windows for different time periods', () => {
      const timestamp1 = Date.UTC(2024, 0, 15, 10, 30, 0, 0);
      const timestamp2 = Date.UTC(2024, 0, 15, 10, 31, 0, 0);

      aggregator.addLogEntry({ timestamp: timestamp1, level: 'INFO' });
      aggregator.addLogEntry({ timestamp: timestamp2, level: 'ERROR' });

      const windows = aggregator.getAllWindows();
      expect(windows.length).toBe(2);
    });
  });

  describe('getExpiredWindows()', () => {
    test('should identify expired windows', () => {
      const timestamp1 = Date.UTC(2024, 0, 15, 10, 30, 0, 0);
      const timestamp2 = Date.UTC(2024, 0, 15, 10, 31, 0, 0);
      const currentTimestamp = Date.UTC(2024, 0, 15, 10, 32, 0, 0);

      aggregator.addLogEntry({ timestamp: timestamp1, level: 'INFO' });
      aggregator.addLogEntry({ timestamp: timestamp2, level: 'ERROR' });

      const expired = aggregator.getExpiredWindows(currentTimestamp);
      expect(expired.length).toBe(2);
    });

    test('should not include current window as expired', () => {
      const timestamp1 = Date.UTC(2024, 0, 15, 10, 30, 0, 0);
      const timestamp2 = Date.UTC(2024, 0, 15, 10, 31, 0, 0);
      const currentTimestamp = Date.UTC(2024, 0, 15, 10, 31, 30, 0);

      aggregator.addLogEntry({ timestamp: timestamp1, level: 'INFO' });
      aggregator.addLogEntry({ timestamp: timestamp2, level: 'ERROR' });

      const expired = aggregator.getExpiredWindows(currentTimestamp);
      expect(expired.length).toBe(1);
      expect(expired[0].windowStart).toBe(timestamp1);
    });
  });

  describe('removeExpiredWindows()', () => {
    test('should remove and return expired windows', () => {
      const timestamp1 = Date.UTC(2024, 0, 15, 10, 30, 0, 0);
      const timestamp2 = Date.UTC(2024, 0, 15, 10, 31, 0, 0);
      const currentTimestamp = Date.UTC(2024, 0, 15, 10, 32, 0, 0);

      aggregator.addLogEntry({ timestamp: timestamp1, level: 'INFO' });
      aggregator.addLogEntry({ timestamp: timestamp2, level: 'ERROR' });

      expect(aggregator.getAllWindows().length).toBe(2);

      const removed = aggregator.removeExpiredWindows(currentTimestamp);
      expect(removed.length).toBe(2);
      expect(aggregator.getAllWindows().length).toBe(0);
    });
  });

  describe('flushAllWindows()', () => {
    test('should remove and return all windows', () => {
      const timestamp1 = Date.UTC(2024, 0, 15, 10, 30, 0, 0);
      const timestamp2 = Date.UTC(2024, 0, 15, 10, 31, 0, 0);

      aggregator.addLogEntry({ timestamp: timestamp1, level: 'INFO' });
      aggregator.addLogEntry({ timestamp: timestamp2, level: 'ERROR' });

      expect(aggregator.getAllWindows().length).toBe(2);

      const flushed = aggregator.flushAllWindows();
      expect(flushed.length).toBe(2);
      expect(aggregator.getAllWindows().length).toBe(0);
    });
  });

  describe('formatWindowForOutput()', () => {
    test('should format window data for output', () => {
      const timestamp = Date.UTC(2024, 0, 15, 10, 30, 0, 0);
      aggregator.addLogEntry({ timestamp, level: 'INFO' });
      aggregator.addLogEntry({ timestamp, level: 'INFO' });
      aggregator.addLogEntry({ timestamp, level: 'ERROR' });

      const windows = aggregator.getAllWindows();
      const formatted = aggregator.formatWindowForOutput(windows[0]);

      expect(formatted.windowStart).toBeDefined();
      expect(formatted.windowEnd).toBeDefined();
      expect(formatted.windowStartMs).toBe(timestamp);
      expect(formatted.count).toBe(3);
      expect(formatted.aggregations).toBeDefined();
      expect(formatted.aggregations.level).toBeDefined();
      expect(formatted.aggregations.level.length).toBe(2);
    });

    test('should convert Maps to arrays for JSON serialization', () => {
      const timestamp = Date.UTC(2024, 0, 15, 10, 30, 0, 0);
      aggregator.addLogEntry({ timestamp, level: 'INFO' });

      const windows = aggregator.getAllWindows();
      const formatted = aggregator.formatWindowForOutput(windows[0]);

      expect(() => JSON.stringify(formatted)).not.toThrow();
    });
  });

  describe('custom aggregation keys', () => {
    test('should aggregate by multiple keys', () => {
      const customAggregator = new TimeWindowAggregator({
        windowSizeMs,
        aggregationKeys: ['level', 'source']
      });

      const timestamp = Date.UTC(2024, 0, 15, 10, 30, 0, 0);
      customAggregator.addLogEntry({ timestamp, level: 'INFO', source: 'App1' });
      customAggregator.addLogEntry({ timestamp, level: 'INFO', source: 'App2' });
      customAggregator.addLogEntry({ timestamp, level: 'ERROR', source: 'App1' });

      const windows = customAggregator.getAllWindows();
      const window = windows[0];

      expect(window.aggregations.level.size).toBe(2);
      expect(window.aggregations.source.size).toBe(2);
    });
  });
});
