const fs = require('fs');
const path = require('path');
const os = require('os');
const StreamLogParser = require('../src/index');

describe('Memory Usage Tests', () => {
  let tempDir;
  let testLogPath;
  let parser;

  beforeEach(() => {
    parser = new StreamLogParser();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stream-log-parser-memory-test-'));
    testLogPath = path.join(tempDir, 'large-test.log');
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
    
    if (global.gc) {
      global.gc();
    }
  });

  function getMemoryUsage() {
    const mem = process.memoryUsage();
    return {
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed,
      external: mem.external,
      arrayBuffers: mem.arrayBuffers
    };
  }

  function formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  function generateLogLine(index) {
    const timestamp = new Date(2024, 0, 15, 10, Math.floor(index / 100), index % 60, index % 1000);
    const timestampStr = timestamp.toISOString().replace('T', ' ').replace('Z', '').substring(0, 23);
    
    const levels = ['INFO', 'WARN', 'ERROR', 'DEBUG'];
    const level = levels[index % levels.length];
    
    const sources = ['Application', 'Payment', 'Auth', 'Database', 'API'];
    const source = sources[index % sources.length];
    
    const userId = 10000 + (index % 90000);
    const amount = (Math.random() * 1000).toFixed(2);
    
    return `${timestampStr} ${level} [${source}] Log entry ${index} userId=${userId} amount=${amount} status=success`;
  }

  async function generateLargeFile(lineCount) {
    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(testLogPath);
      let lineIndex = 0;
      
      function writeChunk() {
        let canWrite = true;
        
        while (lineIndex < lineCount && canWrite) {
          const line = generateLogLine(lineIndex);
          const lineWithNewline = lineIndex === lineCount - 1 ? line : line + '\n';
          
          canWrite = writeStream.write(lineWithNewline);
          lineIndex++;
        }
        
        if (lineIndex >= lineCount) {
          writeStream.end();
        }
      }
      
      writeStream.on('drain', () => {
        writeChunk();
      });
      
      writeStream.on('finish', () => {
        resolve();
      });
      
      writeStream.on('error', (err) => {
        reject(err);
      });
      
      writeChunk();
    });
  }

  test('should maintain constant memory usage while processing large file (100K lines)', async () => {
    const lineCount = 100000;
    
    console.log(`\n=== Memory Usage Test (${lineCount.toLocaleString()} lines) ===`);
    
    if (global.gc) {
      global.gc();
    }
    
    const baselineMem = getMemoryUsage();
    console.log(`Baseline memory: heapUsed = ${formatBytes(baselineMem.heapUsed)}`);
    
    console.log(`Generating test file with ${lineCount.toLocaleString()} lines...`);
    await generateLargeFile(lineCount);
    
    const fileStats = fs.statSync(testLogPath);
    console.log(`Generated file size: ${formatBytes(fileStats.size)}`);
    
    if (global.gc) {
      global.gc();
    }
    
    const preProcessMem = getMemoryUsage();
    console.log(`Pre-process memory: heapUsed = ${formatBytes(preProcessMem.heapUsed)}`);
    
    const memorySamples = [];
    let sampleInterval = Math.floor(lineCount / 20);
    let linesProcessed = 0;
    
    const sampleMemory = () => {
      linesProcessed++;
      if (linesProcessed % sampleInterval === 0) {
        memorySamples.push({
          linesProcessed,
          memory: getMemoryUsage()
        });
      }
    };

    const { fileReader, lineSplitter, parser, aggregator, errorHandler, streams } = parser.createPipeline({
      filePath: testLogPath,
      aggregatorOptions: {
        windowSizeMs: 60 * 1000,
        aggregationKeys: ['level']
      }
    });

    lineSplitter.on('data', sampleMemory);
    
    const resultCollector = new (require('stream').Writable)({
      objectMode: true,
      write(data, encoding, callback) {
        callback();
      }
    });

    const allStreams = [...streams, resultCollector];

    const startTime = Date.now();
    const results = await require('util').promisify(require('stream').pipeline)(...allStreams);
    const endTime = Date.now();
    
    lineSplitter.removeListener('data', sampleMemory);
    
    memorySamples.push({
      linesProcessed: lineCount,
      memory: getMemoryUsage()
    });
    
    const postProcessMem = getMemoryUsage();
    console.log(`Post-process memory: heapUsed = ${formatBytes(postProcessMem.heapUsed)}`);
    
    const heapUsedValues = memorySamples.map(s => s.memory.heapUsed);
    const minHeapUsed = Math.min(...heapUsedValues);
    const maxHeapUsed = Math.max(...heapUsedValues);
    const avgHeapUsed = heapUsedValues.reduce((a, b) => a + b, 0) / heapUsedValues.length;
    
    const memoryIncrease = maxHeapUsed - preProcessMem.heapUsed;
    
    console.log('\n--- Memory Samples During Processing ---');
    memorySamples.forEach((sample, index) => {
      console.log(`  Sample ${index + 1}: ${sample.linesProcessed.toLocaleString()} lines -> heapUsed = ${formatBytes(sample.memory.heapUsed)}`);
    });
    
    console.log('\n--- Memory Usage Summary ---');
    console.log(`  Min heapUsed: ${formatBytes(minHeapUsed)}`);
    console.log(`  Max heapUsed: ${formatBytes(maxHeapUsed)}`);
    console.log(`  Avg heapUsed: ${formatBytes(Math.round(avgHeapUsed))}`);
    console.log(`  Memory increase during processing: ${formatBytes(memoryIncrease)}`);
    console.log(`  Processing time: ${((endTime - startTime) / 1000).toFixed(2)}s`);
    
    const maxAllowedIncrease = 50 * 1024 * 1024;
    
    console.log(`\n--- Assertions ---`);
    console.log(`  Max allowed memory increase: ${formatBytes(maxAllowedIncrease)}`);
    console.log(`  Actual memory increase: ${formatBytes(memoryIncrease)}`);
    console.log(`  Pass: ${memoryIncrease <= maxAllowedIncrease}`);
    
    expect(memoryIncrease).toBeLessThanOrEqual(maxAllowedIncrease);
    
    const firstQuarterMemory = heapUsedValues[Math.floor(heapUsedValues.length * 0.25)];
    const lastQuarterMemory = heapUsedValues[Math.floor(heapUsedValues.length * 0.75)];
    const memoryGrowthFactor = lastQuarterMemory / firstQuarterMemory;
    
    console.log(`\n--- Memory Growth Check ---`);
    console.log(`  First quarter memory: ${formatBytes(firstQuarterMemory)}`);
    console.log(`  Last quarter memory: ${formatBytes(lastQuarterMemory)}`);
    console.log(`  Growth factor: ${memoryGrowthFactor.toFixed(2)}x`);
    console.log(`  Pass: ${memoryGrowthFactor < 2.0}`);
    
    expect(memoryGrowthFactor).toBeLessThan(2.0);
    
    expect(lineCount).toBeGreaterThan(0);
  }, 120000);

  test('should have similar memory usage for different file sizes', async () => {
    console.log(`\n=== Memory Comparison Test ===`);
    
    if (global.gc) {
      global.gc();
    }
    
    const testConfigs = [
      { lineCount: 10000, label: '10K lines' },
      { lineCount: 50000, label: '50K lines' },
      { lineCount: 100000, label: '100K lines' }
    ];
    
    const results = [];
    
    for (const config of testConfigs) {
      const configTestPath = path.join(tempDir, `test-${config.lineCount}.log`);
      
      if (global.gc) {
        global.gc();
      }
      
      const baselineMem = getMemoryUsage();
      
      const lineGenerator = (index) => {
        const timestamp = new Date(2024, 0, 15, 10, Math.floor(index / 100), index % 60, index % 1000);
        const timestampStr = timestamp.toISOString().replace('T', ' ').replace('Z', '').substring(0, 23);
        return `${timestampStr} INFO [App] Log entry ${index} userId=${index}`;
      };
      
      await new Promise((resolve, reject) => {
        const writeStream = fs.createWriteStream(configTestPath);
        let lineIndex = 0;
        
        function writeChunk() {
          let canWrite = true;
          while (lineIndex < config.lineCount && canWrite) {
            const line = lineGenerator(lineIndex);
            const lineWithNewline = lineIndex === config.lineCount - 1 ? line : line + '\n';
            canWrite = writeStream.write(lineWithNewline);
            lineIndex++;
          }
          if (lineIndex >= config.lineCount) {
            writeStream.end();
          }
        }
        
        writeStream.on('drain', writeChunk);
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        writeChunk();
      });
      
      if (global.gc) {
        global.gc();
      }
      
      const preProcessMem = getMemoryUsage();
      
      let maxHeapUsed = 0;
      let samples = 0;
      const sampleInterval = Math.floor(config.lineCount / 10);
      
      const parserInstance = new StreamLogParser();
      const { fileReader, lineSplitter, parserStream, aggregator, errorHandler, streams } = parserInstance.createPipeline({
        filePath: configTestPath,
        aggregatorOptions: {
          windowSizeMs: 60 * 1000
        }
      });
      
      lineSplitter.on('data', () => {
        samples++;
        if (samples % sampleInterval === 0) {
          const currentMem = getMemoryUsage();
          if (currentMem.heapUsed > maxHeapUsed) {
            maxHeapUsed = currentMem.heapUsed;
          }
        }
      });
      
      const resultCollector = new (require('stream').Writable)({
        objectMode: true,
        write(data, encoding, callback) {
          callback();
        }
      });

      const allStreams = [...streams, resultCollector];

      try {
        await require('util').promisify(require('stream').pipeline)(...allStreams);
      } finally {
        lineSplitter.removeAllListeners('data');
      }
      
      const postProcessMem = getMemoryUsage();
      const actualMax = Math.max(maxHeapUsed, preProcessMem.heapUsed, postProcessMem.heapUsed);
      const memoryIncrease = actualMax - baselineMem.heapUsed;
      
      const fileStats = fs.statSync(configTestPath);
      
      results.push({
        label: config.label,
        lineCount: config.lineCount,
        fileSize: fileStats.size,
        memoryIncrease
      });
      
      console.log(`  ${config.label} (${formatBytes(fileStats.size)}): memory increase = ${formatBytes(memoryIncrease)}`);
    }
    
    console.log(`\n--- Memory Comparison ---`);
    results.forEach(r => {
      console.log(`  ${r.label}: ${formatBytes(r.memoryIncrease)}`);
    });
    
    const smallestMem = Math.min(...results.map(r => r.memoryIncrease));
    const largestMem = Math.max(...results.map(r => r.memoryIncrease));
    const memRatio = largestMem / smallestMem;
    
    console.log(`\n--- Assertions ---`);
    console.log(`  Smallest memory increase: ${formatBytes(smallestMem)}`);
    console.log(`  Largest memory increase: ${formatBytes(largestMem)}`);
    console.log(`  Ratio (largest/smallest): ${memRatio.toFixed(2)}x`);
    console.log(`  Pass: ${memRatio < 3.0}`);
    
    expect(memRatio).toBeLessThan(3.0);
    
    const maxAllowedIncrease = 100 * 1024 * 1024;
    results.forEach(r => {
      expect(r.memoryIncrease).toBeLessThan(maxAllowedIncrease);
    });
  }, 300000);
});
