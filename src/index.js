const { pipeline } = require('stream');
const { promisify } = require('util');
const pipelineAsync = promisify(pipeline);

const FileReaderStream = require('./streams/file-reader-stream');
const LineSplitterStream = require('./streams/line-splitter-stream');
const ParserStream = require('./streams/parser-stream');
const AggregatorStream = require('./streams/aggregator-stream');
const ErrorHandlerStream = require('./streams/error-handler-stream');
const LogParser = require('./utils/log-parser');
const TimeWindowAggregator = require('./utils/time-window-aggregator');
const ErrorHandler = require('./utils/error-handler');

class StreamLogParser {
  constructor(options = {}) {
    this.options = options;
  }

  createPipeline(options = {}) {
    const fileReader = new FileReaderStream(options.filePath, {
      encoding: options.encoding || 'utf8'
    });

    const lineSplitter = new LineSplitterStream();

    const parser = new ParserStream({
      parserOptions: options.parserOptions
    });

    const aggregator = new AggregatorStream({
      aggregatorOptions: options.aggregatorOptions
    });

    const errorHandler = new ErrorHandlerStream({
      errorHandlerOptions: options.errorHandlerOptions,
      allowInvalidLines: options.allowInvalidLines
    });

    return {
      fileReader,
      lineSplitter,
      parser,
      aggregator,
      errorHandler,
      streams: [fileReader, lineSplitter, parser, aggregator, errorHandler]
    };
  }

  async parseLogFile(filePath, options = {}) {
    const mergedOptions = { ...this.options, ...options, filePath };
    const { fileReader, lineSplitter, parser, aggregator, errorHandler, streams } = this.createPipeline(mergedOptions);
    
    const results = {
      windows: [],
      errorLines: [],
      stats: {
        totalLines: 0,
        parsedLines: 0,
        errorLines: 0,
        windowCount: 0
      }
    };

    aggregator.on('data', (data) => {
      if (data.type === 'window') {
        results.windows.push(data.data);
        results.stats.windowCount++;
      } else if (data.type === 'error_line') {
        results.errorLines.push(data.data);
        results.stats.errorLines++;
      }
    });

    lineSplitter.on('data', () => {
      results.stats.totalLines++;
    });

    parser.on('data', (data) => {
      if (data.parsed && data.timestamp !== null) {
        results.stats.parsedLines++;
      }
    });

    try {
      await pipelineAsync(...streams);
      
      const errorStats = errorHandler.getErrorStats();
      results.stats = {
        ...results.stats,
        ...errorStats
      };

      return results;
    } catch (err) {
      throw new Error(`Pipeline failed: ${err.message}`);
    }
  }

  parseLogLine(line, options = {}) {
    const parser = new LogParser(options.parserOptions);
    return parser.parse(line);
  }

  createTimeWindowAggregator(options = {}) {
    return new TimeWindowAggregator(options);
  }

  createErrorHandler(options = {}) {
    return new ErrorHandler(options);
  }
}

module.exports = StreamLogParser;
module.exports.FileReaderStream = FileReaderStream;
module.exports.LineSplitterStream = LineSplitterStream;
module.exports.ParserStream = ParserStream;
module.exports.AggregatorStream = AggregatorStream;
module.exports.ErrorHandlerStream = ErrorHandlerStream;
module.exports.LogParser = LogParser;
module.exports.TimeWindowAggregator = TimeWindowAggregator;
module.exports.ErrorHandler = ErrorHandler;
