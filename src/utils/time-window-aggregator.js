class TimeWindowAggregator {
  constructor(options = {}) {
    this.windowSizeMs = options.windowSizeMs || 60 * 1000; // 默认1分钟窗口
    this.aggregationKeys = options.aggregationKeys || ['level'];
    this.windows = new Map(); // 窗口起始时间 -> 窗口数据
    this.currentWindowStart = null;
  }

  getWindowStart(timestamp) {
    return Math.floor(timestamp / this.windowSizeMs) * this.windowSizeMs;
  }

  addLogEntry(logEntry) {
    if (!logEntry.timestamp) {
      return null;
    }

    const windowStart = this.getWindowStart(logEntry.timestamp);
    const windowEnd = windowStart + this.windowSizeMs;

    if (!this.windows.has(windowStart)) {
      this.windows.set(windowStart, {
        windowStart,
        windowEnd,
        count: 0,
        aggregations: {},
        entries: []
      });
    }

    const window = this.windows.get(windowStart);
    window.count++;
    window.entries.push(logEntry);

    for (const key of this.aggregationKeys) {
      const value = logEntry[key] || logEntry.fields?.[key] || 'unknown';
      const valueStr = String(value);
      
      if (!window.aggregations[key]) {
        window.aggregations[key] = new Map();
      }
      
      if (!window.aggregations[key].has(valueStr)) {
        window.aggregations[key].set(valueStr, {
          value,
          count: 0,
          entries: []
        });
      }
      
      const aggregation = window.aggregations[key].get(valueStr);
      aggregation.count++;
      aggregation.entries.push(logEntry);
    }

    return window;
  }

  getExpiredWindows(currentTimestamp) {
    const expiredWindows = [];
    const currentWindowStart = this.getWindowStart(currentTimestamp);

    for (const [windowStart, window] of this.windows) {
      if (windowStart < currentWindowStart) {
        expiredWindows.push(window);
      }
    }

    return expiredWindows;
  }

  removeExpiredWindows(currentTimestamp) {
    const expiredWindows = this.getExpiredWindows(currentTimestamp);
    
    for (const window of expiredWindows) {
      this.windows.delete(window.windowStart);
    }

    return expiredWindows;
  }

  getAllWindows() {
    return Array.from(this.windows.values());
  }

  flushAllWindows() {
    const allWindows = this.getAllWindows();
    this.windows.clear();
    return allWindows;
  }

  formatWindowForOutput(window) {
    const formatted = {
      windowStart: new Date(window.windowStart).toISOString(),
      windowEnd: new Date(window.windowEnd).toISOString(),
      windowStartMs: window.windowStart,
      windowEndMs: window.windowEnd,
      count: window.count,
      aggregations: {}
    };

    for (const [key, aggregationMap] of Object.entries(window.aggregations)) {
      formatted.aggregations[key] = Array.from(aggregationMap.values()).map(item => ({
        value: item.value,
        count: item.count
      }));
    }

    return formatted;
  }
}

module.exports = TimeWindowAggregator;
