'use strict';

const fs = require('fs');
const path = require('path');

const LEVELS = { INFO: 0, WARN: 1, ERROR: 2 };

class Logger {
    constructor(options = {}) {
        this.filePath = options.filePath || path.join(__dirname, 'evaluation.log');
        this.minLevel = LEVELS[String(options.level || 'INFO').toUpperCase()] ?? LEVELS.INFO;
        this._stream = null;
        this._streamFailed = false;
    }

    _getStream() {
        if (this._streamFailed) return null;
        if (!this._stream) {
            try {
                this._stream = fs.createWriteStream(this.filePath, { flags: 'a', encoding: 'utf-8' });
                this._stream.on('error', (err) => {
                    process.stderr.write(`[Logger] Cannot write to ${this.filePath}: ${err.message}\n`);
                    this._streamFailed = true;
                    this._stream = null;
                });
            } catch (err) {
                process.stderr.write(`[Logger] Cannot open ${this.filePath}: ${err.message}\n`);
                this._streamFailed = true;
            }
        }
        return this._stream;
    }

    _write(level, message, meta) {
        if (LEVELS[level] < this.minLevel) return;
        const timestamp = new Date().toISOString();
        const metaPart = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
        const line = `[${timestamp}] [${level}] ${message}${metaPart}\n`;
        const stream = this._getStream();
        if (stream) {
            stream.write(line);
        } else {
            (level === 'INFO' ? process.stdout : process.stderr).write(line);
        }
    }

    info(message, meta) { this._write('INFO', message, meta); }
    warn(message, meta) { this._write('WARN', message, meta); }
    error(message, meta) { this._write('ERROR', message, meta); }

    close() {
        if (this._stream) {
            this._stream.end();
            this._stream = null;
        }
    }
}

module.exports = Logger;
