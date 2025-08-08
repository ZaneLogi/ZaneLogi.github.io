// Handle U6 lib32 file format
export class Library {
  constructor(arrayBuffer) {
    this.arrayBuffer = arrayBuffer;
    const dataView = new DataView(this.arrayBuffer);

    let item_count = 0;
    let first_valid_item_offset = 0;
    // read the first item whose offset is not 0
    for (let i = 0; i < arrayBuffer.byteLength; i += 4) {
      const itemOffset = dataView.getUint32(i, true);
      if (itemOffset !== 0) {
        first_valid_item_offset = itemOffset;
        break;
      }
    }
    console.assert(first_valid_item_offset !== 0);
    this.itemCount = Math.floor(first_valid_item_offset / 4);
  }

  getItem(index) {
    if (index < 0 || index >= this.itemCount) {
      return null;
    }

    const dataView = new DataView(this.arrayBuffer);
    const itemOffset = dataView.getUint32(index * 4, true);
    if (itemOffset === 0) {
      return null;
    }

    let itemSize = 0;
    for (let i = index + 1, offset = i * 4; i < this.itemCount; i++, offset += 4) {
      const nextOffset = dataView.getUint32(offset, true);
      if (nextOffset !== 0) {
        itemSize = nextOffset - itemOffset;
        break;
      }
    }
    if (index + 1 == this.itemCount) {
      itemSize = this.arrayBuffer.byteLength - itemOffset;
    }
    console.assert(itemSize !== 0);

    return new Uint8Array(this.arrayBuffer, itemOffset, itemSize);
  }


}