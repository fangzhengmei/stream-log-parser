const { Transform } = require('stream');
const LogParser = require('../utils/log-parser');

class ParserStream extends Transform {
  constructor(options = {}) {
    super({ objectMode: true, ...options });
    this.parser = new LogParser(options.parserOptions);
  }

  _transform(line, encoding, callback) {
    try {
      const parsed = this.parser.parse(line.toString(encoding));
      this.push(parsed);
      callback();
    } catch (err) {
      const errorRecord = {
        raw: line.toString(encoding),
        parsed: false,
        error: err.message,
        timestamp: null
      };
      this.push(errorRecord);
      callback();
    }
  }
}

module.exports = ParserStream;
