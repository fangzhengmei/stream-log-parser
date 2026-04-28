const { Transform } = require('stream');
const TimeWindowAggregator = require('../utils/time-window-aggregator');

class AggregatorStream extends Transform {
  constructor(options = {}) {
    super({ objectMode: true, ...options });
    this.aggregator = new TimeWindowAggregator(options.aggregatorOptions);
    this.lastTimestamp = null;
  }

  _transform(logEntry, encoding, callback) {
    try {
      if (logEntry.timestamp !== null) {
        this.lastTimestamp = logEntry.timestamp;
        
        const expiredWindows = this.aggregator.removeExpiredWindows(logEntry.timestamp);
        
        for (const window of expiredWindows) {
          this.push({
            type: 'window',
            data: this.aggregator.formatWindowForOutput(window)
          });
        }
        
        this.aggregator.addLogEntry(logEntry);
      } else {
        this.push({
          type: 'error_line',
          data: logEntry
        });
      }
      
      callback();
    } catch (err) {
      callback(err);
    }
  }

  _flush(callback) {
    try {
      const remainingWindows = this.aggregator.flushAllWindows();
      
      for (const window of remainingWindows) {
        this.push({
          type: 'window',
          data: this.aggregator.formatWindowForOutput(window)
        });
      }
      
      callback();
    } catch (err) {
      callback(err);
    }
  }
}

module.exports = AggregatorStream;
