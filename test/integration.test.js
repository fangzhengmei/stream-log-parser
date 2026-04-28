const fs = require('fs');
const path = require('path');
const os = require('os');
const StreamLogParser = require('../src/index');

describe('StreamLogParser Integration Tests', () => {
  let parser;
  let tempDir;
  let testLogPath;
  let errorLogPath;

  beforeEach(() => {
    parser = new StreamLogParser();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stream-log-parser-test-'));
    testLogPath = path.join(tempDir, 'test.log');
    errorLogPath = path.join(tempDir, 'errors.log');
  });

  afterEach(async () => {
    parser = null;
    
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      } catch (e) {
        // 忽略清理错误
      }
    }
    
    tempDir = null;
    testLogPath = null;
    errorLogPath = null;
  });

  describe('parseLogFile()', () => {
    test('should parse complete log file and aggregate by time window', async () => {
      const testLogContent = [
        '2024-01-15 10:30:15.123 INFO [Application] User login userId=1001',
        '2024-01-15 10:30:30.456 ERROR [Payment] Transaction failed userId=1002 amount=50.00',
        '2024-01-15 10:30:45.789 INFO [Application] User logout userId=1001',
        '2024-01-15 10:31:00.123 WARN [Auth] Token expiring userId=1003',
        '2024-01-15 10:31:15.456 INFO [Application] User login userId=1004'
      ].join('\n');

      fs.writeFileSync(testLogPath, testLogContent, 'utf8');

      const result = await parser.parseLogFile(testLogPath, {
        aggregatorOptions: {
          windowSizeMs: 60 * 1000,
          aggregationKeys: ['level']
        }
      });

      expect(result.stats.totalLines).toBe(5);
      expect(result.stats.parsedLines).toBe(5);
      expect(result.stats.errorLines).toBe(0);
      expect(result.stats.windowCount).toBe(2);
      expect(result.windows.length).toBe(2);

      const firstWindow = result.windows[0];
      expect(firstWindow.count).toBe(3);
      expect(firstWindow.aggregations.level.find(a => a.value === 'INFO').count).toBe(2);
      expect(firstWindow.aggregations.level.find(a => a.value === 'ERROR').count).toBe(1);

      const secondWindow = result.windows[1];
      expect(secondWindow.count).toBe(2);
      expect(secondWindow.aggregations.level.find(a => a.value === 'INFO').count).toBe(1);
      expect(secondWindow.aggregations.level.find(a => a.value === 'WARN').count).toBe(1);
    });

    test('should handle log file with invalid lines and log errors', async () => {
      const testLogContent = [
        '2024-01-15 10:30:15.123 INFO [Application] Valid line 1',
        'This is not a valid log line format',
        '2024-01-15 10:30:30.456 ERROR [Payment] Valid line 2',
        'Another invalid line without timestamp or level',
        '2024-01-15 10:30:45.789 WARN [Auth] Valid line 3'
      ].join('\n');

      fs.writeFileSync(testLogPath, testLogContent, 'utf8');

      const result = await parser.parseLogFile(testLogPath, {
        errorHandlerOptions: {
          errorLogPath: errorLogPath,
          verbose: false
        },
        aggregatorOptions: {
          windowSizeMs: 60 * 1000,
          aggregationKeys: ['level']
        }
      });

      expect(result.stats.totalLines).toBe(5);
      expect(result.stats.parsedLines).toBe(3);
      expect(result.stats.errorLines).toBe(2);
      expect(result.windows.length).toBe(1);
      expect(result.errorLines.length).toBe(2);

      expect(fs.existsSync(errorLogPath)).toBe(true);
      
      const errorLogContent = fs.readFileSync(errorLogPath, 'utf8');
      const errorLines = errorLogContent.trim().split('\n').filter(line => line);
      expect(errorLines.length).toBe(2);

      errorLines.forEach(line => {
        const errorEntry = JSON.parse(line);
        expect(errorEntry.type).toBe('invalid_line');
        expect(errorEntry.rawLine).toBeDefined();
      });
    });

    test('should extract additional fields from log entries', async () => {
      const testLogContent = [
        '2024-01-15 10:30:15.123 INFO [Payment] Transaction processed userId=123 amount=99.99 status=success currency="USD"',
        '2024-01-15 10:30:30.456 INFO [Payment] Transaction processed userId=456 amount=150.50 status=pending currency="EUR"'
      ].join('\n');

      fs.writeFileSync(testLogPath, testLogContent, 'utf8');

      const result = await parser.parseLogFile(testLogPath, {
        aggregatorOptions: {
          windowSizeMs: 60 * 1000,
          aggregationKeys: ['status', 'currency']
        }
      });

      expect(result.stats.totalLines).toBe(2);
      expect(result.stats.parsedLines).toBe(2);
      expect(result.windows.length).toBe(1);

      const window = result.windows[0];
      expect(window.aggregations).toBeDefined();
      expect(window.aggregations.status).toBeDefined();
      expect(window.aggregations.currency).toBeDefined();
    });

    test('should handle empty log file', async () => {
      fs.writeFileSync(testLogPath, '', 'utf8');

      const result = await parser.parseLogFile(testLogPath, {
        aggregatorOptions: {
          windowSizeMs: 60 * 1000
        }
      });

      expect(result.stats.totalLines).toBe(0);
      expect(result.stats.parsedLines).toBe(0);
      expect(result.stats.errorLines).toBe(0);
      expect(result.windows.length).toBe(0);
      expect(result.errorLines.length).toBe(0);
    });

    test('should handle log file with only whitespace', async () => {
      const testLogContent = '\n   \n\t\n\n';
      fs.writeFileSync(testLogPath, testLogContent, 'utf8');

      const result = await parser.parseLogFile(testLogPath, {
        aggregatorOptions: {
          windowSizeMs: 60 * 1000
        }
      });

      expect(result.stats.totalLines).toBe(0);
      expect(result.windows.length).toBe(0);
    });
  });

  describe('parseLogLine()', () => {
    test('should parse single log line', () => {
      const line = '2024-01-15 10:30:45.123 INFO [Application] User login successful userId=123';
      const result = parser.parseLogLine(line);

      expect(result.parsed).toBe(true);
      expect(result.timestamp).toBeDefined();
      expect(result.level).toBe('INFO');
      expect(result.source).toBe('Application');
      expect(result.message).toContain('User login successful');
      expect(result.fields.userId).toBe(123);
    });

    test('should handle invalid log line', () => {
      const line = 'This is not a valid log entry';
      const result = parser.parseLogLine(line);

      expect(result.parsed).toBe(false);
      expect(result.timestamp).toBeNull();
      expect(result.raw).toBe(line);
    });
  });

  describe('createTimeWindowAggregator()', () => {
    test('should create time window aggregator instance', () => {
      const aggregator = parser.createTimeWindowAggregator({
        windowSizeMs: 30 * 1000,
        aggregationKeys: ['level', 'source']
      });

      expect(aggregator).toBeDefined();
      expect(typeof aggregator.addLogEntry).toBe('function');
      expect(typeof aggregator.getAllWindows).toBe('function');
    });
  });

  describe('createErrorHandler()', () => {
    test('should create error handler instance', () => {
      const errorHandler = parser.createErrorHandler({
        errorLogPath: errorLogPath,
        skipErrors: true,
        verbose: false
      });

      expect(errorHandler).toBeDefined();
      expect(typeof errorHandler.handleError).toBe('function');
      expect(typeof errorHandler.handleParseError).toBe('function');
      expect(typeof errorHandler.handleInvalidLine).toBe('function');
      expect(typeof errorHandler.getStats).toBe('function');
    });
  });

  describe('edge cases', () => {
    test('should handle very large log files efficiently', async () => {
      const lineCount = 1000;
      const lines = [];
      
      for (let i = 0; i < lineCount; i++) {
        const minute = Math.floor(i / 100);
        const level = i % 5 === 0 ? 'ERROR' : i % 3 === 0 ? 'WARN' : 'INFO';
        lines.push(`2024-01-15 10:${minute.toString().padStart(2, '0')}:${(i % 60).toString().padStart(2, '0')}.123 ${level} [App] Log entry ${i} userId=${i}`);
      }

      fs.writeFileSync(testLogPath, lines.join('\n'), 'utf8');

      const result = await parser.parseLogFile(testLogPath, {
        aggregatorOptions: {
          windowSizeMs: 60 * 1000,
          aggregationKeys: ['level']
        }
      });

      expect(result.stats.totalLines).toBe(lineCount);
      expect(result.stats.parsedLines).toBe(lineCount);
      expect(result.windows.length).toBeGreaterThan(0);
      
      const totalCount = result.windows.reduce((sum, w) => sum + w.count, 0);
      expect(totalCount).toBe(lineCount);
    });

    test('should handle log entries spanning multiple time windows', async () => {
      const testLogContent = [
        '2024-01-15 10:00:30.123 INFO [App] Window 1 entry 1',
        '2024-01-15 10:01:30.123 INFO [App] Window 2 entry 1',
        '2024-01-15 10:01:45.123 ERROR [App] Window 2 entry 2',
        '2024-01-15 10:02:15.123 WARN [App] Window 3 entry 1',
        '2024-01-15 10:02:30.123 INFO [App] Window 3 entry 2',
        '2024-01-15 10:02:45.123 INFO [App] Window 3 entry 3'
      ].join('\n');

      fs.writeFileSync(testLogPath, testLogContent, 'utf8');

      const result = await parser.parseLogFile(testLogPath, {
        aggregatorOptions: {
          windowSizeMs: 60 * 1000,
          aggregationKeys: ['level']
        }
      });

      expect(result.windows.length).toBe(3);
      expect(result.windows[0].count).toBe(1);
      expect(result.windows[1].count).toBe(2);
      expect(result.windows[2].count).toBe(3);
    });
  });
});
