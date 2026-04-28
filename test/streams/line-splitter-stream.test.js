const { Readable } = require('stream');
const { promisify } = require('util');
const pipeline = promisify(require('stream').pipeline);
const LineSplitterStream = require('../../src/streams/line-splitter-stream');

describe('LineSplitterStream', () => {
  test('should split single line', async () => {
    const input = 'This is a single line';
    const chunks = [];

    const readable = Readable.from([input]);
    const splitter = new LineSplitterStream();

    splitter.on('data', (chunk) => {
      chunks.push(chunk);
    });

    await pipeline(readable, splitter);

    expect(chunks.length).toBe(1);
    expect(chunks[0]).toBe('This is a single line');
  });

  test('should split multiple lines with newline', async () => {
    const input = 'Line 1\nLine 2\nLine 3';
    const chunks = [];

    const readable = Readable.from([input]);
    const splitter = new LineSplitterStream();

    splitter.on('data', (chunk) => {
      chunks.push(chunk);
    });

    await pipeline(readable, splitter);

    expect(chunks.length).toBe(3);
    expect(chunks[0]).toBe('Line 1');
    expect(chunks[1]).toBe('Line 2');
    expect(chunks[2]).toBe('Line 3');
  });

  test('should split multiple lines with CRLF', async () => {
    const input = 'Line 1\r\nLine 2\r\nLine 3';
    const chunks = [];

    const readable = Readable.from([input]);
    const splitter = new LineSplitterStream();

    splitter.on('data', (chunk) => {
      chunks.push(chunk);
    });

    await pipeline(readable, splitter);

    expect(chunks.length).toBe(3);
    expect(chunks[0]).toBe('Line 1');
    expect(chunks[1]).toBe('Line 2');
    expect(chunks[2]).toBe('Line 3');
  });

  test('should handle empty lines', async () => {
    const input = 'Line 1\n\nLine 2\n\n';
    const chunks = [];

    const readable = Readable.from([input]);
    const splitter = new LineSplitterStream();

    splitter.on('data', (chunk) => {
      chunks.push(chunk);
    });

    await pipeline(readable, splitter);

    expect(chunks.length).toBe(2);
    expect(chunks[0]).toBe('Line 1');
    expect(chunks[1]).toBe('Line 2');
  });

  test('should handle whitespace-only lines', async () => {
    const input = 'Line 1\n   \nLine 2\n\t\n';
    const chunks = [];

    const readable = Readable.from([input]);
    const splitter = new LineSplitterStream();

    splitter.on('data', (chunk) => {
      chunks.push(chunk);
    });

    await pipeline(readable, splitter);

    expect(chunks.length).toBe(2);
    expect(chunks[0]).toBe('Line 1');
    expect(chunks[1]).toBe('Line 2');
  });

  test('should handle partial lines across chunks', async () => {
    const chunks = [];
    const readable = Readable.from(['Line 1\nLin', 'e 2\nLine 3']);
    const splitter = new LineSplitterStream();

    splitter.on('data', (chunk) => {
      chunks.push(chunk);
    });

    await pipeline(readable, splitter);

    expect(chunks.length).toBe(3);
    expect(chunks[0]).toBe('Line 1');
    expect(chunks[1]).toBe('Line 2');
    expect(chunks[2]).toBe('Line 3');
  });

  test('should flush remaining data without newline', async () => {
    const chunks = [];
    const readable = Readable.from(['Line without newline']);
    const splitter = new LineSplitterStream();

    splitter.on('data', (chunk) => {
      chunks.push(chunk);
    });

    await pipeline(readable, splitter);

    expect(chunks.length).toBe(1);
    expect(chunks[0]).toBe('Line without newline');
  });

  test('should handle very long lines', async () => {
    const longLine = 'x'.repeat(10000);
    const chunks = [];
    const readable = Readable.from([longLine]);
    const splitter = new LineSplitterStream();

    splitter.on('data', (chunk) => {
      chunks.push(chunk);
    });

    await pipeline(readable, splitter);

    expect(chunks.length).toBe(1);
    expect(chunks[0].length).toBe(10000);
  });

  test('should handle mixed line endings', async () => {
    const input = 'Line 1\nLine 2\r\nLine 3\nLine 4';
    const chunks = [];

    const readable = Readable.from([input]);
    const splitter = new LineSplitterStream();

    splitter.on('data', (chunk) => {
      chunks.push(chunk);
    });

    await pipeline(readable, splitter);

    expect(chunks.length).toBe(4);
    expect(chunks[0]).toBe('Line 1');
    expect(chunks[1]).toBe('Line 2');
    expect(chunks[2]).toBe('Line 3');
    expect(chunks[3]).toBe('Line 4');
  });
});
