const { Transform } = require('stream');
const ErrorHandler = require('../utils/error-handler');

class ErrorHandlerStream extends Transform {
  constructor(options = {}) {
    super({ objectMode: true, ...options });
    this.errorHandler = new ErrorHandler(options.errorHandlerOptions);
    this.allowInvalidLines = options.allowInvalidLines !== false;
  }

  _transform(data, encoding, callback) {
    try {
      if (data.type === 'error_line') {
        const logEntry = data.data;
        
        if (logEntry.error) {
          this.errorHandler.handleParseError(logEntry.raw, new Error(logEntry.error));
        } else if (!logEntry.parsed || logEntry.timestamp === null) {
          this.errorHandler.handleInvalidLine(logEntry.raw);
        }
        
        if (this.allowInvalidLines) {
          this.push(data);
        }
      } else {
        this.push(data);
      }
      
      callback();
    } catch (err) {
      this.errorHandler.handleError(err, { operation: 'transform' });
      callback(this.errorHandler.skipErrors ? null : err);
    }
  }

  getErrorStats() {
    return this.errorHandler.getStats();
  }

  resetErrorStats() {
    this.errorHandler.resetStats();
  }
}

module.exports = ErrorHandlerStream;
