// seafox/assets/sprite_blocks.js
//
// GENERATED FILE -- do not edit by hand.
// Build:  python seafox/tools/extract_sprites.py --dsk <path to the disk image>
//
// The sixty-three bitmaps of design_spec 6.6.1, exactly as they are stored on
// the original disk, plus the parity and palette each one is drawn at.
//
// FORMAT
//   SPRITE_BLOCKS[name] = { byteWidth, rows, phase, flip, bits }
//
//   byteWidth  the SOURCE block's width in bytes. Collision box extents derive
//              from this and not from the stripped pixel width -- recomputing
//              them from the bitmap yields tighter boxes and a game that misses
//              more often than it should (design_spec 6.4).
//   rows       height in pixels.
//   phase      parity of the screen column the leftmost pixel lands on, 0 even
//              and 1 odd. Picks one hue of a pair (design_spec 6.3).
//   flip       the palette flip, XORed into every source byte's palette bit.
//   bits       base64 of byteWidth*rows source bytes, row-major.
//   verified   present and false when the phase/flip pair above has not been
//              established. Listed by the tool that wrote this file.
//   phaseLive  present and true when NOTHING fixes this object's parity -- not
//              its creator, not the walk that draws it. Both parities ship as
//              separate assets and the draw picks by the object's current X.
//              This is the only colour decision the bake cannot make.
//
//   ONE SOURCE BYTE IS SEVEN PIXELS, LOWEST BIT LEFTMOST. Bit 7 is not a pixel:
//   it is the palette bit covering all seven of them (design_spec 6.3).
//
//   Text strips additionally carry { x, y }. A strip's position is its own and
//   is not supplied by the code that posts it (design_spec 6.6.1).
//
// A bitmap drawn in more than one colour appears once per appearance: the ten
// merchant records over seven hulls (design_spec 12.5), and the dot, streak and
// debris once per parity, because nothing in the effects system fixes theirs
// (design_spec 15.4).
//
// THE BAKE OF design_spec 6.3 IS NOT DONE HERE. Turning these into the runtime
// {w, h, byteWidth, ink, color} of design_spec 6.2 happens at load: baking here
// would ship roughly fifteen times this file, and the two-pass blend is
// normative, so it belongs in code the game actually runs.


