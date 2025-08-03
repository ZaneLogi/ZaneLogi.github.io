const OBJ_STATUS_OK_TO_TAKE    = 0x01;
const OBJ_STATUS_SEEN_EGG      = 0x02;
const OBJ_STATUS_IN_CONTAINER  = 0x08;
const OBJ_STATUS_IN_INVENTORY  = 0x10;
const OBJ_STATUS_TEMPORARY     = 0x20;
const OBJ_STATUS_EGG_ACTIVE    = 0x40;

const OBJ_STATUS_READIED = OBJ_STATUS_IN_CONTAINER | OBJ_STATUS_IN_INVENTORY;

class Obj {
  constructor(info = {}) {
    this.status = info.status ?? 0;
    this.x = info.x ?? 0;
    this.y = info.y ?? 0;
    this.z = info.z ?? 0;

    this.obj_number = info.obj_number ?? 0;
    this.obj_frame = info.obj_frame ?? 0;

    this.quantity = info.quantity ?? 0;
    this.quality = info.quality ?? 0;

    this.tile_info = null;
    this.obj_list = [];
  }

  equals(other) {
    return this.x === other.x &&
           this.y === other.y &&
           this.z === other.z &&
           this.obj_number === other.obj_number &&
           this.quantity === other.quantity &&
           this.quality === other.quality; // <-- 注意這裡應該是 this.quality === other.quality
  }

  in_container() {
    // ((status & 0x18) === 0x08)
    return (this.status & OBJ_STATUS_READIED) === OBJ_STATUS_IN_CONTAINER;
  }

  container() {
    return this.x | ((this.y & 0x3) << 10);
  }

  in_inventory() {
    return (this.status & OBJ_STATUS_IN_INVENTORY) !== 0;
  }

  owner() {
    return this.x;
  }

  is_readied() {
    return (this.status & OBJ_STATUS_READIED) === OBJ_STATUS_READIED;
  }

  type() {
    return 'OBJ'; // JS 無 enum 類型，直接用字串或定義常數
  }
}

