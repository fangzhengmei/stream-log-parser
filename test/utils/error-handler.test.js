const fs = require('fs');
const path = require('path');
const os = require('os');
const ErrorHandler = require('../../src/utils/error-handler');

describe('ErrorHandler', () => {
  let handler;
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'error-handler-test-'));
    handler = new ErrorHandler({
      verbose: false,
      skipErrors: true
    });
  });

  afterEach(async () => {
    handler = null;
    
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      } catch (e) {
        // 忽略清理错误
      }
    }
    
    tempDir = null;
  });

  describe('constructor', () => {
    test('should initialize with default options', () => {
      const defaultHandler = new ErrorHandler();
      
      expect(defaultHandler.skipErrors).toBe(true);
      expect(defaultHandler.verbose).toBe(false);
      expect(defaultHandler.errorLogPath).toBeNull();
    });

    test('should initialize with custom options', () => {
      const customPath = path.join(tempDir, 'errors.log');
      const customHandler = new ErrorHandler({
        errorLogPath: customPath,
        skipErrors: false,
        verbose: true
      });
      
      expect(customHandler.errorLogPath).toBe(customPath);
      expect(customHandler.skipErrors).toBe(false);
      expect(customHandler.verbose).toBe(true);
    });

    test('should initialize counters to zero', () => {
      expect(handler.errorCount).toBe(0);
      expect(handler.parseErrorCount).toBe(0);
      expect(handler.invalidLineCount).toBe(0);
    });
  });

  describe('handleError()', () => {
    test('should increment error count', () => {
      const testError = new Error('Test error');
      handler.handleError(testError);
      
      expect(handler.errorCount).toBe(1);
    });

    test('should return error info object', () => {
      const testError = new Error('Test error message');
      const context = { operation: 'test', line: 42 };
      
      const result = handler.handleError(testError, context);
      
      expect(result.timestamp).toBeDefined();
      expect(result.type).toBe('error');
      expect(result.message).toBe('Test error message');
      expect(result.stack).toBeDefined();
      expect(result.context).toEqual(context);
    });

    test('should not throw when skipErrors is true', () => {
      handler = new ErrorHandler({ skipErrors: true });
      
      expect(() => {
        handler.handleError(new Error('Should not throw'));
      }).not.toThrow();
    });

    test('should throw when skipErrors is false', () => {
      handler = new ErrorHandler({ skipErrors: false });
      const testError = new Error('Should throw');
      
      expect(() => {
        handler.handleError(testError);
      }).toThrow(testError);
    });

    test('should log to file when errorLogPath is set', () => {
      const logPath = path.join(tempDir, 'errors.log');
      handler = new ErrorHandler({ errorLogPath: logPath });
      
      const testError = new Error('Logged error');
      handler.handleError(testError);
      
      expect(fs.existsSync(logPath)).toBe(true);
      
      const logContent = fs.readFileSync(logPath, 'utf8');
      const logEntry = JSON.parse(logContent.trim());
      
      expect(logEntry.message).toBe('Logged error');
      expect(logEntry.type).toBe('error');
    });
  });

  describe('handleParseError()', () => {
    test('should increment parse error count', () => {
      const line = 'invalid log line';
      const error = new Error('Parse failed');
      
      handler.handleParseError(line, error);
      
      expect(handler.parseErrorCount).toBe(1);
    });

    test('should return parse error info object', () => {
      const line = '2024-01-15 invalid log format';
      const error = new Error('Failed to parse timestamp');
      
      const result = handler.handleParseError(line, error);
      
      expect(result.timestamp).toBeDefined();
      expect(result.type).toBe('parse_error');
      expect(result.rawLine).toBe(line);
      expect(result.errorMessage).toBe('Failed to parse timestamp');
      expect(result.stack).toBeDefined();
    });

    test('should log parse errors to file when path is set', () => {
      const logPath = path.join(tempDir, 'parse-errors.log');
      handler = new ErrorHandler({ errorLogPath: logPath });
      
      const line = 'invalid log without timestamp';
      const error = new Error('No timestamp found');
      handler.handleParseError(line, error);
      
      const logContent = fs.readFileSync(logPath, 'utf8');
      const logEntry = JSON.parse(logContent.trim());
      
      expect(logEntry.type).toBe('parse_error');
      expect(logEntry.rawLine).toBe(line);
      expect(logEntry.errorMessage).toBe('No timestamp found');
    });
  });

  describe('handleInvalidLine()', () => {
    test('should increment invalid line count', () => {
      const line = 'this is not a valid log entry';
      
      handler.handleInvalidLine(line);
      
      expect(handler.invalidLineCount).toBe(1);
    });

    test('should return invalid line info object', () => {
      const line = 'random text that is not a log';
      
      const result = handler.handleInvalidLine(line);
      
      expect(result.timestamp).toBeDefined();
      expect(result.type).toBe('invalid_line');
      expect(result.rawLine).toBe(line);
    });

    test('should log invalid lines to file when path is set', () => {
      const logPath = path.join(tempDir, 'invalid-lines.log');
      handler = new ErrorHandler({ errorLogPath: logPath });
      
      const line = 'just some random text';
      handler.handleInvalidLine(line);
      
      const logContent = fs.readFileSync(logPath, 'utf8');
      const logEntry = JSON.parse(logContent.trim());
      
      expect(logEntry.type).toBe('invalid_line');
      expect(logEntry.rawLine).toBe(line);
    });
  });

  describe('getStats()', () => {
    test('should return correct statistics', () => {
      handler.handleError(new Error('Test error'));
      handler.handleParseError('invalid line', new Error('Parse error'));
      handler.handleInvalidLine('random text');
      
      const stats = handler.getStats();
      
      expect(stats.totalErrors).toBe(1);
      expect(stats.parseErrors).toBe(1);
      expect(stats.invalidLines).toBe(1);
    });

    test('should return zero stats when no errors handled', () => {
      const stats = handler.getStats();
      
      expect(stats.totalErrors).toBe(0);
      expect(stats.parseErrors).toBe(0);
      expect(stats.invalidLines).toBe(0);
    });
  });

  describe('resetStats()', () => {
    test('should reset all counters to zero', () => {
      handler.handleError(new Error('Error 1'));
      handler.handleParseError('line', new Error('Parse error'));
      handler.handleInvalidLine('text');
      
      expect(handler.getStats().totalErrors).toBe(1);
      expect(handler.getStats().parseErrors).toBe(1);
      expect(handler.getStats().invalidLines).toBe(1);
      
      handler.resetStats();
      
      expect(handler.getStats().totalErrors).toBe(0);
      expect(handler.getStats().parseErrors).toBe(0);
      expect(handler.getStats().invalidLines).toBe(0);
    });
  });

  describe('integration tests', () => {
    test('should handle multiple error types and accumulate stats', () => {
      for (let i = 0; i < 3; i++) {
        handler.handleError(new Error(`Error ${i}`));
      }
      
      for (let i = 0; i < 2; i++) {
        handler.handleParseError(`line ${i}`, new Error(`Parse error ${i}`));
      }
      
      for (let i = 0; i < 5; i++) {
        handler.handleInvalidLine(`invalid line ${i}`);
      }
      
      const stats = handler.getStats();
      expect(stats.totalErrors).toBe(3);
      expect(stats.parseErrors).toBe(2);
      expect(stats.invalidLines).toBe(5);
    });

    test('should append multiple entries to log file', () => {
      const logPath = path.join(tempDir, 'multiple-errors.log');
      handler = new ErrorHandler({ errorLogPath: logPath });
      
      handler.handleError(new Error('First error'));
      handler.handleParseError('invalid line', new Error('Parse error'));
      handler.handleInvalidLine('random text');
      
      const logContent = fs.readFileSync(logPath, 'utf8');
      const lines = logContent.trim().split('\n');
      
      expect(lines.length).toBe(3);
      
      const entries = lines.map(line => JSON.parse(line));
      expect(entries[0].type).toBe('error');
      expect(entries[1].type).toBe('parse_error');
      expect(entries[2].type).toBe('invalid_line');
    });
  });
});
