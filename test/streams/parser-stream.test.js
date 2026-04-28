const { Readable } = require('stream');
const { promisify } = require('util');
const pipeline = promisify(require('stream').pipeline);
const ParserStream = require('../../src/streams/parser-stream');

describe('ParserStream', () => {
  test('should parse valid log lines', async () => {
    const testLines = [
      '2024-01-15 10:30:45.123 INFO [Application] User login successful userId=123',
      '2024-01-15 10:30:46.456 ERROR [Payment] Transaction failed amount=99.99',
      '2024-01-15 10:30:47.789 WARN [Auth] Token expiring soon'
    ];

    const results = [];
    const readable = Readable.from(testLines);
    const parser = new ParserStream();

    parser.on('data', (data) => {
      results.push(data);
    });

    await pipeline(readable, parser);

    expect(results.length).toBe(3);
    expect(results[0].parsed).toBe(true);
    expect(results[0].level).toBe('INFO');
    expect(results[0].fields.userId).toBe(123);
    expect(results[1].level).toBe('ERROR');
    expect(results[1].fields.amount).toBe(99.99);
    expect(results[2].level).toBe('WARN');
  });

  test('should handle invalid log lines gracefully', async () => {
    const testLines = [
      '2024-01-15 10:30:45.123 INFO [App] Valid line',
      'This is not a valid log line',
      'Another invalid line without format'
    ];

    const results = [];
    const readable = Readable.from(testLines);
    const parser = new ParserStream();

    parser.on('data', (data) => {
      results.push(data);
    });

    await pipeline(readable, parser);

    expect(results.length).toBe(3);
    expect(results[0].parsed).toBe(true);
    expect(results[1].parsed).toBe(false);
    expect(results[2].parsed).toBe(false);
  });

  test('should preserve raw line in parsed result', async () => {
    const rawLine = '2024-01-15 10:30:45.123 INFO [Test] This is the raw message';
    const results = [];

    const readable = Readable.from([rawLine]);
    const parser = new ParserStream();

    parser.on('data', (data) => {
      results.push(data);
    });

    await pipeline(readable, parser);

    expect(results[0].raw).toBe(rawLine);
  });

  test('should extract additional fields from log lines', async () => {
    const testLine = '2024-01-15 10:30:45.123 INFO [Payment] Transaction processed userId=123 amount=99.99 status=success currency="USD"';
    const results = [];

    const readable = Readable.from([testLine]);
    const parser = new ParserStream();

    parser.on('data', (data) => {
      results.push(data);
    });

    await pipeline(readable, parser);

    expect(results[0].fields.userId).toBe(123);
    expect(results[0].fields.amount).toBe(99.99);
    expect(results[0].fields.status).toBe('success');
    expect(results[0].fields.currency).toBe('USD');
  });

  test('should handle lines without timestamp', async () => {
    const testLine = 'INFO [Application] Log without timestamp';
    const results = [];

    const readable = Readable.from([testLine]);
    const parser = new ParserStream();

    parser.on('data', (data) => {
      results.push(data);
    });

    await pipeline(readable, parser);

    expect(results[0].parsed).toBe(true);
    expect(results[0].timestamp).toBeNull();
    expect(results[0].level).toBe('INFO');
  });

  test('should use custom parser options when provided', async () => {
    const customOptions = {
      parserOptions: {
        patterns: {
          timestamp: /(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2})/,
          level: /\b(INFO|WARN|ERROR)\b/,
          message: /:\s+(.*)$/,
          source: /\[([^\]]+)\]/
        }
      }
    };

    const testLine = '15/01/2024 10:30:45 [CustomApp] INFO: Custom log format';
    const results = [];

    const readable = Readable.from([testLine]);
    const parser = new ParserStream(customOptions);

    parser.on('data', (data) => {
      results.push(data);
    });

    await pipeline(readable, parser);

    expect(results[0].level).toBe('INFO');
    expect(results[0].source).toBe('CustomApp');
  });

  test('should handle empty input', async () => {
    const results = [];
    const readable = Readable.from([]);
    const parser = new ParserStream();

    parser.on('data', (data) => {
      results.push(data);
    });

    await pipeline(readable, parser);

    expect(results.length).toBe(0);
  });

  test('should parse log entries with different log levels', async () => {
    const testLines = [
      '2024-01-15 10:30:45.123 DEBUG [App] Debug message',
      '2024-01-15 10:30:46.123 INFO [App] Info message',
      '2024-01-15 10:30:47.123 WARN [App] Warn message',
      '2024-01-15 10:30:48.123 ERROR [App] Error message',
      '2024-01-15 10:30:49.123 TRACE [App] Trace message'
    ];

    const results = [];
    const readable = Readable.from(testLines);
    const parser = new ParserStream();

    parser.on('data', (data) => {
      results.push(data);
    });

    await pipeline(readable, parser);

    expect(results.length).toBe(5);
    expect(results[0].level).toBe('DEBUG');
    expect(results[1].level).toBe('INFO');
    expect(results[2].level).toBe('WARN');
    expect(results[3].level).toBe('ERROR');
    expect(results[4].level).toBe('TRACE');
  });
});
