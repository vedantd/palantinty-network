/**
 * Bounded byte-aware JSON Lines framing for a local Unix socket.
 * Oversized records are discarded until the next newline.
 */
export class JsonLineDecoder {
  constructor({ onLine, onDropped = () => {}, maxLineBytes = 131_072 } = {}) {
    if (typeof onLine !== 'function' || typeof onDropped !== 'function') throw new TypeError('callbacks required');
    if (!Number.isSafeInteger(maxLineBytes) || maxLineBytes < 32) throw new RangeError('maxLineBytes');
    Object.assign(this, { onLine, onDropped, maxLineBytes });
    this.partial = Buffer.alloc(0);
    this.discarding = false;
  }
  push(input) {
    const data = Buffer.isBuffer(input) ? input : Buffer.from(input);
    let offset = 0;
    while (offset < data.length) {
      const newline = data.indexOf(10, offset);
      const end = newline < 0 ? data.length : newline;
      const piece = data.subarray(offset, end);
      if (!this.discarding) {
        if (this.partial.length + piece.length > this.maxLineBytes) {
          this.partial = Buffer.alloc(0);
          this.discarding = true;
          this.onDropped('oversize');
        } else if (piece.length) this.partial = Buffer.concat([this.partial, piece]);
      }
      if (newline >= 0) {
        if (!this.discarding && this.partial.length) {
          let line = this.partial;
          if (line[line.length - 1] === 13) line = line.subarray(0, line.length - 1);
          if (line.length) this.onLine(line.toString('utf8'));
        }
        this.partial = Buffer.alloc(0);
        this.discarding = false;
        offset = newline + 1;
      } else break;
    }
  }
  close() {
    if (this.partial.length) this.onDropped('unterminated');
    this.partial = Buffer.alloc(0);
    this.discarding = false;
  }
}
