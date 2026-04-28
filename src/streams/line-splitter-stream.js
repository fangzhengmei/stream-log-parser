const { Transform } = require('stream');

class LineSplitterStream extends Transform {
  constructor(options = {}) {
    super({ objectMode: true, ...options });
    this.remaining = '';
  }

  _transform(chunk, encoding, callback) {
    try {
      const data = this.remaining + chunk.toString(encoding);
      const lines = data.split(/\r?\n/);
      
      this.remaining = lines.pop() || '';
      
      for (const line of lines) {
        if (line.trim()) {
          this.push(line);
        }
      }
      
      callback();
    } catch (err) {
      callback(err);
    }
  }

  _flush(callback) {
    try {
      if (this.remaining.trim()) {
        this.push(this.remaining);
      }
      callback();
    } catch (err) {
      callback(err);
    }
  }
}

module.exports = LineSplitterStream;
