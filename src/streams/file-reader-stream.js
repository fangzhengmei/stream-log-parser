const { Readable } = require('stream');
const fs = require('fs');

class FileReaderStream extends Readable {
  constructor(filePath, options = {}) {
    super({ objectMode: true, ...options });
    this.filePath = filePath;
    this.readStream = null;
    this.encoding = options.encoding || 'utf8';
    this._isReading = false;
    this._boundOnError = null;
    this._boundOnEnd = null;
    this._boundOnReadable = null;
  }

  _construct(callback) {
    try {
      this.readStream = fs.createReadStream(this.filePath, {
        encoding: this.encoding,
        highWaterMark: 64 * 1024
      });

      this._boundOnError = (err) => this._onError(err);
      this._boundOnEnd = () => this._onEnd();
      this._boundOnReadable = () => this._onReadable();

      this.readStream.on('error', this._boundOnError);
      this.readStream.on('end', this._boundOnEnd);
      this.readStream.on('readable', this._boundOnReadable);

      callback();
    } catch (err) {
      callback(err);
    }
  }

  _onError(err) {
    this._cleanup();
    this.destroy(err);
  }

  _onEnd() {
    this._cleanup();
    this.push(null);
  }

  _onReadable() {
    this._readFromSource();
  }

  _readFromSource() {
    if (this._isReading) return;
    
    this._isReading = true;
    
    try {
      let chunk;
      while ((chunk = this.readStream.read()) !== null) {
        if (!this.push(chunk)) {
          this._isReading = false;
          return;
        }
      }
    } finally {
      this._isReading = false;
    }
  }

  _read() {
    this._readFromSource();
  }

  _cleanup() {
    if (this.readStream) {
      if (this._boundOnError) {
        this.readStream.removeListener('error', this._boundOnError);
      }
      if (this._boundOnEnd) {
        this.readStream.removeListener('end', this._boundOnEnd);
      }
      if (this._boundOnReadable) {
        this.readStream.removeListener('readable', this._boundOnReadable);
      }
    }
  }

  _destroy(err, callback) {
    this._cleanup();
    
    if (this.readStream) {
      const stream = this.readStream;
      this.readStream = null;
      
      const onClose = () => {
        stream.removeListener('close', onClose);
        stream.removeListener('error', onError);
        callback(err);
      };
      
      const onError = (destroyErr) => {
        stream.removeListener('close', onClose);
        stream.removeListener('error', onError);
        callback(err || destroyErr);
      };
      
      stream.on('close', onClose);
      stream.on('error', onError);
      
      try {
        stream.destroy();
      } catch (e) {
        stream.removeListener('close', onClose);
        stream.removeListener('error', onError);
        callback(err || e);
      }
    } else {
      callback(err);
    }
  }
}

module.exports = FileReaderStream;
