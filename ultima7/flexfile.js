export class FlexFile {
  static HEADER_SIZE = 80 + 4 + 4 + 4 + 4 * 9; // title(80) + 3 DWORD + 9 DWORDs
  static REFERENCE_SIZE = 4 + 4; // offset + size

  constructor() {
    this.fileName = "";
    this.title = "";
    // array of { data: Uint8Array|null, size: number }
    this.objects = [];
  }

  clear() {
    this.objects = [];
  }

  // Helper: parse HEADER from DataView
  static parseHeader(buffer) {
    const view = new DataView(buffer);
    const textDecoder = new TextDecoder("utf-8");
    // title: first 80 bytes
    const titleBytes = new Uint8Array(buffer, 0, 80);
    let title = textDecoder.decode(titleBytes).replace(/\0.*$/g, ""); // trim at first null
    const magic1 = view.getUint32(80, true);
    const count = view.getUint32(84, true);
    const magic2 = view.getUint32(88, true);
    // d1..d9
    const d = [];
    for (let i = 0; i < 9; i++) {
      d.push(view.getUint32(92 + i * 4, true));
    }
    return { title, magic1, count, magic2, d };
  }

  // Helper: parse REFERENCE at offset
  static parseReference(buffer, offset) {
    const view = new DataView(buffer, offset, 8);
    const offsetVal = view.getUint32(0, true);
    const sizeVal = view.getUint32(4, true);
    return { offset: offsetVal, size: sizeVal };
  }

  // Open from ArrayBuffer or Uint8Array
  async open(buffer) {
    this.clear();

    if (!(buffer instanceof ArrayBuffer)) {
      if (buffer.buffer instanceof ArrayBuffer) {
        buffer = buffer.buffer;
      } else {
        throw new Error("open() expects an ArrayBuffer or Uint8Array");
      }
    }

    if (buffer.byteLength < FlexFile.HEADER_SIZE) return false;

    // Parse header
    const header = FlexFile.parseHeader(buffer);
    this.title = header.title;

    const objCount = header.count;

    this.objects = new Array(objCount);

    // Read references and object data
    for (let i = 0; i < objCount; i++) {
      const refOffset = FlexFile.HEADER_SIZE + i * FlexFile.REFERENCE_SIZE;
      if (refOffset + FlexFile.REFERENCE_SIZE > buffer.byteLength) {
        return false;
      }

      const ref = FlexFile.parseReference(buffer, refOffset);

      if (ref.offset + ref.size > buffer.byteLength) {
        return false;
      }

      if (ref.offset === 0 || ref.size === 0) {
        this.objects[i] = { data: null, size: 0 };
      } else {
        // slice the Uint8Array view for this object
        const data = new Uint8Array(buffer, ref.offset, ref.size);
        // copy to detach from original buffer (optional, can keep reference)
        this.objects[i] = { data: new Uint8Array(data), size: ref.size };
      }
    }

    return true;
  }

  // Save to ArrayBuffer (returns ArrayBuffer)
  save(title) {
    // Calculate total size
    const count = this.objects.length;
    const headerSize = FlexFile.HEADER_SIZE;
    const referencesSize = count * FlexFile.REFERENCE_SIZE;

    // Calculate size of all object data
    let totalDataSize = 0;
    for (const obj of this.objects) {
      totalDataSize += obj.size;
    }

    const totalSize = headerSize + referencesSize + totalDataSize;

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    const textEncoder = new TextEncoder();

    // Write header
    const titleBytes = textEncoder.encode(title);
    const titleBuf = new Uint8Array(buffer, 0, 80);
    titleBuf.fill(0);
    titleBuf.set(titleBytes.subarray(0, 80));

    view.setUint32(80, 0xffff1a00, true); // magic1
    view.setUint32(84, count, true);       // count
    view.setUint32(88, 0x000000cc, true);  // magic2

    for (let i = 0; i < 9; i++) {
      view.setUint32(92 + i * 4, 0, true);
    }

    // Write references
    let dataOffset = headerSize + referencesSize;

    for (let i = 0; i < count; i++) {
      const refOffset = headerSize + i * FlexFile.REFERENCE_SIZE;

      const obj = this.objects[i];

      if (!obj.data || obj.size === 0) {
        // null reference
        view.setUint32(refOffset, 0, true);
        view.setUint32(refOffset + 4, 0, true);
      } else {
        // set offset and size
        view.setUint32(refOffset, dataOffset, true);
        view.setUint32(refOffset + 4, obj.size, true);

        // copy object data
        const dataBuf = new Uint8Array(buffer, dataOffset, obj.size);
        dataBuf.set(obj.data);

        dataOffset += obj.size;
      }
    }

    return buffer;
  }

  // Create a new object of given size and add it to objects array
  newObject(size) {
    const data = new Uint8Array(size);
    this.objects.push({ data, size });
    return data;
  }

  // Remove object at index
  removeObject(index) {
    if (index < 0 || index >= this.objects.length) return false;
    this.objects.splice(index, 1);
    return true;
  }

  // Get object count
  get objCount() {
    return this.objects.length;
  }

  // Get object size by index
  objSize(index) {
    if (index < 0 || index >= this.objects.length) return 0;
    return this.objects[index].size;
  }

  // Get object data by index
  objData(index) {
    if (index < 0 || index >= this.objects.length) return null;
    return this.objects[index].data;
  }
}
