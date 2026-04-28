class LogParser {
  constructor(options = {}) {
    this.patterns = options.patterns || {
      timestamp: /(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})/,
      level: /\b(INFO|WARN|ERROR|DEBUG|TRACE)\b/,
      message: /\]\s+(.*)$/,
      source: /\[([^\]]+)\]/
    };
    this.timestampFormat = options.timestampFormat || 'YYYY-MM-DD HH:mm:ss.SSS';
  }

  parse(line) {
    const result = {
      raw: line,
      parsed: false,
      timestamp: null,
      level: null,
      message: null,
      source: null,
      fields: {}
    };

    try {
      const timestampMatch = line.match(this.patterns.timestamp);
      if (timestampMatch) {
        result.timestamp = this.parseTimestamp(timestampMatch[1]);
      }

      const levelMatch = line.match(this.patterns.level);
      if (levelMatch) {
        result.level = levelMatch[1];
      }

      const sourceMatch = line.match(this.patterns.source);
      if (sourceMatch) {
        result.source = sourceMatch[1];
      }

      const messageMatch = line.match(this.patterns.message);
      if (messageMatch) {
        result.message = messageMatch[1];
      }

      result.parsed = !!(result.timestamp || result.level || result.message);
      result.fields = this.extractAdditionalFields(line);

      return result;
    } catch (err) {
      throw new Error(`Failed to parse line: ${err.message}`);
    }
  }

  parseTimestamp(timestampStr) {
    const dateStr = timestampStr.replace(' ', 'T');
    return new Date(dateStr).getTime();
  }

  extractAdditionalFields(line) {
    const fields = {};
    const keyValuePattern = /(\w+)=([^\s,]+)/g;
    let match;
    
    while ((match = keyValuePattern.exec(line)) !== null) {
      const key = match[1];
      let value = match[2];
      
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      
      if (!isNaN(value) && value.trim() !== '') {
        value = Number(value);
      }
      
      fields[key] = value;
    }
    
    return fields;
  }

  isValid(parsed) {
    return !!(parsed && parsed.parsed && parsed.timestamp !== null);
  }
}

module.exports = LogParser;
