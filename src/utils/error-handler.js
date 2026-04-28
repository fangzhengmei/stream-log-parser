const fs = require('fs');
const path = require('path');

class ErrorHandler {
  constructor(options = {}) {
    this.errorLogPath = options.errorLogPath || null;
    this.skipErrors = options.skipErrors !== false;
    this.verbose = options.verbose || false;
    this.errorCount = 0;
    this.parseErrorCount = 0;
    this.invalidLineCount = 0;
  }

  handleError(error, context = {}) {
    this.errorCount++;
    
    const errorInfo = {
      timestamp: new Date().toISOString(),
      type: 'error',
      message: error.message,
      stack: error.stack,
      context
    };

    if (this.verbose) {
      console.error(`[ERROR] ${error.message}`);
    }

    if (this.errorLogPath) {
      this.logError(errorInfo);
    }

    if (!this.skipErrors) {
      throw error;
    }

    return errorInfo;
  }

  handleParseError(line, error) {
    this.parseErrorCount++;
    
    const errorInfo = {
      timestamp: new Date().toISOString(),
      type: 'parse_error',
      rawLine: line,
      errorMessage: error.message,
      stack: error.stack
    };

    if (this.verbose) {
      console.error(`[PARSE ERROR] Failed to parse line: ${line.substring(0, 100)}...`);
    }

    if (this.errorLogPath) {
      this.logError(errorInfo);
    }

    return errorInfo;
  }

  handleInvalidLine(line) {
    this.invalidLineCount++;
    
    const errorInfo = {
      timestamp: new Date().toISOString(),
      type: 'invalid_line',
      rawLine: line
    };

    if (this.verbose) {
      console.warn(`[INVALID LINE] Skipping invalid line: ${line.substring(0, 100)}...`);
    }

    if (this.errorLogPath) {
      this.logError(errorInfo);
    }

    return errorInfo;
  }

  logError(errorInfo) {
    try {
      const logLine = JSON.stringify(errorInfo) + '\n';
      fs.appendFileSync(this.errorLogPath, logLine, 'utf8');
    } catch (err) {
      console.error(`Failed to write error log: ${err.message}`);
    }
  }

  getStats() {
    return {
      totalErrors: this.errorCount,
      parseErrors: this.parseErrorCount,
      invalidLines: this.invalidLineCount
    };
  }

  resetStats() {
    this.errorCount = 0;
    this.parseErrorCount = 0;
    this.invalidLineCount = 0;
  }
}

module.exports = ErrorHandler;
