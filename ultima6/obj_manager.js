import { Obj } from "./obj.js"

class NPCStatus {
  static ALIGNMENT = {
    NEUTRAL: 0x00,
    EVIL:    0x20,
    GOOD:    0x40,
    CHAOTIC: 0x60,
    MASK:    0x60 // mask for alignment bits
  };

  static BIT = {
    PROTECTED:  0x01,
    PARALYZED:  0x02,
    ASLEEP:     0x04,
    POISONED:   0x08,
    DEAD:       0x10,
    PLRCONTROL: 0x80
  };

  constructor(status = 0) {
    this.value = status;
  }

  // ===== Alignment =====
  getAlignment() {
    return this.value & NPCStatus.ALIGNMENT.MASK;
  }
  setAlignment(v) {
    this.value = (this.value & ~NPCStatus.ALIGNMENT.MASK) | (v & NPCStatus.ALIGNMENT.MASK);
  }
  isATKPLR() {
    return this.getAlignment() & NPCStatus.ALIGNMENT.EVIL;
  }
  isATKMON() {
    return this.getAlignment() & NPCStatus.ALIGNMENT.GOOD;
  }

  // ===== Status checks =====
  isProtected()  { return (this.value & NPCStatus.BIT.PROTECTED) !== 0; }
  isParalyzed()  { return (this.value & NPCStatus.BIT.PARALYZED) !== 0; }
  isAsleep()     { return (this.value & NPCStatus.BIT.ASLEEP) !== 0; }
  isPoisoned()   { return (this.value & NPCStatus.BIT.POISONED) !== 0; }
  isDead()       { return (this.value & NPCStatus.BIT.DEAD) !== 0; }
  isPlrControl() { return (this.value & NPCStatus.BIT.PLRCONTROL) !== 0; }

  // ===== Setters =====
  setProtected()  { this.value |= NPCStatus.BIT.PROTECTED; }
  setParalyzed()  { this.value |= NPCStatus.BIT.PARALYZED; }
  setAsleep()     { this.value |= NPCStatus.BIT.ASLEEP; }
  setPoisoned()   { this.value |= NPCStatus.BIT.POISONED; }
  setDead()       { this.value |= NPCStatus.BIT.DEAD; }
  setPlrControl() { this.value |= NPCStatus.BIT.PLRCONTROL; }

  // ===== Clearers =====
  clrProtected()  { this.value &= ~NPCStatus.BIT.PROTECTED; }
  clrParalyzed()  { this.value &= ~NPCStatus.BIT.PARALYZED; }
  clrAsleep()     { this.value &= ~NPCStatus.BIT.ASLEEP; }
  clrPoisoned()   { this.value &= ~NPCStatus.BIT.POISONED; }
  clrDead()       { this.value &= ~NPCStatus.BIT.DEAD; }
  clrPlrControl() { this.value &= ~NPCStatus.BIT.PLRCONTROL; }
}

class NPCFlag {
  constructor(flag = 0) {
    this.value = flag; // stores the bitfield
  }

  // === Direction (bits 0–2) ===
  getDirection() {
    return this.value & 0x07; // same as & 7
  }
  setDirection(v) {
    this.value = (this.value & ~0x07) | (v & 0x07);
  }

  // === BKAlignment (bits 5–6) ===
  getBKAlignment() {
    return this.value & 0x60; // same as & 0x60
  }
  setBKAlignment(v) {
    this.value = (this.value & ~0x60) | (v & 0x60);
  }

  // === Single-bit flags ===
  isSkipSomeTest()  { return (this.value & 0x08) !== 0; }
  isDraggedUnder()  { return (this.value & 0x10) !== 0; }
  isWalking()       { return (this.value & 0x80) !== 0; }

  setSkipSomeTest() { this.value |= 0x08; }
  setDraggedUnder() { this.value |= 0x10; }
  setWalking()      { this.value |= 0x80; }

  clrSkipSomeTest() { this.value &= ~0x08; }
  clrDraggedUnder() { this.value &= ~0x10; }
  clrWalking()      { this.value &= ~0x80; }
}

class TileFlag {
  constructor(id = 0, flags1 = 0, flags2 = 0, flags3 = 0) {
    this.id = id;
    this.flags1 = flags1;
    this.flags2 = flags2;
    this.flags3 = flags3;
  }

