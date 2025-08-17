export class Occlude {
  constructor() {}

  load(buffer) {
    if (!(buffer instanceof Uint8Array)) {
      if (buffer instanceof ArrayBuffer) {
        buffer = new Uint8Array(buffer);
      } else {
        throw new Error("Occlude constructor requires Uint8Array or ArrayBuffer");
      }
    }

    this.buffer = buffer;
  }

  get(index) {return (this.buffer[index>>3] >> (index%8)) & 1 === 1;}
}