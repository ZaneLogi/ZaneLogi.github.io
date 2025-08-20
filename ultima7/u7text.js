import { FlexFile } from "./flexfile.js";

export class U7Text {
  constructor() {
    this.textDecoder = new TextDecoder();
  }

  load(uint8) {
    this.textFile = new FlexFile();
    this.textFile.open(uint8);
  }

  getObjName(shapeType, shapeFrame) {
    if (shapeFrame < 0) {
      return this.textDecoder.decode(this.textFile.objData(shapeType));
    }

    switch (shapeType) // some special cases
    {
      case 0x34a: // reagents
        return this.textDecoder.decode(this.textFile.objData(0x500 + shapeFrame));
      case 0x3bb: // amulets
        if (shapeFrame < 3)
          return this.textDecoder.decode(this.textFile.objData(0x508 + shapeFrame));
        else
          return this.textDecoder.decode(this.textFile.objData(shapeType));
      case 0x179: // food items
        return this.textDecoder.decode(this.textFile.objData(0x50b + shapeFrame));
      case 0x28a: // sextants
        return this.textDecoder.decode(this.textFile.objData(0x52c - shapeFrame));
      case 0x2a3:  // desk items
        return this.textDecoder.decode(this.textFile.objData(0x52d + shapeFrame));
      case 0x390: // "blood"
        if (shapeFrame < 4)
          return this.textDecoder.decode(this.textFile.objData(0x390));
        else
          return "?";
      default:
        return this.textDecoder.decode(this.textFile.objData(shapeType));
    }
  }
}
