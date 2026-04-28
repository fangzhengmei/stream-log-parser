const { Readable } = require('stream');
const fs = require('fs');

class FileReaderStream extends Readable {
  constructor(filePath, options = {}) {
    super({ objectMode: true, ...options });
    this.filePath = filePath;
    this.readStream = null;
    this.encoding = options.encoding || 'utf8';
  }

  _construct(callback) {
    try {
      this.readStream = fs.createReadStream(this.filePath, {
        encoding: this.encoding,
        highWaterMark: 64 * 1024
      });
      
      this.readStream.on('error', (err) => {
        this.destroy(err);
      });
      
      callback();
    } catch (err) {
      callback(err);
    }
  }

  _read() {
    const pushLine = () => {
      let chunk;
      while ((chunk = this.readStream.read()) !== null) {
        if (!this.push(chunk)) {
          this.readStream.once('drain', pushLine);
          return;
        }
      }
      
      this.readStream.once('readable', pushLine);
    };
    
    pushLine();
  }

  _destroy(err, callback) {
    if (this.readStream) {
      this.readStream.destroy();
    }
    callback(err);
  }
}

module.exports = FileReaderStream;
