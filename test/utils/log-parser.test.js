const LogParser = require('../../src/utils/log-parser');

describe('LogParser', () => {
  let parser;

  beforeEach(() => {
    parser = new LogParser();
  });

  describe('parse()', () => {
    test('should parse standard log line with timestamp, level, and message', () => {
      const line = '2024-01-15 10:30:45.123 INFO [Application] User login successful userId=123';
      const result = parser.parse(line);

      expect(result.parsed).toBe(true);
      expect(result.timestamp).toBeDefined();
      expect(result.level).toBe('INFO');
      expect(result.source).toBe('Application');
      expect(result.message).toContain('User login successful');
      expect(result.fields.userId).toBe(123);
    });

    test('should parse log line with different log levels', () => {
      const testCases = [
        { line: '2024-01-15 10:30:45.123 DEBUG [App] Debug message', expectedLevel: 'DEBUG' },
        { line: '2024-01-15 10:30:45.123 INFO [App] Info message', expectedLevel: 'INFO' },
        { line: '2024-01-15 10:30:45.123 WARN [App] Warn message', expectedLevel: 'WARN' },
        { line: '2024-01-15 10:30:45.123 ERROR [App] Error message', expectedLevel: 'ERROR' },
        { line: '2024-01-15 10:30:45.123 TRACE [App] Trace message', expectedLevel: 'TRACE' }
      ];

      testCases.forEach(({ line, expectedLevel }) => {
        const result = parser.parse(line);
        expect(result.level).toBe(expectedLevel);
      });
    });

    test('should extract additional fields from log line', () => {
      const line = '2024-01-15 10:30:45.123 INFO [Payment] Transaction processed userId=456 amount=99.99 status=success currency="USD"';
      const result = parser.parse(line);

      expect(result.fields.userId).toBe(456);
      expect(result.fields.amount).toBe(99.99);
      expect(result.fields.status).toBe('success');
      expect(result.fields.currency).toBe('USD');
    });

    test('should handle log lines without timestamp', () => {
      const line = 'INFO [Application] Simple log message without timestamp';
      const result = parser.parse(line);

      expect(result.parsed).toBe(true);
      expect(result.timestamp).toBeNull();
      expect(result.level).toBe('INFO');
    });

    test('should handle invalid log lines', () => {
      const line = 'This is not a valid log line format';
      const result = parser.parse(line);

      expect(result.parsed).toBe(false);
      expect(result.timestamp).toBeNull();
      expect(result.level).toBeNull();
    });

    test('should preserve raw line in result', () => {
      const line = '2024-01-15 10:30:45.123 INFO [App] Test message';
      const result = parser.parse(line);

      expect(result.raw).toBe(line);
    });
  });

  describe('parseTimestamp()', () => {
    test('should parse valid timestamp string', () => {
      const timestampStr = '2024-01-15 10:30:45.123';
      const timestamp = parser.parseTimestamp(timestampStr);

      expect(typeof timestamp).toBe('number');
      expect(timestamp).toBeGreaterThan(0);
    });

    test('should handle invalid timestamp strings', () => {
      const invalidTimestamps = [
        'not a timestamp',
        '2024/01/15 10:30:45',
        ''
      ];

      invalidTimestamps.forEach(ts => {
        const result = parser.parseTimestamp(ts);
        expect(Number.isNaN(result) || result === null || result === undefined).toBe(true);
      });
    });
  });

  describe('isValid()', () => {
    test('should return true for valid parsed log entries', () => {
      const validEntry = {
        parsed: true,
        timestamp: Date.now()
      };

      expect(parser.isValid(validEntry)).toBe(true);
    });

    test('should return false for invalid parsed log entries', () => {
      const invalidEntries = [
        { parsed: false, timestamp: Date.now() },
        { parsed: true, timestamp: null },
        { parsed: false, timestamp: null },
        null,
        undefined
      ];

      invalidEntries.forEach(entry => {
        expect(parser.isValid(entry)).toBe(false);
      });
    });
  });

  describe('custom patterns', () => {
    test('should use custom patterns when provided', () => {
      const customParser = new LogParser({
        patterns: {
          timestamp: /(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2})/,
          level: /\b(INFO|WARN|ERROR)\b/,
          message: /:\s+(.*)$/,
          source: /\[([^\]]+)\]/
        }
      });

      const line = '15/01/2024 10:30:45 [CustomApp] INFO: Custom log format';
      const result = customParser.parse(line);

      expect(result.level).toBe('INFO');
      expect(result.source).toBe('CustomApp');
    });
  });
});
