import { U6OP } from "./u6opcode.js";

import { ObjManager } from "./obj_manager.js";
import { Obj } from "./obj.js";

function hexString(value, width) {
  return value.toString(16).toUpperCase().padStart(width, '0');
}

function containsKeyword(input, keywords) {
  // Split keywords by comma, trim spaces, remove empty strings
  const keywordList = keywords.split(',')
    .map(k => k.trim())
    .filter(k => k.length > 0);

  // Make input lowercase for case-insensitive match
  const lowerInput = input.toLowerCase();

  // Return true if any keyword is found in the input
  return keywordList.some(keyword => lowerInput.includes(keyword.toLowerCase()));
}

function assert(condition, message, result) {
  if (!condition) {
    if (result) {
      console.log(result.join(''));
    }
    throw new Error(message || "Assertion failed");
  }
}

function MaxHP(actor) {
	let value = actor.level * 30;
  if (value <= 0) value = 1;
  if (value > 255) value = 255;
  return value;
}

function TALK_initTalk(info, partyId, objNum) {
  const party = ObjManager.partyMembers
  const actor = party[partyId];
  const npc = ObjManager.actors[objNum];

  const VarStr = info.VarStr;
  VarStr['G'.charCodeAt(0) - 0x37] = ObjManager.avatarSex ? "milady" : "milord";
  VarStr['N'.charCodeAt(0) - 0x37] = npc?.name ?? "unknown_NPC_name";
  VarStr['P'.charCodeAt(0) - 0x37] = actor.name;

  const TIME_H = ObjManager.TIME_H;
  VarStr['T'.charCodeAt(0) - 0x37] = (TIME_H < 12)?"morning":(TIME_H < 18)?"afternoon":"evening";

  // VarInt
  const VarInt = info.VarInt;
  VarInt['A'.charCodeAt(0) - 0x37] = actor.dexterity;
  VarInt['D'.charCodeAt(0) - 0x37] = ObjManager.Date_D;
  VarInt['E'.charCodeAt(0) - 0x37] = actor.exp;
  VarInt['H'.charCodeAt(0) - 0x37] = ObjManager.Time_H;
  VarInt['I'.charCodeAt(0) - 0x37] = actor.intelligence;
  VarInt['K'.charCodeAt(0) - 0x37] = ObjManager.KARMA;
  VarInt['M'.charCodeAt(0) - 0x37] = ObjManager.Date_M;
  VarInt['N'.charCodeAt(0) - 0x37] = party.length - 1;
  VarInt['P'.charCodeAt(0) - 0x37] = actor.hp;
  VarInt['S'.charCodeAt(0) - 0x37] = actor.strength;
  VarInt['W'.charCodeAt(0) - 0x37] = npc.npcMode; // npc's [w]orktype
  VarInt['Y'.charCodeAt(0) - 0x37] = ObjManager.Date_Y;
}

export class ScriptInterpreter {
  static END = 0;
  static INPUT = 1;
  static PAUSE = 2;
  static INPUTNUM = 3;

  constructor(data, partyId, talkTo) {
    this.data = data;
    this.textDecoder = new TextDecoder('ascii');
    this.context = {
      current: 0, start: 0, end: data.length,
      VarInt: new Array(10+26).fill(0),
      VarStr: new Array(10+26).fill(''),
    };
    TALK_initTalk(this.context, partyId, talkTo);
  }

  asciiString(offset, length) {
    return this.textDecoder.decode(this.data.subarray(offset, offset + length));
  }