export const ObjManager = {
  surfaceObjs: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => [])),
  dungeonObjs: Array.from({ length: 5 }, () => []),
  actors: [], // 已由 loadObjlist 填入
  partyMembers: [],

  // a placeholder for tile info
  get_info(obj_number, obj_frame) {
    return { name: `tile_${obj_number}_${obj_frame}` };
  },

  init(fileMap) {
    this.loadObjlist(fileMap);
    this.loadObjblk(fileMap);
  },

  loadObjlist(fileMap) {
    const data = fileMap.get("objlist");
    const view = new DataView(data.buffer);
    const decoder = new TextDecoder("ascii");

    this.actors = Array(256).fill(0).map((_, i) => ({
      id: i,
      obj_list:[],
    }));

    let p = 0x100;

    // --- Position: x, y, z ---
    for (let i = 0; i < 256; i++) {
      const b1 = view.getUint8(p++);
      const b2 = view.getUint8(p++);
      const b3 = view.getUint8(p++);

      const x = ((b2 & 0x03) << 8) | b1;
      const y = ((b3 & 0x0F) << 6) | ((b2 & 0xFC) >> 2);
      const z = (b3 & 0xF0) >> 4;

      const actor = this.actors[i];
      actor.x = x;
      actor.y = y;
      actor.z = z;
    }

    // --- Obj number and frame ---
    for (let i = 0; i < 256; i++) {
      const b1 = view.getUint8(p++);
      const b2 = view.getUint8(p++);
      const obj_number = ((b2 & 0x03) << 8) | b1;
      const obj_frame = (b2 & 0xFC) >> 2;

      const actor = this.actors[i];
      actor.obj_number = obj_number;
      actor.obj_frame = obj_frame;
      actor.tile_info = this.get_info(obj_number, obj_frame);
    }

    // --- Strength ---
    p = 0x900;
    for (let i = 0; i < 256; i++) {
      this.actors[i].strength = view.getUint8(p++);
    }

    // --- Dexterity ---
    p = 0xa00;
    for (let i = 0; i < 256; i++) {
      this.actors[i].dexterity = view.getUint8(p++);
    }

    // --- Intelligence ---
    p = 0xb00;
    for (let i = 0; i < 256; i++) {
      this.actors[i].intelligence = view.getUint8(p++);
    }

    // --- Experience (16-bit LE) ---
    p = 0xc00;
    for (let i = 0; i < 256; i++) {
      this.actors[i].exp = view.getUint16(p, true);
      p += 2;
    }

    // --- HP ---
    p = 0xe00;
    for (let i = 0; i < 256; i++) {
      this.actors[i].hp = view.getUint8(p++);
    }

    // --- Level ---
    p = 0xff1;
    for (let i = 0; i < 256; i++) {
      this.actors[i].level = view.getUint8(p++);
    }

    // --- MP ---
    p = 0x13f1;
    for (let i = 0; i < 256; i++) {
      this.actors[i].mp = view.getUint8(p++);
    }

    // --- Flags ---
    p = 0x17f1;
    for (let i = 0; i < 256; i++) {
      this.actors[i].flags = view.getUint8(p++);
    }

    // --- Party members ---
    const partyCount = view.getUint8(0xff0);
    const nameBase = 0xf00;
    const indexBase = 0xfe0;

    this.partyMembers = [];

    for (let i = 0; i < partyCount; i++) {
      const actorIdx = view.getUint8(indexBase + i);
      const nameBytes = new Uint8Array(data.buffer, nameBase + i * 14, 14);
      const name = decoder.decode(nameBytes).replace(/\0+$/, "");
      this.actors[actorIdx].name = name;
      this.partyMembers.push(this.actors[actorIdx]);
    }
  },

  loadObjblk(fileMap) {
    // Load 8x8 surface blocks (OBJBLKAA - OBJBLKHH)
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const filename = `OBJBLK${String.fromCharCode(65 + col)}${String.fromCharCode(65 + row)}`;
        const data = fileMap.get(filename.toLowerCase());
        if (!data) {
          throw new Error(`Missing surface objblk file: ${filename}`);
        }
        const objList = [];
        this.loadSuperchunk(data.buffer, objList);
        this.surfaceObjs[row][col] = objList;
      }
    }

    // Load 5 dungeon blocks (OBJBLKAI - OBJBLKEI)
    for (let d = 0; d < 5; d++) {
      const filename = `OBJBLK${String.fromCharCode(65 + d)}I`;
      const data = fileMap.get(filename.toLowerCase());
      if (!data) {
        throw new Error(`Missing dungeon objblk file: ${filename}`);
      }
      const objList = [];
      this.loadSuperchunk(data.buffer, objList);
      this.dungeonObjs[d] = objList;
    }
  },

  loadSuperchunk(buffer, objList) {
    const view = new DataView(buffer);
    let offset = 0;

    const objCount = view.getUint8(offset) | (view.getUint8(offset + 1) << 8);
    offset += 2;

    const objRefs = new Array(objCount);
    const decoder = new TextDecoder("ascii");

    for (let i = 0; i < objCount; i++) {
      const info = this.parseFileObjInfo(view, offset);
      offset += 8;

      const obj = new Obj(info);
      obj.tile_info = this.get_info(obj.obj_number, obj.obj_frame);

      if (obj.in_container()) {
        const containerIdx = obj.container();
        const containerObj = objRefs[containerIdx];
        if (!containerObj) {
          console.warn(`Missing container object at index ${containerIdx}`);
          continue;
        }
        containerObj.obj_list.push(obj);
        objRefs[i] = containerObj.obj_list[containerObj.obj_list.length - 1];
      } else if (obj.in_inventory()) {
        const owner = obj.owner();
        if (!this.actors[owner]) {
          console.warn(`Invalid owner index ${owner} for obj #${i}`, obj);
          continue;
        }
        this.actors[owner].obj_list.push(obj);
        objRefs[i] = this.actors[owner].obj_list[this.actors[owner].obj_list.length - 1];
      } else {
        objList.push(obj);
        objRefs[i] = objList[objList.length - 1];
      }
    }
  },

  parseFileObjInfo(view, offset) {
    const low = view.getUint32(offset, true);
    const high = view.getUint32(offset + 4, true);

    return {
      status:     (low >> 0)  & 0xFF,
      x:          (low >> 8)  & 0x3FF,
      y:          (low >> 18) & 0x3FF,
      z:          (low >> 28) & 0xF,
      obj_number: (high >> 0)  & 0x3FF,
      obj_frame:  (high >> 10) & 0x3F,
      quantity:   (high >> 16) & 0xFF,
      quality:    (high >> 24) & 0xFF
    };
  },
};