export const SPRITE_BLOCKS = {
  playerSubmarine: { byteWidth: 5, rows: 6, phase: 0, flip: 1, bits: "QH8BAABAVQEAAEBVAQAAflV/fwBTKlVaAX5/f38A" },
  torpedoRising: { byteWidth: 2, rows: 6, phase: 1, flip: 0, bits: "AgAHAAUABQACAAcA" },
  torpedoDescending: { byteWidth: 2, rows: 6, phase: 1, flip: 0, bits: "BwACAAUABQAHAAIA" },
  torpedoHorizontal: { byteWidth: 2, rows: 3, phase: 0, flip: 1, bits: "UwBGAVMA" },
  enemyHullRightToLeft: { byteWidth: 5, rows: 7, phase: 0, flip: 1, bits: "AEAqAQAAQCYBAABAKgEAVCpVKgBVKlU6AXU6VToBVCpVKgA=" },
  enemyHullLeftToRight: { byteWidth: 5, rows: 7, phase: 0, flip: 1, bits: "AFUCAAAAZQIAAABVAgAAVCpVKgBdKlUqAV0qXS4BVCpVKgA=" },
  magneticMine: { byteWidth: 2, rows: 6, phase: 0, flip: 1, bits: "HABVAGkASwBVABwA" },
  hospitalShip: { byteWidth: 5, rows: 7, phase: 0, flip: 1, bits: "IAEAAAAgIU0CACAhTAIAICE/AgBVKkwqAVUqTSoAVSpVCgA=" },
  supplySubmarine: { byteWidth: 5, rows: 7, phase: 1, flip: 0, bits: "AFUCAAAAVQIAAABVAgAAVCpVKgBVKlUyAVUqVRoBVCpVKgA=" },
  payload: { byteWidth: 2, rows: 5, phase: 1, flip: 0, bits: "GwAbAAAAGwAbAA==" },
  dolphin: { byteWidth: 3, rows: 6, phase: 0, flip: 0, bits: "QAEAYAAAfEcBd38Af38AOkAB" },
  shellOpen: { byteWidth: 2, rows: 9, phase: 0, flip: 0, bits: "DwAeABwAGAAwABgAHAAeAA8A" },
  shellClosed: { byteWidth: 2, rows: 7, phase: 0, flip: 0, bits: "HAA+AH8AYAB/AD4AHAA=" },
  destroyer: { byteWidth: 5, rows: 7, phase: 0, flip: 0, bits: "AFAAAAAAUAwAAABQDAAAACp9fwFVKlUqAXQqVSoBUCpVKgE=" },
  chargeArcing: { byteWidth: 2, rows: 2, phase: 0, flip: 1, bits: "AwADAA==" },
  chargeSinking: { byteWidth: 2, rows: 4, phase: 1, flip: 1, bits: "FAAUABQAFAA=" },
  enemyTorpedo: { byteWidth: 2, rows: 3, phase: 0, flip: 0, bits: "TgFzAE4B" },
  avenger: { byteWidth: 4, rows: 7, phase: 1, flip: 1, bits: "ASgFAAEqFQBEKk0AVCpVAEQqfQABKhcAASgFAA==" },
  merchant0: { byteWidth: 5, rows: 7, phase: 0, flip: 0, bits: "0IDQgABQAFAAAFBUUgAAUFRSAABVVFIqAVVVWioAVSpVCgA=" },
  merchant1: { byteWidth: 5, rows: 7, phase: 0, flip: 1, bits: "IAEoAAAgASgAACABKAAAeH9/AQBVKlUqAVUqVSoAVSpVCgA=" },
  merchant2: { byteWidth: 5, rows: 7, phase: 0, flip: 0, bits: "cGBBAwBwYEEDAHBgQQMAKFUqBQBVKnUqAVc6VS4AVS5VCgA=" },
  merchant3: { byteWidth: 5, rows: 7, phase: 1, flip: 1, bits: "qNCggYAoUCABAChQIAEAfHhxAwBVKlUqAVUqVSoAVSpVCgA=" },
  merchant4: { byteWidth: 5, rows: 7, phase: 1, flip: 0, bits: "AAUAAACAhYAAAAAFAAAABwUAeAFVKlUqAVUqVSoAVSpVCgA=" },
  merchant5: { byteWidth: 5, rows: 7, phase: 1, flip: 1, bits: "AA4cAAAADhwAAABOHAAAKC4dBQBVKlUqAVUqVSoAVSpVCgA=" },
  merchant6: { byteWidth: 5, rows: 7, phase: 1, flip: 0, bits: "ADgAAAAAOAAAAAA4AAAAKDk6AAArLVUqAVVqVS4AVSpVCgA=" },
  merchant7: { byteWidth: 5, rows: 7, phase: 0, flip: 1, bits: "IAEoAAAgASgAACABKAAAeH9/AQBVKlUqAVUqVSoAVSpVCgA=" },
  merchant8: { byteWidth: 5, rows: 7, phase: 1, flip: 0, bits: "cGBBAwBwYEEDAHBgQQMAKFUqBQBVKnUqAVc6VS4AVS5VCgA=" },
  merchant9: { byteWidth: 5, rows: 7, phase: 0, flip: 1, bits: "AAUAAACAhYAAAAAFAAAABwUAeAFVKlUqAVUqVSoAVSpVCgA=" },
  sinkingShip1: { byteWidth: 5, rows: 8, phase: 0, flip: 1, bits: "AEACUAAAUAJVAABQKlUAAFAqFQAAVCoVACBVKgUAKlUqAABVKlUqAA==" },
  sinkingShip2: { byteWidth: 5, rows: 8, phase: 0, flip: 1, bits: "AAEAAAAgASAAACgBKgAAKFEqAAAoVQoAAChVAAAAKlUAAABVKlUqAA==" },
  sinkingShip3: { byteWidth: 5, rows: 8, phase: 0, flip: 1, bits: "AAAAAAAAAAgAAAAACgAAAEAKAAAAUAIAAABUAgAAAFUAAABVKlUqAA==" },
  burst1: { byteWidth: 3, rows: 6, phase: 1, flip: 1, bits: "EAIAVAIARAAAQAIAFAAAUAIA" },
  burst2: { byteWidth: 3, rows: 6, phase: 1, flip: 1, bits: "QQgABQgAUAIAFQIAQAIAEQgA" },
  burst3: { byteWidth: 3, rows: 6, phase: 1, flip: 1, bits: "RAIAEAAAVAIAAAAAUAIAFAIA" },
  tallColumn1: { byteWidth: 3, rows: 13, phase: 1, flip: 1, bits: "YAAAcAMAXA4AXA4AVzoAVzoAVzoAVzoAVzoAXA4AXA4AcAMAYAAA" },
  tallColumn2: { byteWidth: 3, rows: 13, phase: 1, flip: 1, bits: "AzgADWQAGWoAYzEAVhoAVgwATgYAWAYAThoAVjIAdGsAM2wADzAA" },
  scoreOrdinary1: { byteWidth: 5, rows: 7, phase: 1, flip: 1, bits: "FCABCgBBCEQgAEAIRCAAEAhEIAAECEQgAAEIRCAAVSABCgA=" },
  scoreOrdinary2: { byteWidth: 5, rows: 7, phase: 1, flip: 1, bits: "FSABCgBACEQgAEAIRCAAFAhEIABACEQgAEAIRCAAFSABCgA=" },
  scoreOrdinary3: { byteWidth: 5, rows: 7, phase: 1, flip: 1, bits: "QSABCgBBCEQgAEEIRCAAVQhEIABACEQgAEAIRCAAQCABCgA=" },
  scoreOrdinary4: { byteWidth: 5, rows: 7, phase: 1, flip: 1, bits: "VSABCgABCEQgAAEIRCAAFQhEIABACEQgAEAIRCAAFSABCgA=" },
  scoreOrdinary5: { byteWidth: 5, rows: 7, phase: 1, flip: 1, bits: "FCABCgABCEQgAAEIRCAAFQhEIABBCEQgAEEIRCAAFCABCgA=" },
  scoreQuota1: { byteWidth: 5, rows: 7, phase: 1, flip: 1, bits: "Hh4eHgAzMzMzADAzMzMAGDMzMwAMMzMzAAYzMzMAPx4eHgA=" },
  scoreQuota2: { byteWidth: 5, rows: 7, phase: 1, flip: 1, bits: "Hh4eHgAzMzMzADAzMzMAGDMzMwAwMzMzADMzMzMAHh4eHgA=" },
  scoreQuota3: { byteWidth: 5, rows: 7, phase: 1, flip: 1, bits: "Mx4eHgAzMzMzADMzMzMAPzMzMwAwMzMzADAzMzMAMB4eHgA=" },
  scoreQuota4: { byteWidth: 5, rows: 7, phase: 1, flip: 1, bits: "Hx4eHgADMzMzAAMzMzMAHzMzMwAwMzMzADAzMzMAHx4eHgA=" },
  scoreQuota5: { byteWidth: 5, rows: 7, phase: 1, flip: 1, bits: "Hh4eHgADMzMzAAMzMzMAHzMzMwAzMzMzADMzMzMAHh4eHgA=" },
  effectBlob: { byteWidth: 2, rows: 1, phase: 0, flip: 0, bits: "AwA=" },
  effectDotEven: { byteWidth: 1, rows: 1, phase: 0, flip: 0, bits: "AQ==" },
  effectDotOdd: { byteWidth: 1, rows: 1, phase: 1, flip: 0, bits: "AQ==" },
  effectStreakEven: { byteWidth: 2, rows: 1, phase: 0, flip: 1, bits: "KwE=" },
  effectStreakOdd: { byteWidth: 2, rows: 1, phase: 1, flip: 1, bits: "KwE=" },
  effectSparkClusterEven: { byteWidth: 2, rows: 4, phase: 0, flip: 1, phaseLive: true, bits: "AQAIAAIABAA=" },
  effectSparkClusterOdd: { byteWidth: 2, rows: 4, phase: 1, flip: 1, phaseLive: true, bits: "AQAIAAIABAA=" },
  stripScore: { byteWidth: 9, rows: 7, phase: 1, flip: 0, x: 175, y: 185, bits: "VAAVIAUqQSoBASJACBACRAAQASAACBACRAAAVCAACBAqQSoAACIACBAiQAAAASJACBACQQAQVAAVIAUCRCoB" },
  stripHighScore: { byteWidth: 17, rows: 7, phase: 0, flip: 0, x: 0, y: 185, bits: "ASIFKhAgAAAVIAUoQSpQKgABAkEAESAAIEAIEAJEABEABAECQQAQIAAgAAgAAkQAEQAAVQJBAFAqAAAVCAACRCpQCgABAkEgESAAAEAIAAJECBAAAAECQQARIAAgQAgQAkQgEAAEASIFKhEgAAAVIAUoQQBRKgA=" },
  stripSubs: { byteWidth: 7, rows: 7, phase: 0, flip: 0, x: 0, y: 185, bits: "VCBAKAUoAQEiQAgQAkQBIEAIEAIAVCBAKAUoAQAiQAgQAAQBIkAIEAJEVAAVKAUoAQ==" },
  stripFuelTorp: { byteWidth: 21, rows: 7, phase: 0, flip: 0, x: 0, y: 185, bits: "VSJAKBUCAAAAAAAAAADVgpWohaqBASBACAACQAAAAAAAAACQoMCIkILEASBACAACAAAAAAAAAACQoMCIkIKEVSBAKAUCAAAAAAAAAACQoMCohaqBASBACAACAAAAAAAAAACQoMCIgYIAASBACAACQAAAAAAAAACQoMCIhILAAQAVKBUqBQAAAAAAAACQgJWIkIIA" },
  stripDemoMessageA: { byteWidth: 35, rows: 7, phase: 1, flip: 0, x: 21, y: 0, bits: "BCoQQAAVIAUoAQAqQSpAClQCVSIVKAUCRABRCgAoESBQAgBBAEFQIEAIEAIEAAJEABEgBAgBIEAIEAJEAhEgACBQIAQIAEEAQEAgQAgQAAQAAkQAESgECAEgQAgQAkQAESAAIBAgBAAAQQBAQABVIAUAAQAqQSoQIgQIVSAVKAUCRAgRIAAgECIEAABBAEBAAEAIECAAAAJECFAgBAgBIAQIEAJEABEgACAQIAQAAEEAQUAAEAgQCAAAAkQgECAECAEgEAgQAkQgESAUIBAoBAgFBCoQUAIEIAUqBQAqQQBBClQCVSJAKAUoQQBRChAoESBQAgU=" },
  stripMission: { byteWidth: 11, rows: 7, phase: 0, flip: 0, x: 70, y: 0, bits: "ASIFKkAKVCAFAgQBAkEAESAQCBAKBEUCQQAQABAIEAIEAQIBKkAKEAgQIgQRAgEAASAQCBACBAECQQARIBAIEAIFASIFKkAKVCAFAgQ=" },
  stripMissionComplete: { byteWidth: 26, rows: 7, phase: 1, flip: 0, x: 49, y: 0, bits: "ASIFKkAKVCAFAgQAKAEqECBUAgEgVSgVKgUBAkEAESAQCBAKBAACRAARIAQIASAAAAECAEUCQQAQABAIEAIEAAJAAFEoBAgBIAAAAQIAAQIBKkAKEAgQIgQAAkAAESBUAgEgFQABKgERAgEAASAQCBACBAACQAARIgQAASAAAAECAAECQQARIBAIEAIFAAJEABEgBAABIAAAAQIAASIFKkAKVCAFAgQAKAEqECAEAFUiVQABKgU=" },
  stripGameOver: { byteWidth: 15, rows: 7, phase: 1, flip: 0, x: 91, y: 90, bits: "VAAECBAqBQBQAgEiVSgFAQIRCBACAAAECAEiAAgQASBAKBQCAAAECAEiAAgQASBACBAqAQAECAEiFSgFQSJVCBECAAAECAEiAAgBASJACBACAAAECEQgAAgEVCJACBAqBQBQAhAgVQgQ" },
  stripOutOfFuel: { byteWidth: 19, rows: 7, phase: 0, flip: 0, x: 84, y: 105, bits: "VCBAKBUAQApUCgAoFQIQKkUAAAEiQAABABAgBAAACAACEAJAAAABIkAAAQAQIAQAAAgAAhACQAAAASJAAAEAECBUAgAoBQIQKkEAAAEiQAABABAgBAAACAACEAJAAAABIkAAAQAQIAQAAAgAAhACQAAAVAAVAAEAQAoEAAAIACgFKkUqAQ==" },
  stripOne: { byteWidth: 5, rows: 7, phase: 0, flip: 1, x: 154, y: 0, bits: "KEEAUSoCRAIRAAJEABEAAkQIUQoCRAARAAJEIBEAKEEAUSo=" },
  stripTwo: { byteWidth: 5, rows: 7, phase: 0, flip: 1, x: 154, y: 0, bits: "KkUAQQogQAARICBAABEgIEAAESAgQAgRICBACBEgIAAiQAo=" },
  stripThree: { byteWidth: 9, rows: 7, phase: 0, flip: 1, x: 154, y: 0, bits: "KkUAUQpUClUCIEAAESAEAAEAIEAAESAEAAEAIEAqUQpUAlUAIEAAEQIEAAEAIEAAEQgEAAEAIEAAESBUClUC" },
  stripFour: { byteWidth: 7, rows: 7, phase: 0, flip: 1, x: 154, y: 0, bits: "KgUqECBUAgJAABEgBAgCQAARIAQIKkEAESBUAgJAABEgRAACQAARIAQCAgAqQAoECA==" },
  stripFive: { byteWidth: 6, rows: 7, phase: 0, flip: 1, x: 154, y: 0, bits: "KkUKASJVAgACASIAAgACASIAKgECASIVAgACASIAAgACRCAAAkAKECBV" },
  stripHudEraseBar: { byteWidth: 25, rows: 7, phase: 0, flip: 0, x: 0, y: 185, bits: "/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////w==" },
  stripDemoMessageB: { byteWidth: 30, rows: 7, phase: 1, flip: 0, x: 35, y: 0, bits: "VCBVAAEqBSoQIAAAAFUgQABUClUAECBQAlUgFSAFASIAIAQCQAARIAAAAAEiQAAEAAECECAECAEiQAgQASAACBACQABBCAAAAAECEQAEAAECECAECAEiQAgAVCAVCBAqQQABAgAAAFUABABUAgECUCoECFUgFSAFACIAKBUCQABBCAAAAAECBAAEAAECECAECAEiQAAQASIACBACQAARIAAAAAECBAAEAAECECAECAEiQAgQVCBVCBACACoQIAAAAFUABABUClUAECBQAlUgFSAF" },
};