  run(input, output) {
    output.length = 0;
    const info = this.context;
    if (info.current >= info.end) {
      return ScriptInterpreter.END; 
    }

    while (info.current < info.end) {
      const code = this.data[info.current++];
      if (code < 0x80) {
        // printable
        --info.current;
        let text = this.getString(info);
        // replace with the system strings
        const sg = info.VarStr['G'.charCodeAt(0) - 0x37];
        const sn = info.VarStr['N'.charCodeAt(0) - 0x37];
        const sp = info.VarStr['P'.charCodeAt(0) - 0x37];
        const st = info.VarStr['T'.charCodeAt(0) - 0x37];
        const sy = info.VarStr['Y'.charCodeAt(0) - 0x37];
        text = text.replace(/\$G/g, sg);
        text = text.replace(/\$N/g, sn);
        text = text.replace(/\$P/g, sp);
        text = text.replace(/\$T/g, st);
        text = text.replace(/\$Y/g, sy);

        // replace with the system integers
        text = text.replace(/#(\d+)/g, (fullMatch, num) => {
          const n = parseInt(num, 10);
          return info.VarInt[n].toString() || fullMatch;
          // replace if found, else keep original
        });

        output.push(text);
        if (text.charAt(text.length - 1) === "*") {
          return ScriptInterpreter.PAUSE;
        }
      }
      else if (code === U6OP.ID) {
        info.npcId = this.data[info.current++];
        info.npcName = this.getString(info);
      }
      else if (code === U6OP.LOOK) {
        output.push(this.getString(info));
        return ScriptInterpreter.PAUSE;
      }
      else if (code === U6OP.CONVERSE || code === U6OP.PREFIX) {
        // START CONVERSION
      }
      else if (code === U6OP.ASK) {
        return ScriptInterpreter.INPUT;
      }
      else if (code === U6OP.ASKC) {
        const candidates = this.getString(info);
        assert(this.data[info.current] === U6OP.KEYWORDS);
        output.push('(');
        output.push(candidates);
        output.push(')');
        return ScriptInterpreter.INPUT;
      }
      else if (code === U6OP.GETINT || code === U6OP.GETDIGIT) {
        // first time here or the input is not an integer
        if (!info.checkInputNumber || ! /^-?\d+$/.test(input)) {
          // let the script run from this opcode next time
          info.current--;
          info.checkInputNumber = true;
          return ScriptInterpreter.INPUTNUM;
        }

        info.checkInputNumber = false;

        const num = parseInt(input, 10);
 
        const varIndex = this.data[info.current]
        const varType = this.data[info.current+1];
        info.current += 2;
        assert(varType === U6OP.VAR, "expect the integer type");
        info.VarInt[varIndex] = num;
      }
      else if (code === U6OP.KEYWORDS) {
        const keywords = this.getString(info);
        assert(this.data[info.current] === U6OP.ANSWER);
        info.current++;
        if (!containsKeyword(input, keywords)) {
          this.skipCodeBlock(info, U6OP.ANSWER);
          assert(this.data[info.current] === U6OP.KEYWORDS ||
            this.data[info.current] === U6OP.ENDANSWER,
            `offset: 0x${hexString(info.current,4)}`
          );
        }
      }
      else if (code === U6OP.ENDANSWER) {
        // an answer could be ended by a JUMP, a BYE or a ENDANSWER
      }
      else if (code === U6OP.IF) {
        const result = this.evaluate(info);
        if (!result) {
          // condition 'false'
          this.skipCodeBlock(info, U6OP.IF);
          assert(this.data[info.current-1] === U6OP.ELSE ||
            this.data[info.current-1] === U6OP.ENDIF);
          // skip the potion of condition 'true'
          // then the potion of 'else' starts running,
          // or 'endif' if no 'else'
        } else {
          // from now on, the potion of 'if true' starts running until ELSE or ENDIF
        }
      }
      else if (code === U6OP.ELSE) {
        // shall skip the potion of ELSE
        // as this is from the condition 'true'
        this.skipCodeBlock(info, U6OP.ELSE);
      }
      else if (code === U6OP.ENDIF) {
      }
      else if (code === U6OP.SETF) {
        let npc = this.evaluate(info);
        npc = (npc != 0xeb ? npc : info.npcId);
        const actor = ObjManager.actors[npc];
        const flagIndex = this.evaluate(info);
        actor.talkFlags |= (1 << flagIndex);
      }
      else if (code === U6OP.CLEARF) {
        let npc = this.evaluate(info);
        npc = (npc != 0xeb ? npc : info.npcId);
        const actor = ObjManager.actors[npc];
        const flagIndex = this.evaluate(info);
        actor.talkFlags &= ~(1 << flagIndex);
      }
      else if (code === U6OP.DECL) {
        const index = this.data[info.current++];
        const type = this.data[info.current++];
        const next_op = this.data[info.current++];
        assert(next_op === U6OP.ASSIGN);
        const result = this.evaluate(info);
        if (type === U6OP.VAR) {
          info.VarInt[index] = result;
        }
        else if (type === U6OP.SVAR) {
          // TODO
          assert(false);
          info.VarStr[index] = "";
        }
        else {
          assert(false, `unknown var type 0x${hexString(type,2)}`);
        }
      }
      else if (code === U6OP.ASSIGN) {
        assert(false, "Shall not be here as handled by U6OP.DECL!!!");
      }
      else if (code === U6OP.JUMP) {
        const value = new DataView(this.data.buffer, info.current, 4).getUint32(0, true);
        info.current = info.start + value;
      }
      else if (code === U6OP.BYE) {
        info.current = info.end;
        return ScriptInterpreter.END;
      }
      else if (code === U6OP.NEW) {
        let npc = this.evaluate(info);
        const objType = this.evaluate(info);
        const qual = this.evaluate(info);
        const quant = this.evaluate(info);
        npc = (npc != 0xeb ? npc : info.npcId);
        const actor = ObjManager.actors[npc];
        const obj = new Obj({
          status:0, x:0, y:0, z:0,
          obj_number:objType, obj_frame:0,
          quantity:quant, qualigy:qual
        });
        actor.obj_list.push(obj);
      }
      else if (code === U6OP.DELETE) {
        let npc = this.evaluate(info);
        const obj = this.evaluate(info);
        const qual = this.evaluate(info);
        const quant = this.evaluate(info);
        npc = (npc != 0xeb ? npc : info.npcId);
        // remove item from npc
      }
      else if (code === U6OP.SHOWINVENTORY) {
        const inventoryNum = this.evaluate(info);
        output.push(`SHOW INVENTORY ${inventoryNum}\r\n`);
      }
      else if (code === U6OP.PORTRAIT) {
        const portraitNum = this.evaluate(info);
        output.push(`SHOW PORTRAIT ${portraitNum}\r\n`);
      }
      else if (code === U6OP.PAUSE) {
        output.push("*");
        return ScriptInterpreter.PAUSE;
      }
      else if (code === U6OP.WORKTYPE) {
        let npc = this.evaluate(info);
        npc = (npc != 0xeb ? npc : info.npcId);
        const worktype = this.evaluate(info);
        const actor = ObjManager.actors[npc];
        actor.npcMode = worktype;
      }
      else if (code === U6OP.SETNAME) {
        let npc = this.evaluate(info);
        npc = (npc != 0xeb ? npc : info.npcId);
        const actor = ObjManager.actors[npc];
        info.VarStr['Y'.charCodeAt(0) - 0x37] = actor.name;
      }
      else if (code === U6OP.HEAL) {
        let npc = this.evaluate(info);
        npc = (npc != 0xeb ? npc : info.npcId);
        const actor = ObjManager.actors[npc];
        actor.hp = MaxHP(actor);
      }
      else if (code === U6OP.CURE) {
        let npc = this.evaluate(info);
        npc = (npc != 0xeb ? npc : info.npcId);
        const actor = ObjManager.actors[npc];
        actor.npcStatus.clrPoisoned();
      }
      else if (code === U6OP.GETHORSE) {
        let npc = this.evaluate(info);
        npc = (npc != 0xeb ? npc : info.npcId);
        const actor = ObjManager.actors[npc];
        actor.obj_number = 0x1af;
      }
      else {
        assert(false,
          `unknown opcode 0x${hexString(code,2)}, offset 0x${hexString(info.current-1,4)}`);
      }
    }