  isWater() { return (this.flags1 & 0x01) !== 0; }
  isPassable() { return (this.flags1 & 0x02) === 0;}
  isTopTile() { return (this.flags2 & 0x10) !== 0; }
  isBoundary() { return (this.flags2 & 0x04) !== 0 || (this.flags2 & 0x08) !== 0; }
  isDoubleHeight() { return (this.flags2 & 0x40) !== 0; }
  isDoubleWidth() { return (this.flags2 & 0x80) !== 0; }
  article() { return (this.flags3 & 0xC0) >> 6; }
  isForceLowerTile() { return (this.flags3 & 0x04) !== 0; } // something like a boat, a carrier...
}


export const ObjManager = {
  surfaceObjs: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => [])),
  dungeonObjs: Array.from({ length: 5 }, () => []),
  actors: [], // 已由 loadObjlist 填入
  partyMembers: [],
  objToTile: null,
  tileFlags: [], // 已由 loadTileFlag 填入

  // a placeholder for tile info
  get_info(obj_number, obj_frame) {
    const tileIndex = this.objToTile[obj_number] + obj_frame;
    return {
      name: `tile_${obj_number}_${obj_frame}`,
      tileIndex: tileIndex,
      info: this.tileFlags[tileIndex] || null };
  },

  init(fileMap) {
    this.loadBaseTile(fileMap);
    this.loadTileFlag(fileMap);
    this.loadObjlist(fileMap);
    this.loadObjblk(fileMap);
  },

  loadObjlist(fileMap) {
    const data = fileMap.get("objlist");
    const view = new DataView(data.buffer);
    const decoder = new TextDecoder("ascii");

    this.actors = Array(256).fill(0).map((_, i) => ({
      id: i,
      name: "(undefined)",
      obj_list:[],
    }));

    let p = 0;

    // --- ObjStatus 0x0000 ~ 0x0100 ---
    // used by U6 engine, not used here
    p += 256;

    // --- Position: x, y, z 0x0100 ~ 0x0400 ---
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

    // --- Obj number and frame 0x0400 ~ 0x0600 ---
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

    // --- Amount 0x0600 ~ 0x0800 ---
    // used by U6 engine, not used here
    console.assert(p === 0x0600);
    p += 512;

    // --- NPCStatus 0x0800 ~ 0x0900 ---
    console.assert(p === 0x0800);
    for (let i = 0; i < 256; i++) {
      this.actors[i].npcStatus = new NPCStatus(view.getUint8(p++));
    }

    // --- Strength 0x0900 ~ 0x0a00 ---
    console.assert(p === 0x0900);
    for (let i = 0; i < 256; i++) {
      this.actors[i].strength = view.getUint8(p++);
    }

    // --- Dexterity 0x0a00 ~ 0x0b00 ---
    console.assert(p === 0x0a00);
    for (let i = 0; i < 256; i++) {
      this.actors[i].dexterity = view.getUint8(p++);
    }

    // --- Intelligence 0x0b00 ~ 0x0c00 ---
    console.assert(p === 0x0b00);
    for (let i = 0; i < 256; i++) {
      this.actors[i].intelligence = view.getUint8(p++);
    }

    // --- Experience (16-bit LE) 0x0c00 ~ 0x0e00 ---
    console.assert(p === 0x0c00);
    for (let i = 0; i < 256; i++) {
      this.actors[i].exp = view.getUint16(p, true);
      p += 2;
    }

    // --- HP 0x0e00 ~ 0x0f00 ---
    console.assert(p === 0xe00);
    for (let i = 0; i < 256; i++) {
      this.actors[i].hp = view.getUint8(p++);
    }

    // --- names 0x0f00 (16 x 14)---
    console.assert(p === 0x0f00);
    function decodeFixedString(data, offset, length) {
      const chunk = data.subarray(offset, offset + length);
      const firstZero = chunk.indexOf(0);
      const nameBytes = firstZero === -1 ? chunk : chunk.subarray(0, firstZero);
      const name = decoder.decode(nameBytes);
      return name;
    }
    const memberNamesInParty = [];
    for (let i = 0; i < 16; i++) {
      const name = decodeFixedString(data, p, 14);
      memberNamesInParty[i] = name;
      p += 14;
    }

    // --- party 0x0fe0 ~ 0x0ff0 ---
    console.assert(p === 0x0fe0);
    const membersInParty = [];
    for (let i = 0; i < 16; i++) {
      membersInParty[i] = view.getUint8(p++);
    }

    // --- party size 0x0ff0 ---
    const partySize = view.getUint8(p++);

    // --- Level 0x0ff1 ~ 0x10f1 ---
    console.assert(p === 0x0ff1);
    for (let i = 0; i < 256; i++) {
      this.actors[i].level = view.getUint8(p++);
    }

    // --- schedule index 0x10f1 ~ 0x11f1 ---
    for (let i = 0; i < 256; i++) {
      this.actors[i].schedule = view.getUint8(p++);
    }

    // --- NPC mode 0x11f1 ~ 0x12f1 ---
    for (let i = 0; i < 256; i++) {
      this.actors[i].npcMode = view.getUint8(p++);
    }

    // -- NPC combat mode 0x12f1 ~ 0x13f1 ---
    for (let i = 0; i < 256; i++) {
      this.actors[i].npcComMode = view.getUint8(p++);
    }

    // --- MP 0x13f1 ~ 0x14f1 ---
    console.assert( p === 0x13f1);
    for (let i = 0; i < 256; i++) {
      this.actors[i].mp = view.getUint8(p++);
    }

    // --- Move Points 0x14f1 ~ 0x15f1 ---
    console.assert( p === 0x14f1);
    for (let i = 0; i < 256; i++) {
      this.actors[i].movePts = view.getUint8(p++);
    }

    // --- Original Shape Type 0x15f1 ~ 0x17f1 ---
    // used by U6 engine, not used here
    console.assert( p === 0x15f1);
    p += 512;

    // --- Talk Flags 0x17f1 ~ 0x18f1 ---
    console.assert( p === 0x17f1);
    for (let i = 0; i < 256; i++) {
      this.actors[i].talkFlags = view.getUint8(p++);
    }

    // --- Leader 0x18f1 ~ 0x19f1 ---
    console.assert( p === 0x18f1);
    for (let i = 0; i < 256; i++) {
      this.actors[i].leader = view.getUint8(p++);
    }

    // --- NPC flag 0x19f1 ~ 0x1af1 ---
    console.assert( p === 0x19f1);
    for (let i = 0; i < 256; i++) {
      this.actors[i].npcFlag = new NPCFlag(view.getUint8(p++));
    }

    // --- something related to path findings 0x1af1 ~ 0x1bf1 from D_8C42 ---
    p += 256;

    // --- miscellaneous 0x1bf1 ~ ... from obj_2C4A to D_2CCC ---
    console.assert( p === 0x1bf1);
    function getByte(u6offset) {
      return view.getUint8(p + (u6offset - 0x2c4a));
    }
    this.IsOnQuest = getByte(0x2c4a);
    this.NextSleep = getByte(0x2c4b);
    this.Time_M = getByte(0x2c4c);
    this.Time_H = getByte(0x2c4d);
    this.Date_D = getByte(0x2c4e);
    this.Date_M = getByte(0x2c4f);
    this.Date_Y = getByte(0x2c50);
    this.KARMA = getByte(0x2c52);
    this.avatarSex = getByte(0x2cca);
    p += (0x2ccc - 0x2c4a);

    console.log("objlist file read offset:", p);

    // --- Party members ---
    this.partyMembers.length = 0;

    for (let i = 0; i < partySize; i++) {
      const actorIdx = membersInParty[i];
      this.actors[actorIdx].name = memberNamesInParty[i];
      this.partyMembers[i] = this.actors[actorIdx];
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
      const obj = new Obj(buffer, offset);
      offset += 8;

      obj.tile_info = this.get_info(obj.obj_number, obj.obj_frame);

      if (obj.inContainer) {
        const containerIdx = obj.container;
        const containerObj = objRefs[containerIdx];
        if (!containerObj) {
          console.warn(`Missing container object at index ${containerIdx}`);
          continue;
        }
        if (!containerObj.obj_list) containerObj.obj_list = [];
        containerObj.obj_list.push(obj);
        objRefs[i] = containerObj.obj_list[containerObj.obj_list.length - 1];
      } else if (obj.inInventory) {
        const owner = obj.owner;
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

  loadBaseTile(fileMap) {
    const data = fileMap.get("basetile");
    this.objToTile = new Uint16Array(data.buffer);
  },

  loadTileFlag(fileMap) {
    const data = fileMap.get("tileflag");
    for (let i = 0; i < 2048; i++) {
      const flags1 = data[i];
      const flags2 = data[2048 + i];
      const flags3 = data[0x1400 + i];
      const tile = new TileFlag(i, flags1, flags2, flags3);
      this.tileFlags.push(tile);
    }
  },
};