    return ScriptInterpreter.END;
  }

  getString(info) {
    const anchor = info.current;
    while (info.current < info.end) {
      const code = this.data[info.current];
      if (code >= 0x80)
        break;
      info.current++;
      if (code === 0x2a) // '*'
        break;
    }
    return this.asciiString(anchor, info.current-anchor);
  }

  evaluate(info) {
    const stack = [];
    while (info.current < info.end) {
      const code = this.data[info.current++];
      if (code === U6OP.NUM8) {
        stack.push(this.data[info.current++]);
      }
      else if (code === U6OP.NUM32) {
        const int32 = new DataView(this.data.buffer, info.current, 4).getInt32(0, true);
        stack.push(int32);
        info.current += 4;
      }
      else if (code === U6OP.NUM16) {
        const int16 = new DataView(this.data.buffer, info.current, 2).getInt16(0, true);
        stack.push(int16);
        info.current += 2;
      }
      else if (code === U6OP.VAR) {
        const arg1 = stack.pop();
        stack.push(info.VarInt[arg1]);
      }
      else if (code === U6OP.SVAR) {
        const arg1 = stack.pop();
        stack.push(info.VarStr[arg1]);
        // TODO
        assert(false);
      }
      else if (code === U6OP.DATA) {
        const integerVariable = stack.pop();
        const arrayIndex = stack.pop();
        const offset = (arrayIndex << 1) + integerVariable;
        const s16 = new DataView(this.data.buffer, offset, 2).getInt16(0, true);
        stack.push(s16);
        assert(false);
      }
      else if (code === U6OP.EVAL) {
        assert(stack.length === 1);
        return stack.pop();
      }
      else if (code === U6OP.GT) {
        const arg2 = stack.pop();
        const arg1 = stack.pop();
        stack.push(arg1 > arg2 ? 1 : 0);
      }
      else if (code === U6OP.GE) {
        const arg2 = stack.pop();
        const arg1 = stack.pop();
        stack.push(arg1 >= arg2 ? 1 : 0);
      }
      else if (code === U6OP.LT) {
        const arg2 = stack.pop();
        const arg1 = stack.pop();
        stack.push(arg1 < arg2 ? 1 : 0);
      }
      else if (code === U6OP.LE){
        const arg2 = stack.pop();
        const arg1 = stack.pop();
        stack.push(arg1 <= arg2 ? 1 : 0);
      }
      else if (code === U6OP.NE) {
        const arg2 = stack.pop();
        const arg1 = stack.pop();
        stack.push(arg1 !== arg2 ? 1 : 0);
      }
      else if (code === U6OP.EQ) {
        const arg2 = stack.pop();
        const arg1 = stack.pop();
        stack.push(arg1 === arg2 ? 1 : 0);
      }
      else if (code === U6OP.ADD) {
        const arg2 = stack.pop();
        const arg1 = stack.pop();
        stack.push(arg1 + arg2);
      }
      else if (code === U6OP.SUB) {
        const arg2 = stack.pop();
        const arg1 = stack.pop();
        stack.push(arg1 - arg2);
      }
      else if (code === U6OP.MUL) {
        const arg2 = stack.pop();
        const arg1 = stack.pop();
        stack.push(arg1 * arg2);
      }
      else if (code === U6OP.DIV) {
        const arg2 = stack.pop();
        const arg1 = stack.pop();
        stack.push(arg1 / arg2);
      }
      else if (code === U6OP.LOR) {
        const arg2 = stack.pop();
        const arg1 = stack.pop();
        stack.push(arg1 | arg2 ? 1 : 0);
      }
      else if (code === U6OP.LAND) {
        const arg2 = stack.pop();
        const arg1 = stack.pop();
        stack.push(arg1 & arg2 ? 1 : 0);
      }
      else if (code === U6OP.CANCARRY) {
        let npc = stack.pop();
        npc = (npc != 0xeb ? npc : info.npcId);
        const actor = ObjManager.actors[npc];
        stack.push(actor.strength * 200);
      }
      else if (code === U6OP.WEIGHT) {
        const objType = stack.pop();
        const quantity = stack.pop();
        const typeWeight = 10; // fake: todo based on TypeWeight()
        stack.push(typeWeight * quantity);
      }
      else if (code === U6OP.HORSED) {
        let npc = stack.pop();
        npc = (npc != 0xeb ? npc : info.npcId);
        const actor = ObjManager.actors[npc];
        stack.push(actor.obj_number === 0x1af ? 1 : 0);
      }
      else if (code === U6OP.FLAG) {
        const arg2 = stack.pop(); // flag index
        let arg1 = stack.pop(); // npc id
        arg1 = (arg1 != 0xeb ? arg1 : info.npcId);
        const actor = ObjManager.actors[arg1];
        stack.push((actor.talkFlags >> arg2) & 1);
      }
      else if (code === U6OP.INPARTY) {
        const party = ObjManager.partyMembers;
        let arg1 = stack.pop(); // npc id
        arg1 = (arg1 != 0xeb ? arg1 : info.npcId);

        const exists = party.some(obj => obj.id === arg1);
        stack.push(exists ? 1 : 0);
      }
      else if (code === U6OP.OBJINPARTY) {
        const arg2 = stack.pop(); // qual
        const arg1 = stack.pop(); // obj
        stack.push(0); // should push npc id who has this specific object.
        // fake: not in the party
      }
      else if (code === U6OP.JOIN) {
        const party = ObjManager.partyMembers;
        let arg1 = stack.pop(); // npc id
        arg1 = (arg1 != 0xeb ? arg1 : info.npcId);
        // 3: ALREADY IN PARTY
        // 2: PARTY TOO LARGE
        // 1: NOT ON LAND (vehicle)
        // 0: SUCCESS
        const exists = party.some(obj => obj.id === arg1);
        if (exists) {
          stack.push(3);
        }
        else if (party.length >= 16) {
          stack.push(2);
        }
        // todo: handle not on land
        else {
          party.push(ObjManager.actors[arg1]);
          stack.push(0);
        }
      }
      else if (code === U6OP.LEAVE) {
        const party = ObjManager.partyMembers;
        let arg1 = stack.pop(); // npc id
        arg1 = (arg1 != 0xeb ? arg1 : info.npcId);
        // 2: NOT IN PARTY
        // 1: NOT ON LAND
        // 0: SUCCESS
        const index = party.findIndex(obj => obj.id === arg1);
        if (index === -1) {
          stack.push(2);
        }
        // todo: handle not on land
        else {
          party.splice(index, 1);
          stack.push(0);
        }
      }
      else if (code === U6OP.RAND) {
        const arg1 = stack.pop(); // val1
        const arg2 = stack.pop(); // val2
        stack.push(Math.floor(Math.random() * (arg1 - arg2 + 1)) + arg2);
      }
      else if (code === U6OP.NPC) {
        const arg2 = stack.pop(); // unknown usage
        const arg1 = stack.pop(); // index in the party
        const party = ObjManager.partyMembers;
        stack.push(party[arg1].id);
      }
      else if (code === U6OP.WOUNDED) {
        const arg1 = stack.pop(); // npi id
        const actor = ObjManager.actors[arg1];
        stack.push((MaxHP(actor) - actor.hp) > 0 ? 1 : 0);
      }
      else if (code === U6OP.POISONED) {
        const arg1 = stack.pop(); // npc id
        const actor = ObjManager.actors[arg1];
        stack.push(actor.npcStatus.isPoisoned() ? 1 : 0);
      }
      else if (code === U6OP.OWNS) {
        const objQial = stack.pop();
        const objType = stack.pop();
        let actorId = stack.pop();
        actorId = (actorId != 0xeb ? actorId : info.npcId);
        const actor = ObjManager.actors[actorId];
        // check if the actor owns the object
        stack.push(0); // TODO: fake value, implement owns
      }
      else if (code === U6OP.EXP) {
        let actorId = stack.pop();
        const value = stack.pop();
        actorId = (actorId != 0xeb ? actorId : info.npcId);
        const actor = ObjManager.actors[actorId];
        actor.exp += value;
        if (actor.exp > 9999) actor.exp = 9999;
        stack.push(actor.exp);
      }
      else if (code === U6OP.LVL) {
        let actorId = stack.pop();
        const value = stack.pop();
        actorId = (actorId != 0xeb ? actorId : info.npcId);
        const actor = ObjManager.actors[actorId];
        actor.level += value;
        stack.push(actor.level);
      }
      else if (code === U6OP.STR) {
        let actorId = stack.pop();
        const value = stack.pop();
        actorId = (actorId != 0xeb ? actorId : info.npcId);
        const actor = ObjManager.actors[actorId];
        actor.strength += value;
        if (actor.strength > 30) actor.strength = 30;
        stack.push(actor.strength);
      }
      else if (code === U6OP.INT) {
        let actorId = stack.pop();
        const value = stack.pop();
        actorId = (actorId != 0xeb ? actorId : info.npcId);
        const actor = ObjManager.actors[actorId];
        actor.intelligence += value;
        if (actor.intelligence > 30) actor.intelligence = 30;
        stack.push(actor.intelligence);
      }
      else if (code ===  U6OP.DEX) {
        let actorId = stack.pop();
        const value = stack.pop();
        actorId = (actorId != 0xeb ? actorId : info.npcId);
        const actor = ObjManager.actors[actorId];
        actor.dexterity += value;
        if (actor.dexterity > 30) actor.dexterity = 30;
        stack.push(actor.dexterity);
      }
      else {
        assert(code < 0x80,
          `Unknown code 0x${hexString(code,2)}, offset 0x${hexString(info.current,4)}}`
        );
        stack.push(code);
      }
    }
    assert(false, "shall be stopped on the code 0xa7");
    return 0;
  }

  formatScript() {
    const result = [];
    this.collectFormat(result, {current: 0, start: 0, end: this.data.length}, 0);
    return result.join('');
  }

  collectFormat(result, info, blockType) {
    while (info.current < info.end) {
      const script_offset = info.current - info.start;
      result.push(':' + hexString(script_offset,4) + '\r\n');

      const code = this.data[info.current];
      if (code < 0x80) { // printable
        result.push("    {");
        this.collectText(result, info);
        result.push("}\r\n");
      }
      else { // control code
        info.current++;

        switch (code) {
        case U6OP.ID: {// npc id and name
          const m_npc_id = this.data[info.current++];
          const m_npc_name = [];
          this.collectText(m_npc_name, info);
          result.push(`    NPC_ID: npc id: ${m_npc_id}, npc name: ${m_npc_name.join('')}\r\n`);
          break;
        }
        case U6OP.LOOK: {
          result.push("    NPC_LOOK: ");
          this.collectText(result, info);
          result.push("\r\n");
          break;
        }
        case U6OP.CONVERSE: {
          result.push("    START CONVERSION\r\n");
          break;
        }
        case U6OP.PREFIX: {
          result.push("    START PREFIX\r\n");
          break;
        }
        case U6OP.ASK: {
          result.push("    ASK\r\n");
          let forceToEndTheAnswer = false;

          while (info.current < info.end) {
            const script_offset = info.current - info.start;

            // If it's not KEYWORDS, process whatever is before it (nested commands, text, etc.)
            if (this.data[info.current] !== U6OP.KEYWORDS) {
              this.collectFormat(result, info, U6OP.ASK);
            }
            if (info.current >= info.end) {
              // it is possible to reach the end of the script,
              // because no more keywords for ASK but more script need to be parsed.
              // U6 Iolo script
              break;
            }

            // Now we expect KEYWORDS
            assert(this.data[info.current] === U6OP.KEYWORDS,
              `error: offset ${hexString(script_offset,4)}, should be U6OP.KEYWORDS`,
              result
            );
            info.current++; // skip U6OP_KEYWORDS

            // force_to_end_the_answer is used to solve the last answer has no the code U6OP_ENDANSWER
            // but it would be not perfect because it is a guess where is the end of the answer.
            // check how U6OP_IF and U6OP_JUMP handle this situation.

            // Special case: '*' means force end of answer
            if (this.data[info.current] === 0x2A) { // ASCII '*'
              forceToEndTheAnswer = true;
            }

            result.push("    KEYWORDS ");
            this.collectText(result, info);
            result.push("\r\n");

            // Expect ANSWER opcode
            assert(this.data[info.current] === U6OP.ANSWER,
              `error: offset ${script_offset}, should be U6OP.ANSWER`,
              result
            );
            info.current++; // skip U6OP_ANSWER

            result.push("    ANSWER\r\n");
            this.collectFormat(result, info, U6OP.ANSWER);

            // If ENDANSWER reached, or forced, stop
            if (this.data[info.current] === U6OP.ENDANSWER || forceToEndTheAnswer) {
              break;
            }
          }

          // At this point, we should have ENDANSWER unless forced
          if (this.data[info.current] === U6OP.ENDANSWER) {
            info.current++; // skip U6OP_ENDANSWER
            result.push("    END_ANSWER\r\n");
          }
          break;
        }
        case U6OP.KEYWORDS: {
          info.current--;
          assert(blockType === U6OP.ANSWER || blockType === U6OP.ASK, 
            "blockType should be ANSWER or ASK when encountering KEYWORDS",
            result
          );
          return;
        }
        case U6OP.ENDANSWER: {
          info.current--;
          assert(blockType === U6OP.ANSWER, 
            "blockType should be ANSWER when encountering ENDANSWER",
            result
          );
          return;
        }
        case U6OP.ASKC: {
          let anchor = info.current;
          this.skipText(info);
          let possibleAnswerCount = info.current - anchor;
          const answerCandidates = this.asciiString(anchor, info.current - anchor);
          result.push(`    ASKC [${answerCandidates}]\r\n`);

          while (info.current < info.end) {
            assert(this.data[info.current] === U6OP.KEYWORDS,
              "error: expect U6OP.KEYWORDS", result);
            info.current++;

            anchor = info.current;
            this.skipText(info);
            const keywords = this.asciiString(anchor, info.current - anchor);
            result.push(`    KEYWORDS ${keywords}\r\n`);

            assert(this.data[info.current] === U6OP.ANSWER,
              "error: expect U6OP.ANSWER", result);
            possibleAnswerCount--;

            // wildcard, 056_Kunawo
            if (this.data[anchor] === '*'.charCodeAt(0)) {
              possibleAnswerCount = 0;
            }

            info.current++;
            result.push("    ANSWER\r\n");
            this.collectFormat(result, info, U6OP.ANSWER);

            if (this.data[info.current] === U6OP.ENDANSWER) {
              info.current++;
              break;
            }

            // Atlipacta (SE) script offset 0x0aa8 does not have U6OP_ENDANSWER but U6OP_BYE
            if (this.data[info.current] === U6OP.BYE) {
              info.current++;
              break;
            }

            // 035 Katalkotl (SE) script offset 0x10d7 does not have U6OP_ENDANSWER
            if (this.data[info.current] !== U6OP.KEYWORDS && possibleAnswerCount === 0) {
              break;
            }
          }

          if (possibleAnswerCount !== 0) {
            // the one of the cases: Iolo, :0A3F, only has the answer 'n', without 'y'
            // this is allowed
            result.push("===NOT ALL ANSWERS ARE HANDLED===\r\n");
          }
          result.push("    END_ANSWER\r\n");
          break;
        }
        case U6OP.IF: {
          let addr1 = null;
          let addr2 = null;
          let anchor = info.current;
          result.push("    IF ");
          this.collectEval(result, info);
          result.push("\r\n");
          this.collectFormat(result, info, U6OP.IF);

          // If the instruction before current pointer is U6OP_JUMP, record the jump address
          if (this.data[info.current-6] === U6OP.JUMP) {
            addr1 = info.current - 5;
          }

          // Check for ELSE branch
          if (this.data[info.current-1] === U6OP.ELSE) {
            result.push("    ELSE\r\n");
            this.collectFormat(result, info, U6OP.ELSE);
            if (this.data[info.current-6] === U6OP.JUMP) {
              addr2 = info.current - 5;
            }
          }

          assert(this.data[info.current-1] === U6OP.ENDIF, "error", result); // should be end with U6OP_ENDIF
          result.push("    ENDIF\r\n");

          if (addr1 && addr2) {
            const dataView1 = new DataView(this.data.buffer, addr1, 4);
            const dataView2 = new DataView(this.data.buffer, addr2, 4);
            const value1 = dataView1.getUint32(0, true);
            const value2 = dataView2.getUint32(0, true);
            if (value1 === value2 &&
              value1 < (anchor - info.start) && // it should be the jump to the address close to the beginning
              blockType === U6OP.ANSWER) {
              // this is the case that there is no U6OP_ENDANSWER after the last answer '*' in aiela's script
              // if the handling of if-true and if-false jumps to the same address, treat it as the end of the answer
              return;
            }
          }
          break;
        }
        case U6OP.ELSE: {
          // should be from U6OP_IF block, then hit U6OP_ELSE
          assert(blockType === U6OP.IF, "error", result);
          return;
        }
        case U6OP.ENDIF: {
          // should be from U6OP_IF or U6OP_ELSE, then hit U6OP_ENDIF
          assert(blockType === U6OP.IF || blockType === U6OP.ELSE, "error", result);
          return;
        }
        case U6OP.GETINT: {
          const var_index = this.data[info.current];
          const var_type = this.data[info.current+1];
          info.current += 2;
          result.push(`    GETINT (vi=${hexString(var_index,2)}, vt=${hexString(var_type,2)}) `);
          this.collectText(result, info);
          result.push("\r\n");
          break;
        }
        case U6OP.GETDIGIT: {
          const var_index = this.data[info.current]
          const var_type = this.data[info.current+1];
          info.current += 2;
          result.push(`    GETDIGIT (vi=${hexString(var_index,2)}, vt=${hexString(var_type,2)}) `);
          this.collectText(result, info);
          result.push("\r\n");
          break;
        }
        case U6OP.SETF: {
          result.push("    SET_FLAG ");
          this.collectEval(result, info);
          result.push(", ");
          this.collectEval(result, info);
          result.push("\r\n");
          break;
        }
        case U6OP.CLEARF: {
          result.push("    CLEAR_FLAG ");
          this.collectEval(result, info);
          result.push(", ");
          this.collectEval(result, info);
          result.push("\r\n");
          break;
        }
        case U6OP.DECL: {
          const index = this.data[info.current++];
          const type = this.data[info.current++];
          result.push(`    DECLARE [0x${hexString(index,2)}, 0x${hexString(type,2)}] `);
          assert(this.data[info.current] === U6OP.ASSIGN, "error", result);
          info.current++;
          result.push("= ");
          this.collectEval(result, info);
          result.push("\r\n");
          break;
        }
        case U6OP.JUMP: {// jump to
          const dataView = new DataView(this.data.buffer, info.current, 4);
          const address = dataView.getUint32(0, true);
          info.current += 4;
          result.push(`    JUMP 0x${hexString(address,4)}\r\n`);
          if (blockType == U6OP.ANSWER) {
            // this is the case that there is no U6OP_ENDANSWER after the last answer '*' in jimmy's and rafkin's script
            // if the handling of the jump to an address, treat it as the end of the answer
            return;
          }
          break;
        }
        case U6OP.BYE: {
          result.push("    BYE\r\n");

          if (blockType === U6OP.ANSWER && this.data[info.current - 2] === U6OP.ENDIF) {
            // this is the case that there is no U6OP_ENDANSWER after the last answert '*' in Denys' script 0x094f
            // if it is BYE after U6OP_ENDIF, treat is as the end of the answer
            return;
          }
          break;
        }
        case U6OP.GIVE: {
          result.push("    GIVE obj ");
          this.collectEval(result, info);
          result.push(", qual ");
          this.collectEval(result, info);
          result.push(", from ");
          this.collectEval(result, info);
          result.push(", to ");
          this.collectEval(result, info);
          result.push("\r\n");
          break;
        }
        case U6OP.NEW: {// 0xb9
          result.push("    NEW npc ");
          this.collectEval(result, info);
          result.push(", obj ");
          this.collectEval(result, info);
          result.push(", quality ");
          this.collectEval(result, info);
          result.push(", quantity ");
          this.collectEval(result, info);
          result.push("\r\n");
          break;
        }
        case U6OP.DELETE: {// 0xba
          result.push("    DELETE npc ");
          this.collectEval(result, info);
          result.push(", obj ");
          this.collectEval(result, info);
          result.push(", quality ");
          this.collectEval(result, info);
          result.push(", quantity ");
          this.collectEval(result, info);
          result.push("\r\n");
          break;
        }
        case U6OP.PORTRAIT: {
          result.push("    PORTRAIT ");
          this.collectEval(result, info);
          result.push("\r\n");
          break;
        }
        case U6OP.ADDKARMA: {
          result.push("    ADD_KARMA ");
          this.collectEval(result, info);
          result.push("\r\n");
          break;
        }
        case U6OP.SUBKARMA: {
          result.push("    SUB_KARMA ");
          this.collectEval(result, info);
          result.push("\r\n");
          break;
        }
        case U6OP.PAUSE: {// wait
          result.push("    PAUSE\r\n");
          break;
        }
        case U6OP.WORKTYPE: {
          result.push("    WORKTYPE ");
          this.collectEval(result, info);
          result.push(", ");
          this.collectEval(result, info);
          result.push("\r\n");
          break;
        }
        case U6OP.SETNAME: {
          result.push("    SET_$Y ");
          this.collectEval(result, info);
          result.push("\r\n");
          break;
        }
        case U6OP.HEAL: {
          result.push("    HEAL ");
          this.collectEval(result, info);
          result.push("\r\n");
          break;
        }
        case U6OP.CURE: {
          result.push("    CURE ");
          this.collectEval(result, info);
          result.push("\r\n");
          break;
        }
        case U6OP.RESURRECT: {
          // something related to revive people
          // op code for Balakai (SE), Intanya (SE)
          // it needs to remove the dead body from the evaluation, npc_id who has the dead body
          // the npc id of the dead body will be assigned to [0x1b B2],
          // also set $Y as the npc name who is revived.
          result.push("    RESURRECT ");
          this.collectEval(result, info);
          result.push("\r\n");
          break;
        }
        default: {
          if (!this.collectUnknown(result, info, code)) {
              assert(false, `unknown op code ${code}!`, result);
          }
          break;
        }}
      }
    }
  }

  collectText(result, info) {
    const start = info.current;
    while (info.current < info.end && this.data[info.current] < 0x80) {
        info.current++;
    }
    const s = this.asciiString(start, info.current - start);
    result.push(s);
  }

  collectEval(result, info) {
    result.push("[");
    const data = this.data;
    const start = info.current;
    const end = info.end;

    while (info.current < end) {
      const scriptOffset = info.current - start; // for debug

      const value = data[info.current++];
      switch (value) {
        case U6OP.NUM8:
          result.push(`N8(0x${hexString(data[info.current++],2)}) `);
          break;

        case U6OP.NUM32:
          {
            const num = (data[info.current]) |
                        (data[info.current + 1] << 8) |
                        (data[info.current + 2] << 16) |
                        (data[info.current + 3] << 24);
            result.push(`N32(0x${hexString(num,8)}) `);
            info.current += 4;
          }
          break;

        case U6OP.NUM16:
          {
            const num = (data[info.current]) |
                        (data[info.current + 1] << 8);
            result.push(`N16(0x${hexString(num,4)}) `);
            info.current += 2;
          }
          break;

        case U6OP.VAR:        result.push("B2 "); break;
        case U6OP.SVAR:       result.push("B3 "); break;
        case U6OP.DATA:       result.push("B4 "); break;

        case U6OP.EVAL:       result.push("]"); return;

        case U6OP.GT:         result.push("> "); break;
        case U6OP.GE:         result.push(">= "); break;
        case U6OP.LT:         result.push("< "); break;
        case U6OP.LE:         result.push("<= "); break;
        case U6OP.NE:         result.push("!= "); break;
        case U6OP.EQ:         result.push("== "); break;

        case U6OP.ADD:        result.push("+ "); break;
        case U6OP.SUB:        result.push("- "); break;
        case U6OP.MUL:        result.push("* "); break;
        case U6OP.DIV:        result.push("/ "); break;

        case U6OP.LOR:        result.push("| "); break;
        case U6OP.LAND:       result.push("& "); break;

        case U6OP.CANCARRY:   result.push("CANCARRY "); break;
        case U6OP.WEIGHT:     result.push("WEIGHT "); break;
        case U6OP.GETHORSE:   result.push("GETHORSE"); break;
        case U6OP.HORSED:     result.push("HORSED "); break;
        case U6OP.REST:       result.push("REST"); break;
        case U6OP.OWNS:       result.push("OWNS "); break;
        case U6OP.RAND:       result.push("RAND "); break;
        case U6OP.FLAG:       result.push("FLAG "); break;
        case U6OP.OBJCOUNT:   result.push("OBJCOUNT "); break;
        case U6OP.INPARTY:    result.push("INPARTY "); break;
        case U6OP.OBJINPARTY: result.push("OBJINPARTY "); break;
        case U6OP.JOIN:       result.push("JOIN "); break;
        case U6OP.LEAVE:      result.push("LEAVE "); break;
        case U6OP.WOUNDED:    result.push("WOUNDED "); break;
        case U6OP.POISONED:   result.push("POISONED "); break;
        case U6OP.NPCNEARBY:  result.push("NPCNEARBY "); break;
        case U6OP.NPC:        result.push("NPC "); break;
        case U6OP.EXP:        result.push("EXP. "); break;
        case U6OP.LVL:        result.push("LVL. "); break;
        case U6OP.STR:        result.push("STR. "); break;
        case U6OP.INT:        result.push("INT. "); break;
        case U6OP.DEX:        result.push("DEX. "); break;

        default:
          if (value < 0x80) {
            result.push(`0x${hexString(value,2)} `);
          } else {
            assert(false,
              `Unexpected value 0x${value.toString(16)} in collectEval`,
              result);
          }
      }
    }

    throw new Error("Unexpected end of collectEval: missing U6OP_EVAL");
  }

  collectUnknown(result, info, unknown_code) {
    switch (unknown_code) {
      case 0x9c: {
        result.push("    9C? ");
        this.collectEval(result, info);
        result.push("\r\n");
        return true;
      }
      case 0xbe: {
        result.push("    BE? ");
        this.collectEval(result, info);
        result.push("\r\n");
        return true;
      }
      case U6OP.DF: {
        result.push("    DF ");
        this.collectEval(result, info);
        result.push("\r\n");
        return true;
      }
      /*case U6OP.FUNC: {
        // unknown op code for Yunapotli (SE)
        // should be used for opeing the door of the city
        if (m_npc_name == "Yunapotli" && *(uint32_t*)p == 0xa700ded4)
        {
            // func 222:
            result += "    U6OP_FUNC ";
            collect_eval(result, p, script_start, script_end);
            result += "\r\n";
            p += 4;
            return true;
        }
        else if (m_npc_name == "Fabozz" && *(uint32_t*)p == 0xa700afd4)
        {
            // func 175:
            result += "    U6OP_FUNC ";
            collect_eval(result, p, script_start, script_end);
            result += "\r\n";
            return true;
        }
        else if (m_npc_name == "Intanya" && *(uint32_t*)p == 0xb6a70ad3)
        {
            // func 010: kick out to DOS
            result += "    U6OP_FUNC ";
            collect_eval(result, p, script_start, script_end);
            result += " kick out to DOS.\r\n";
            return true;
        }
        else
        {
            // func 001: ask guards to kill the player (055_Zipactriotl)(031_Huitlapacti)
            // func 002: ask guards to kill the player (021_Chizzztl)
            // func 003: ask guards to kill the player (036_Kipotli)
            // func 004: ask guards to kill the player (049_Tlapatla)
            // func 005: ask guards to kill the player (054_Xyxxxtl)
            // func 150: 052_Tuomaxx made a biggest drum on the Hill of Drum
            result += "    U6OP_FUNC ";
            collect_eval(result, p, script_start, script_end);
            result += "\r\n";
            return true;
        }
      }*/
    }

    return false;
  }

  skipText(info) {
    while (info.current < info.end && this.data[info.current] < 0x80) {
        info.current++;
    }
  }

  skipEvalBlock(info) {
    while (info.current < info.end) {
      const value = this.data[info.current++];
      switch (value) {
        case U6OP.NUM8:         info.current++; break;
        case U6OP.NUM32:        info.current += 4; break;
        case U6OP.NUM16:        info.current += 2; break;
        case U6OP.VAR:          break;
        case U6OP.SVAR:         break;
        case U6OP.DATA:         break;
        case U6OP.EVAL:         return;
        case U6OP.GT:           break;
        case U6OP.GE:           break;
        case U6OP.LT:           break;
        case U6OP.LE:           break;
        case U6OP.NE:           break;
        case U6OP.EQ:           break;
        case U6OP.ADD:          break;
        case U6OP.SUB:          break;
        case U6OP.MUL:          break;
        case U6OP.DIV:          break;
        case U6OP.LOR:          break;
        case U6OP.LAND:         break;
        case U6OP.FLAG:         break;
        case U6OP.INPARTY:      break;
        case U6OP.OBJINPARTY:   break;
        case U6OP.JOIN:         break;
        case U6OP.LEAVE:        break;
        default:
          // only allow the text here
          assert(value < 0x80, "shall be text only!");
          break;
      }
    }
    assert(false && "should not be here!");
  }

  skipCodeBlock(info, blockType) {
    while (info.current < info.end) {
      let addr1;
      let addr2;

      const code = this.data[info.current];
      if (code < 0x80) {
          this.skipText(info);
      }
      else {
        info.current++;
        switch (code) {
          case U6OP.ASK:
            break; // does it need to do as U6OP_ASKC?
          case U6OP.ASKC:
            this.skipText(info); // skip possible answers
            while (info.current < info.end) {
              assert(this.data[info.current] === U6OP.KEYWORDS);
              info.current++;
              this.skipText(info); // skip keywords
              assert(this.data[info.current] == U6OP.ANSWER);
              info.current++;
              this.skipCodeBlock(info, U6OP.ANSWER);
              if (this.data[info.current] === U6OP.ENDANSWER)
                break;
            }
            assert(this.data[info.current] === U6OP_ENDANSWER);
            info.current++;
            break;
          case U6OP.KEYWORDS:
          case U6OP.ENDANSWER:
            info.current--;
            assert(blockType === U6OP.ANSWER);
            return;
          case U6OP.IF:
            addr1 = addr2 = 0;
            this.skipEvalBlock(info);                // skip the conditional expression
            this.skipCodeBlock(info, U6OP.IF);       // skip the if-true block
            if (this.data[info.current-6] === U6OP.JUMP) {
              addr1 = info.current - 5;
            }
            if (this.data[info.current-1] === U6OP.ELSE) {
              this.skipCodeBlock(info, U6OP.ELSE); // skip the if-false block
              if (this.data[info.current-6] === U6OP.JUMP) {
                addr2 = info.current - 5;
              }
            }
            assert(this.data[info.current-1] === U6OP.ENDIF);         // should be end with U6OP_ENDIF
            if (addr1 && addr2) {
              const value1 = new DataView(this.data.buffer, addr1, 4).getUint32(0, true);
              const value2 = new DataView(this.data.buffer, addr2, 4).getUint32(0, true);
              if (value1 === value2 && blockType === U6OP.ANSWER) {
                // this is the case that there is no U6OP_ENDANSWER after the last answer '*' in aiela's script
                // if the handling of if-true and if-false jumps to the same address, treat it as the end of the answer
                return;
              }
            }
            break;
          case U6OP.ELSE:
            assert(blockType === U6OP.IF);          // should be from U6OP_IF block, then hit U6OP_ELSE
            return;
          case U6OP.ENDIF:                            // should be from U6OP_IF or U6OP_ELSE, then hit U6OP_ENDIF
            assert(blockType === U6OP.IF || blockType === U6OP.ELSE);
            return;
          case U6OP.SETF:
          case U6OP.CLEARF:
          case U6OP.WORKTYPE:
            this.skipEvalBlock(info);
            this.skipEvalBlock(info);
            break;
          case U6OP.DECL:
            info.current += 2;
            break;
          case U6OP.ASSIGN:
            this.skipEvalBlock(info);
              break;
          case U6OP.JUMP:
            info.current += 4;
            break; // exit the function
          case U6OP.BYE:
            break;
          case U6OP.NEW:
          case U6OP.DELETE:
            this.skipEvalBlock(info); // npc number
            this.skipEvalBlock(info); // obj
            this.skipEvalBlock(info); // quality
            this.skipEvalBlock(info); // quantity
            break;
          case U6OP.SHOWINVENTORY:
          case U6OP.PORTRAIT:
            this.skipEvalBlock(info);
            break;
          case U6OP.PAUSE:
            break;
          case U6OP.HEAL:
          case U6OP.CURE:
            this.skipEvalBlock(info); // npc number
            break;
          default:
            assert(false, `code 0x${hexString(code,2)} offset 0x${hexString(info.current,4)}}`);
            break;
        } // switch
      } // else
    } // while (info.current < info.end)
  }
};