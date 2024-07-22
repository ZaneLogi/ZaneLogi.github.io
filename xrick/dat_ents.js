const ent_entdata = [
  { w:0x00, h:0x00, spr:0x0000, sni:0x0000, trig_w:0x00, trig_h:0x00, snd:0x00 },
  { w:0x18, h:0x15, spr:0x0000, sni:0x0000, trig_w:0x00, trig_h:0x00, snd:0x00 },
  { w:0x00, h:0x00, spr:0x0000, sni:0x0000, trig_w:0x00, trig_h:0x00, snd:0x00 },
  { w:0x18, h:0x15, spr:0x0000, sni:0x0000, trig_w:0x00, trig_h:0x00, snd:0x00 },
  { w:0x18, h:0x15, spr:0x002f, sni:0x008e, trig_w:0x00, trig_h:0x00, snd:0x00 },
  { w:0x18, h:0x15, spr:0x002f, sni:0x008e, trig_w:0x00, trig_h:0x00, snd:0x00 },
  { w:0x18, h:0x15, spr:0x002f, sni:0x008e, trig_w:0x00, trig_h:0x00, snd:0x00 },
  { w:0x18, h:0x15, spr:0x0037, sni:0x007e, trig_w:0x00, trig_h:0x00, snd:0x00 },
  { w:0x18, h:0x15, spr:0x0037, sni:0x007e, trig_w:0x00, trig_h:0x00, snd:0x00 },
  { w:0x18, h:0x15, spr:0x0037, sni:0x007e, trig_w:0x00, trig_h:0x00, snd:0x00 },
  { w:0x18, h:0x15, spr:0x0041, sni:0x0086, trig_w:0x00, trig_h:0x00, snd:0x00 },
  { w:0x18, h:0x15, spr:0x0041, sni:0x0086, trig_w:0x00, trig_h:0x00, snd:0x00 },
  { w:0x18, h:0x15, spr:0x0041, sni:0x0086, trig_w:0x00, trig_h:0x00, snd:0x00 },
  { w:0x18, h:0x15, spr:0x004b, sni:0x0086, trig_w:0x00, trig_h:0x00, snd:0x00 },
  { w:0x18, h:0x15, spr:0x004b, sni:0x0086, trig_w:0x00, trig_h:0x00, snd:0x00 },
  { w:0x18, h:0x15, spr:0x004b, sni:0x0086, trig_w:0x00, trig_h:0x00, snd:0x00 },
  { w:0x18, h:0x15, spr:0x0029, sni:0x0029, trig_w:0x00, trig_h:0x00, snd:0x00 },
  { w:0x18, h:0x15, spr:0x002a, sni:0x002a, trig_w:0x00, trig_h:0x00, snd:0x00 },
  { w:0x18, h:0x15, spr:0x002b, sni:0x002b, trig_w:0x00, trig_h:0x00, snd:0x00 },
  { w:0x18, h:0x15, spr:0x002c, sni:0x002c, trig_w:0x00, trig_h:0x00, snd:0x00 },
  { w:0x18, h:0x15, spr:0x002e, sni:0x002e, trig_w:0x00, trig_h:0x00, snd:0x00 },
  { w:0x18, h:0x15, spr:0x002d, sni:0x002d, trig_w:0x00, trig_h:0x00, snd:0x00 },
  { w:0x18, h:0x15, spr:0x001e, sni:0x001e, trig_w:0x04, trig_h:0x04, snd:0x00 },
  { w:0x18, h:0x15, spr:0x001f, sni:0x001f, trig_w:0x04, trig_h:0x04, snd:0x00 },
  { w:0x18, h:0x10, spr:0x000c, sni:0x0000, trig_w:0x03, trig_h:0x03, snd:0x14 },
  { w:0x18, h:0x06, spr:0x000e, sni:0x0005, trig_w:0x04, trig_h:0x04, snd:0x14 },
  { w:0x18, h:0x06, spr:0x000e, sni:0x0007, trig_w:0x10, trig_h:0x04, snd:0x14 },
  { w:0x18, h:0x12, spr:0x0011, sni:0x0009, trig_w:0x04, trig_h:0x04, snd:0x18 },
  { w:0x18, h:0x10, spr:0x000c, sni:0x0007, trig_w:0x04, trig_h:0x04, snd:0x14 },
  { w:0x18, h:0x15, spr:0x0014, sni:0x00a4, trig_w:0x04, trig_h:0x04, snd:0x15 },
  { w:0x18, h:0x15, spr:0x0014, sni:0x00ca, trig_w:0x04, trig_h:0x04, snd:0x15 },
  { w:0x18, h:0x10, spr:0x000c, sni:0x000d, trig_w:0x04, trig_h:0x04, snd:0x14 },
  { w:0x04, h:0x15, spr:0x0018, sni:0x0012, trig_w:0x04, trig_h:0x07, snd:0x14 },
  { w:0x18, h:0x10, spr:0x000c, sni:0x0014, trig_w:0x14, trig_h:0x04, snd:0x19 },
  { w:0x10, h:0x10, spr:0x001b, sni:0x0028, trig_w:0x04, trig_h:0x04, snd:0x00 },
  { w:0x10, h:0x10, spr:0x001e, sni:0x002a, trig_w:0x04, trig_h:0x04, snd:0x00 },
  { w:0x18, h:0x10, spr:0x000c, sni:0x002d, trig_w:0x03, trig_h:0x03, snd:0x14 },
  { w:0x20, h:0x08, spr:0x0020, sni:0x0009, trig_w:0x04, trig_h:0x04, snd:0x18 },
  { w:0x18, h:0x10, spr:0x000c, sni:0x0034, trig_w:0x04, trig_h:0x04, snd:0x14 },
  { w:0x20, h:0x0d, spr:0x0023, sni:0x0009, trig_w:0x04, trig_h:0x04, snd:0x18 },
  { w:0x18, h:0x15, spr:0x0026, sni:0x003a, trig_w:0x04, trig_h:0x04, snd:0x18 },
  { w:0x18, h:0x15, spr:0x0026, sni:0x003c, trig_w:0x04, trig_h:0x04, snd:0x18 },
  { w:0x18, h:0x15, spr:0x002c, sni:0x003e, trig_w:0x04, trig_h:0x04, snd:0x14 },
  { w:0x18, h:0x10, spr:0x0030, sni:0x0048, trig_w:0x04, trig_h:0x04, snd:0x14 },
  { w:0x20, h:0x10, spr:0x0008, sni:0x0007, trig_w:0x04, trig_h:0x04, snd:0x14 },
  { w:0x18, h:0x15, spr:0x000a, sni:0x004c, trig_w:0x14, trig_h:0x04, snd:0x14 },
  { w:0x18, h:0x15, spr:0x0036, sni:0x0009, trig_w:0x03, trig_h:0x03, snd:0x17 },
  { w:0x18, h:0x15, spr:0x0039, sni:0x0053, trig_w:0x04, trig_h:0x04, snd:0x16 },
  { w:0x20, h:0x10, spr:0x0008, sni:0x0055, trig_w:0x04, trig_h:0x04, snd:0x14 },
  { w:0x18, h:0x15, spr:0x000a, sni:0x0061, trig_w:0x04, trig_h:0x04, snd:0x14 },
  { w:0x12, h:0x15, spr:0x003c, sni:0x0067, trig_w:0x04, trig_h:0x04, snd:0x1a },
  { w:0x12, h:0x15, spr:0x0041, sni:0x006a, trig_w:0x18, trig_h:0x04, snd:0x1a },
  { w:0x18, h:0x15, spr:0x000a, sni:0x006c, trig_w:0x04, trig_h:0x04, snd:0x14 },
  { w:0x18, h:0x15, spr:0x0046, sni:0x0071, trig_w:0x04, trig_h:0x04, snd:0x1a },
  { w:0x12, h:0x10, spr:0x004b, sni:0x0074, trig_w:0x04, trig_h:0x04, snd:0x17 },
  { w:0x12, h:0x10, spr:0x004f, sni:0x0074, trig_w:0x04, trig_h:0x04, snd:0x17 },
  { w:0x18, h:0x15, spr:0x0053, sni:0x0076, trig_w:0x04, trig_h:0x04, snd:0x13 },
  { w:0x10, h:0x08, spr:0x0057, sni:0x0007, trig_w:0x10, trig_h:0x04, snd:0x1c },
  { w:0x18, h:0x10, spr:0x005a, sni:0x007e, trig_w:0x04, trig_h:0x04, snd:0x00 },
  { w:0x18, h:0x10, spr:0x005c, sni:0x0009, trig_w:0x03, trig_h:0x03, snd:0x9a },
  { w:0x18, h:0x11, spr:0x0068, sni:0x0088, trig_w:0x04, trig_h:0x04, snd:0x14 },
  { w:0x12, h:0x15, spr:0x003c, sni:0x008e, trig_w:0x18, trig_h:0x04, snd:0x1a },
  { w:0x18, h:0x15, spr:0x006a, sni:0x0009, trig_w:0x04, trig_h:0x04, snd:0x1a },
  { w:0x20, h:0x08, spr:0x0075, sni:0x0090, trig_w:0x14, trig_h:0x04, snd:0x15 },
  { w:0x18, h:0x10, spr:0x006d, sni:0x0009, trig_w:0x03, trig_h:0x03, snd:0x9a },
  { w:0x18, h:0x15, spr:0x0077, sni:0x0012, trig_w:0x04, trig_h:0x06, snd:0x15 },
  { w:0x18, h:0x15, spr:0x0046, sni:0x0092, trig_w:0x1f, trig_h:0x04, snd:0x1a },
  { w:0x18, h:0x15, spr:0x0080, sni:0x0094, trig_w:0x04, trig_h:0x04, snd:0x1b },
  { w:0x18, h:0x15, spr:0x0080, sni:0x00bf, trig_w:0x04, trig_h:0x04, snd:0x00 },
  { w:0x18, h:0x11, spr:0x0068, sni:0x00e5, trig_w:0x04, trig_h:0x04, snd:0x14 },
  { w:0x18, h:0x10, spr:0x005a, sni:0x00ea, trig_w:0x04, trig_h:0x04, snd:0x00 },
  { w:0x12, h:0x15, spr:0x003c, sni:0x00f4, trig_w:0x18, trig_h:0x04, snd:0x1a },
  { w:0x20, h:0x10, spr:0x0008, sni:0x0005, trig_w:0x04, trig_h:0x04, snd:0x14 },
  { w:0x18, h:0x10, spr:0x000c, sni:0x0005, trig_w:0x04, trig_h:0x04, snd:0x14 },
];

const ENT_NBR_ENTDATA = ent_entdata.length;

const ent_sprseq = [
  0x00, 0x01, 0x00, 0x02, 0x05, 0x03, 0x04, 0x03, 
  0x65, 0xff, 0x66, 0xff, 0x55, 0xff, 0x00, 0x56, 
  0xff, 0x00, 0x57, 0xff, 0x00, 0x58, 0x59, 0xff, 
  0x00, 0x5a, 0xff, 0x5b, 0x00, 0xff, 0x5c, 0xff, 
  0x5d, 0x00, 0xff, 0x00, 0x79, 0xff, 0x00, 0x5e, 
  0x5f, 0x60, 0x5f, 0xff, 0x00, 0x61, 0x69, 0xff, 
  0x64, 0x62, 0x62, 0x63, 0x63, 0xff, 0x67, 0x68, 
  0xff, 0x00, 0x00, 0xff, 0x6a, 0x6a, 0x6b, 0x6b, 
  0xff, 0x6b, 0x6b, 0x6a, 0x6a, 0xff, 0x6d, 0x6e, 
  0x6f, 0x70, 0xff, 0x71, 0x00, 0x00, 0xff, 0x72, 
  0x00, 0x00, 0xff, 0x73, 0x47, 0x48, 0xff, 0x00, 
  0x74, 0xff, 0x75, 0xff, 0x00, 0x7c, 0x7c, 0x7a, 
  0x7a, 0x7b, 0x7b, 0x7a, 0x7a, 0x7c, 0x7c, 0xff, 
  0x78, 0xff, 0x6d, 0x6e, 0xff, 0x00, 0x7a, 0x7a, 
  0x7b, 0x7b, 0x7c, 0x7c, 0xff, 0x6c, 0xff, 0x2d, 
  0xff, 0x10, 0x00, 0x00, 0x0c, 0x00, 0x04, 0xfa, 
  0xff, 0xa8, 0xa9, 0xaa, 0xab, 0xac, 0xff, 0x00, 
];

const ENT_NBR_SPRSEQ = ent_sprseq.length;

const ent_mvstep = [
  { count:0x10, dx: 0, dy: 0 },
  { count:0x0c, dx: 0, dy: 4 },
  { count:0xfa, dx: 0, dy: 0 },
  { count:0x30, dx: 0, dy:-1 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x46, dx: 8, dy: 0 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x46, dx:-8, dy: 0 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0xf8, dx: 0, dy: 0 },
  { count:0xf8, dx: 0, dy: 0 },
  { count:0xf8, dx: 0, dy: 0 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0xfa, dx: 0, dy: 0 },
  { count:0x08, dx: 0, dy: 4 },
  { count:0x22, dx: 0, dy: 0 },
  { count:0x08, dx: 0, dy:-4 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x46, dx: 0, dy:-8 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x09, dx: 0, dy: 0 },
  { count:0x08, dx: 0, dy: 1 },
  { count:0x05, dx: 0, dy: 0 },
  { count:0x08, dx: 0, dy: 1 },
  { count:0x05, dx: 0, dy: 0 },
  { count:0x08, dx: 0, dy: 1 },
  { count:0x05, dx: 0, dy: 0 },
  { count:0x08, dx: 0, dy: 1 },
  { count:0x05, dx: 0, dy: 0 },
  { count:0x08, dx: 0, dy: 1 },
  { count:0x05, dx: 0, dy: 0 },
  { count:0x08, dx: 0, dy: 1 },
  { count:0xfa, dx: 0, dy: 0 },
  { count:0xfa, dx: 0, dy: 0 },
  { count:0xfa, dx: 0, dy: 0 },
  { count:0xfa, dx: 0, dy: 0 },
  { count:0xfa, dx: 0, dy: 0 },
  { count:0xfa, dx: 0, dy: 0 },
  { count:0x06, dx: 0, dy:-8 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x01, dx: 0, dy: 0 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x23, dx: 0, dy: 0 },
  { count:0x46, dx: 0, dy: 8 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x10, dx: 0, dy: 0 },
  { count:0x0c, dx: 0, dy: 4 },
  { count:0xfa, dx: 0, dy: 0 },
  { count:0x04, dx: 0, dy: 8 },
  { count:0x19, dx: 0, dy: 0 },
  { count:0x0a, dx: 0, dy:-8 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x22, dx: 2, dy: 0 },
  { count:0x96, dx: 0, dy: 0 },
  { count:0x22, dx: 2, dy: 0 },
  { count:0x19, dx: 0, dy: 0 },
  { count:0x11, dx:-8, dy: 0 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x80, dx: 2, dy: 0 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x80, dx: 1, dy: 0 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x60, dx: 2, dy: 0 },
  { count:0x08, dx: 0, dy: 4 },
  { count:0x0c, dx: 0, dy: 8 },
  { count:0x2c, dx:-2, dy: 0 },
  { count:0x08, dx: 0, dy: 4 },
  { count:0x20, dx:-2, dy: 0 },
  { count:0x08, dx: 0, dy: 4 },
  { count:0x0c, dx: 0, dy: 8 },
  { count:0x46, dx:-2, dy: 0 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x20, dx: 1, dy: 2 },
  { count:0x19, dx: 0, dy: 0 },
  { count:0x20, dx:-1, dy:-2 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x08, dx: 0, dy: 2 },
  { count:0x04, dx: 0, dy: 4 },
  { count:0x25, dx: 0, dy: 0 },
  { count:0x04, dx: 0, dy:-4 },
  { count:0x08, dx: 0, dy:-2 },
  { count:0x0c, dx: 0, dy: 0 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x18, dx: 0, dy: 0 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x08, dx:-4, dy: 0 },
  { count:0x08, dx: 0, dy: 4 },
  { count:0x10, dx:-8, dy: 0 },
  { count:0x19, dx: 0, dy: 0 },
  { count:0x08, dx: 8, dy: 0 },
  { count:0x04, dx: 0, dy:-4 },
  { count:0x96, dx: 0, dy: 0 },
  { count:0x08, dx: 8, dy: 0 },
  { count:0xfa, dx: 0, dy: 0 },
  { count:0x04, dx: 0, dy:-4 },
  { count:0x08, dx: 4, dy: 0 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x04, dx: 0, dy: 4 },
  { count:0x04, dx: 0, dy: 8 },
  { count:0x32, dx: 0, dy: 0 },
  { count:0x30, dx: 0, dy:-1 },
  { count:0x4b, dx: 0, dy: 0 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x04, dx:-4, dy: 0 },
  { count:0x1c, dx:-2, dy: 2 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x80, dx: 3, dy: 0 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x20, dx: 0, dy:-1 },
  { count:0x24, dx: 0, dy: 0 },
  { count:0x04, dx: 0, dy: 4 },
  { count:0x02, dx: 0, dy: 8 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x04, dx: 0, dy: 0 },
  { count:0xfe, dx:-2, dy: 0 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x08, dx: 0, dy: 0 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x02, dx: 0, dy:-4 },
  { count:0x02, dx: 0, dy:-2 },
  { count:0x01, dx: 0, dy:-1 },
  { count:0x01, dx: 0, dy: 1 },
  { count:0x02, dx: 0, dy: 2 },
  { count:0x04, dx: 0, dy: 4 },
  { count:0xfe, dx: 0, dy: 8 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x0c, dx: 4, dy: 0 },
  { count:0x04, dx: 2, dy: 0 },
  { count:0x02, dx: 0, dy: 0 },
  { count:0x04, dx:-2, dy: 0 },
  { count:0x30, dx:-4, dy: 0 },
  { count:0x04, dx:-2, dy: 0 },
  { count:0x2e, dx: 0, dy: 0 },
  { count:0x04, dx: 2, dy: 0 },
  { count:0x23, dx: 4, dy: 0 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x10, dx: 0, dy: 0 },
  { count:0x20, dx: 1, dy: 0 },
  { count:0x10, dx: 3, dy: 0 },
  { count:0x2c, dx: 2, dy: 0 },
  { count:0x2a, dx:-4, dy: 0 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x80, dx:-3, dy: 0 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x80, dx:-12, dy: 0 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x46, dx:-6, dy: 0 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x06, dx: 0, dy: 0 },
  { count:0x01, dx:64, dy:-64 },
  { count:0x06, dx: 0, dy: 0 },
  { count:0x01, dx:-80, dy:-32 },
  { count:0x06, dx: 0, dy: 0 },
  { count:0x01, dx:-80, dy: 8 },
  { count:0x06, dx: 0, dy: 0 },
  { count:0x01, dx:32, dy:32 },
  { count:0x06, dx: 0, dy: 0 },
  { count:0x01, dx: 0, dy:88 },
  { count:0x06, dx: 0, dy: 0 },
  { count:0x01, dx:64, dy:-96 },
  { count:0x06, dx: 0, dy: 0 },
  { count:0x46, dx: 6, dy: 3 },
  { count:0x06, dx: 0, dy: 0 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x03, dx:-8, dy: 0 },
  { count:0x01, dx:-10, dy:-2 },
  { count:0x01, dx:-6, dy:-2 },
  { count:0x01, dx:-6, dy:-5 },
  { count:0x01, dx:-5, dy:-6 },
  { count:0x01, dx:-2, dy:-6 },
  { count:0x01, dx:-2, dy:-10 },
  { count:0x01, dx: 2, dy:-10 },
  { count:0x01, dx: 2, dy:-6 },
  { count:0x01, dx: 5, dy:-6 },
  { count:0x01, dx: 6, dy:-5 },
  { count:0x01, dx: 6, dy:-2 },
  { count:0x01, dx:10, dy:-2 },
  { count:0x01, dx:10, dy: 2 },
  { count:0x01, dx: 6, dy: 2 },
  { count:0x01, dx: 6, dy: 5 },
  { count:0x01, dx: 5, dy: 6 },
  { count:0x01, dx: 2, dy: 6 },
  { count:0x01, dx: 2, dy:10 },
  { count:0x01, dx:-2, dy:10 },
  { count:0x01, dx:-2, dy: 6 },
  { count:0x01, dx:-5, dy: 6 },
  { count:0x01, dx:-6, dy: 5 },
  { count:0x01, dx:-6, dy: 2 },
  { count:0x01, dx:-10, dy: 2 },
  { count:0x46, dx:-8, dy: 0 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x06, dx: 0, dy: 0 },
  { count:0x01, dx: 0, dy:-128 },
  { count:0x06, dx: 0, dy: 0 },
  { count:0x01, dx:-64, dy:64 },
  { count:0x06, dx: 0, dy: 0 },
  { count:0x01, dx:-128, dy:-32 },
  { count:0x06, dx: 0, dy: 0 },
  { count:0x01, dx:-32, dy:-32 },
  { count:0x06, dx: 0, dy: 0 },
  { count:0x01, dx:112, dy:64 },
  { count:0x06, dx: 0, dy: 0 },
  { count:0x03, dx: 8, dy: 0 },
  { count:0x01, dx:10, dy:-2 },
  { count:0x01, dx: 6, dy:-2 },
  { count:0x01, dx: 6, dy:-5 },
  { count:0x01, dx: 5, dy:-6 },
  { count:0x01, dx: 2, dy:-6 },
  { count:0x01, dx: 2, dy:-10 },
  { count:0x01, dx:-2, dy:-10 },
  { count:0x01, dx:-2, dy:-6 },
  { count:0x01, dx:-5, dy:-6 },
  { count:0x01, dx:-6, dy:-5 },
  { count:0x01, dx:-6, dy:-2 },
  { count:0x01, dx:-10, dy:-2 },
  { count:0x01, dx:-10, dy: 2 },
  { count:0x01, dx:-6, dy: 2 },
  { count:0x01, dx:-6, dy: 5 },
  { count:0x01, dx:-5, dy: 6 },
  { count:0x01, dx:-2, dy: 6 },
  { count:0x01, dx:-2, dy:10 },
  { count:0x01, dx: 2, dy:10 },
  { count:0x01, dx: 2, dy: 6 },
  { count:0x01, dx: 5, dy: 6 },
  { count:0x01, dx: 6, dy: 5 },
  { count:0x01, dx: 6, dy: 2 },
  { count:0x01, dx:10, dy: 2 },
  { count:0x46, dx: 8, dy: 0 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x40, dx: 2, dy: 0 },
  { count:0x20, dx:-2, dy: 0 },
  { count:0x36, dx: 2, dy: 0 },
  { count:0x56, dx:-2, dy: 0 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x18, dx: 0, dy: 0 },
  { count:0x04, dx:-2, dy: 0 },
  { count:0x20, dx:-4, dy: 0 },
  { count:0x04, dx:-2, dy: 0 },
  { count:0x28, dx: 0, dy: 0 },
  { count:0x04, dx: 2, dy: 0 },
  { count:0x20, dx: 4, dy: 0 },
  { count:0x04, dx: 2, dy: 0 },
  { count:0x02, dx: 0, dy: 0 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x02, dx:-1, dy: 0 },
  { count:0x34, dx:-3, dy: 0 },
  { count:0x02, dx:-1, dy: 0 },
  { count:0x02, dx: 0, dy: 0 },
  { count:0x02, dx: 1, dy: 0 },
  { count:0x34, dx: 3, dy: 0 },
  { count:0x02, dx: 1, dy: 0 },
  { count:0x02, dx: 0, dy: 0 },
  { count:0x02, dx:-1, dy: 0 },
  { count:0x34, dx:-3, dy: 0 },
  { count:0x02, dx:-1, dy: 0 },
  { count:0x02, dx: 0, dy: 0 },
  { count:0x02, dx: 1, dy: 0 },
  { count:0x34, dx: 3, dy: 0 },
  { count:0x02, dx: 1, dy: 0 },
  { count:0x02, dx: 0, dy: 0 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x00, dx: 0, dy:-128 },
  { count:0x42, dx:-118, dy:118 },
  { count:0x35, dx:121, dy: 0 },
  { count:0x00, dx:-8, dy:66 },
  { count:0x97, dx:118, dy:78 },
  { count:0x79, dx: 0, dy: 0 },
  { count:0xd0, dx:67, dy:-92 },
  { count:0x76, dx:-118, dy:121 },
  { count:0x00, dx: 0, dy:24 },
  { count:0x44, dx:-79, dy:118 },
  { count:0xad, dx:121, dy: 0 },
  { count:0x00, dx:32, dy:69 },
  { count:0xbe, dx:118, dy:12 },
  { count:0x7a, dx: 0, dy: 0 },
  { count:0xc8, dx:69, dy:-53 },
  { count:0x76, dx:62, dy:122 },
  { count:0x00, dx: 0, dy:24 },
  { count:0x46, dx:-40, dy:118 },
  { count:0x52, dx:122, dy: 0 },
  { count:0x00, dx:40, dy:71 },
  { count:0xe5, dx:118, dy:-99 },
  { count:0x7a, dx: 0, dy: 0 },
  { count:0x38, dx:72, dy:-14 },
  { count:0x76, dx:-24, dy:122 },
  { count:0x00, dx: 0, dy:-128 },
  { count:0x4a, dx:-1, dy:118 },
  { count:0x2e, dx:123, dy: 0 },
  { count:0x00, dx:-128, dy:75 },
  { count:0x0c, dx:119, dy:-110 },
  { count:0x7b, dx: 0, dy: 0 },
  { count:0x48, dx:76, dy:25 },
  { count:0x77, dx:-45, dy:123 },
  { count:0x00, dx: 0, dy:-64 },
  { count:0x4c, dx:38, dy:119 },
  { count:0x0a, dx:124, dy: 0 },
  { count:0x00, dx:40, dy:77 },
  { count:0x33, dx:119, dy:60 },
  { count:0x7c, dx: 0, dy: 0 },
  { count:0x98, dx:77, dy:64 },
  { count:0x77, dx:105, dy:124 },
  { count:0x00, dx: 0, dy:104 },
  { count:0x4e, dx:77, dy:119 },
  { count:0xaa, dx:124, dy: 0 },
  { count:0x00, dx:104, dy:79 },
  { count:0x5a, dx:119, dy:-6 },
  { count:0x7c, dx: 0, dy: 0 },
  { count:0x78, dx:80, dy:103 },
  { count:0x77, dx:74, dy:125 },
  { count:0x00, dx: 0, dy:-8 },
  { count:0x50, dx:116, dy:119 },
  { count:0x6d, dx:125, dy: 0 },
  { count:0x00, dx:-40, dy:81 },
  { count:0x81, dx:119, dy:-82 },
  { count:0x7d, dx: 1, dy: 0 },
  { count:0xe0, dx:82, dy:-114 },
  { count:0x77, dx:-17, dy:125 },
  { count:0x01, dx: 0, dy:112 },
  { count:0x53, dx:-101, dy:119 },
  { count:0x17, dx:126, dy: 1 },
  { count:0x00, dx:-64, dy:83 },
  { count:0xb4, dx:119, dy:68 },
  { count:0x7e, dx: 1, dy: 0 },
  { count:0x10, dx:84, dy:-51 },
  { count:0x77, dx:103, dy:126 },
  { count:0x01, dx: 0, dy:-64 },
  { count:0x54, dx:-38, dy:119 },
  { count:0xa8, dx:126, dy: 1 },
  { count:0x00, dx:64, dy:85 },
  { count:0xe7, dx:119, dy:-33 },
  { count:0x7e, dx: 1, dy: 0 },
  { count:0x90, dx:85, dy:-6 },
  { count:0x77, dx: 2, dy:127 },
  { count:0x01, dx: 0, dy:64 },
  { count:0x56, dx:13, dy:120 },
  { count:0x2f, dx:127, dy: 1 },
  { count:0x00, dx:-112, dy:86 },
  { count:0x26, dx:120, dy:77 },
  { count:0x7f, dx: 1, dy: 0 },
  { count:0x40, dx:87, dy:63 },
  { count:0x78, dx:-114, dy:127 },
  { count:0x01, dx: 0, dy:-112 },
  { count:0x57, dx:82, dy:120 },
  { count:0xac, dx:127, dy: 1 },
  { count:0x00, dx:16, dy:88 },
  { count:0x65, dx:120, dy:-19 },
  { count:0x7f, dx: 1, dy: 0 },
  { count:0x60, dx:88, dy:114 },
  { count:0x78, dx:16, dy:-128 },
  { count:0x01, dx: 0, dy:16 },
  { count:0x59, dx:127, dy:120 },
  { count:0x47, dx:-128, dy: 1 },
  { count:0x00, dx:-64, dy:89 },
  { count:0x8c, dx:120, dy:-125 },
  { count:0x80, dx: 1, dy: 0 },
  { count:0xd0, dx:90, dy:-103 },
  { count:0x78, dx:-50, dy:-128 },
  { count:0x01, dx: 0, dy:-128 },
  { count:0x5b, dx:-90, dy:120 },
  { count:0xf6, dx:-128, dy: 1 },
  { count:0x00, dx:48, dy:92 },
  { count:0xb3, dx:120, dy:30 },
  { count:0x81, dx: 1, dy: 0 },
  { count:0x0a, dx:93, dy:-64 },
  { count:0x78, dx:85, dy:-127 },
  { count:0x01, dx: 0, dy:106 },
  { count:0x5d, dx:-51, dy:120 },
  { count:0x82, dx:-127, dy: 1 },
  { count:0x00, dx:74, dy:94 },
  { count:0xda, dx:120, dy:-41 },
  { count:0x81, dx: 1, dy: 0 },
  { count:0x9a, dx:94, dy:-25 },
  { count:0x78, dx:-6, dy:-127 },
  { count:0x01, dx: 0, dy:122 },
  { count:0x5f, dx:-12, dy:120 },
  { count:0x54, dx:-126, dy: 1 },
  { count:0x00, dx:-54, dy:95 },
  { count:0x01, dx:121, dy:-127 },
  { count:0x82, dx: 1, dy: 0 },
  { count:0xaa, dx:96, dy:14 },
  { count:0x79, dx:-52, dy:-126 },
  { count:0x01, dx: 0, dy:-6 },
  { count:0x60, dx:27, dy:121 },
  { count:0xea, dx:-126, dy: 1 },
  { count:0x00, dx:-38, dy:97 },
  { count:0x28, dx:121, dy:63 },
  { count:0x83, dx: 0, dy:24 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x00, dx: 1, dy:56 },
  { count:0x1a, dx:117, dy:24 },
  { count:0x00, dx:-1, dy: 0 },
  { count:0x18, dx:18, dy:117 },
  { count:0x38, dx: 0, dy: 1 },
  { count:0x68, dx:34, dy:117 },
  { count:0x20, dx: 0, dy:-1 },
  { count:0x00, dx:32, dy:26 },
  { count:0x75, dx:104, dy: 0 },
  { count:0x01, dx:24, dy:42 },
  { count:0x75, dx:24, dy: 0 },
  { count:0xff, dx: 0, dy:24 },
  { count:0x22, dx:117, dy:24 },
  { count:0x00, dx: 1, dy:-128 },
  { count:0x32, dx:117, dy:24 },
  { count:0x00, dx:-1, dy: 0 },
  { count:0x18, dx:42, dy:117 },
  { count:0x80, dx: 0, dy: 1 },
  { count:0x50, dx:58, dy:117 },
  { count:0x18, dx: 0, dy:-1 },
  { count:0x00, dx:24, dy:50 },
  { count:0x75, dx:80, dy: 0 },
  { count:0x01, dx:32, dy:66 },
  { count:0x75, dx:-128, dy: 0 },
  { count:0xff, dx: 1, dy:24 },
  { count:0x4a, dx:117, dy:-128 },
  { count:0x00, dx: 0, dy:-128 },
  { count:0x3a, dx:117, dy:32 },
  { count:0x00, dx:-1, dy: 1 },
  { count:0x18, dx:82, dy:117 },
  { count:0x18, dx: 0, dy: 0 },
  { count:0x80, dx:66, dy:117 },
  { count:0x18, dx: 0, dy:-1 },
  { count:0x00, dx:24, dy:74 },
  { count:0x75, dx:24, dy: 0 },
  { count:0x01, dx:-128, dy:-1 },
  { count:0x00, dx: 0, dy: 0 },
  { count:0xff, dx: 1, dy:24 },
  { count:0x62, dx:117, dy:96 },
  { count:0x00, dx: 0, dy:120 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x00, dx:-1, dy: 1 },
  { count:0x18, dx:106, dy:117 },
  { count:0x30, dx: 0, dy: 0 },
  { count:0x60, dx:90, dy:117 },
  { count:0x18, dx: 0, dy:-1 },
  { count:0x01, dx:24, dy:114 },
  { count:0x75, dx:48, dy: 0 },
  { count:0x00, dx:48, dy:98 },
  { count:0x75, dx:24, dy: 0 },
  { count:0xff, dx: 1, dy:48 },
  { count:0x7a, dx:117, dy:24 },
  { count:0x00, dx: 0, dy:48 },
  { count:0x6a, dx:117, dy:24 },
  { count:0x00, dx:-1, dy: 0 },
  { count:0x18, dx:114, dy:117 },
  { count:0x30, dx: 0, dy: 1 },
  { count:0x30, dx:-126, dy:117 },
  { count:0x18, dx: 0, dy:-1 },
  { count:0x00, dx:24, dy:122 },
  { count:0x75, dx:48, dy: 0 },
  { count:0x01, dx:96, dy:-118 },
  { count:0x75, dx:24, dy: 0 },
  { count:0xff, dx: 0, dy:24 },
  { count:0x82, dx:117, dy:96 },
  { count:0x00, dx: 1, dy:120 },
  { count:0x92, dx:117, dy:-128 },
  { count:0x00, dx:-1, dy: 1 },
  { count:0x18, dx:-102, dy:117 },
  { count:0x18, dx: 0, dy: 0 },
  { count:0x80, dx:-118, dy:117 },
  { count:0x78, dx: 0, dy:-1 },
  { count:0x00, dx:24, dy:-110 },
  { count:0x75, dx:24, dy: 0 },
  { count:0x01, dx:56, dy:-86 },
  { count:0x75, dx:104, dy: 0 },
  { count:0xff, dx: 0, dy:24 },
  { count:0x9a, dx:117, dy:56 },
  { count:0x00, dx: 1, dy:104 },
  { count:0xaa, dx:117, dy:104 },
  { count:0x00, dx:-1, dy: 1 },
  { count:0x18, dx:-1, dy: 0 },
  { count:0x00, dx: 0, dy: 0 },
  { count:0x68, dx:-94, dy:117 },
  { count:0x68, dx: 0, dy:-1 },
  { count:0x00, dx:32, dy:-1 },
  { count:0x00, dx: 0, dy: 0 },
  { count:0x01, dx:64, dy:-70 },
  { count:0x75, dx:24, dy: 0 },
  { count:0xff, dx: 0, dy:24 },
  { count:0xb2, dx:117, dy:64 },
  { count:0x00, dx: 1, dy:24 },
  { count:0xc2, dx:117, dy:24 },
  { count:0x00, dx: 0, dy:32 },
  { count:0xc2, dx:117, dy:24 },
  { count:0x00, dx: 1, dy:32 },
  { count:0xc2, dx:117, dy:32 },
  { count:0x00, dx:-1, dy: 1 },
  { count:0x18, dx:-70, dy:117 },
  { count:0x20, dx: 0, dy: 0 },
  { count:0x18, dx:-70, dy:117 },
  { count:0x18, dx: 0, dy: 1 },
  { count:0x20, dx:-54, dy:117 },
  { count:0x20, dx: 0, dy: 0 },
  { count:0x20, dx:-70, dy:117 },
  { count:0x20, dx: 0, dy:-1 },
  { count:0x00, dx:32, dy:-62 },
  { count:0x75, dx:32, dy: 0 },
  { count:0x01, dx:80, dy:-46 },
  { count:0x75, dx:24, dy: 0 },
  { count:0xff, dx: 0, dy:24 },
  { count:0xca, dx:117, dy:80 },
  { count:0x00, dx: 1, dy:56 },
  { count:0xda, dx:117, dy:24 },
  { count:0x00, dx:-1, dy: 0 },
  { count:0x18, dx:-46, dy:117 },
  { count:0x38, dx: 0, dy: 1 },
  { count:0x18, dx:-46, dy:117 },
  { count:0x20, dx: 0, dy: 1 },
  { count:0x20, dx:-30, dy:117 },
  { count:0x18, dx: 0, dy:-1 },
  { count:0x00, dx:24, dy:-38 },
  { count:0x75, dx:32, dy: 0 },
  { count:0x01, dx:72, dy:-22 },
  { count:0x75, dx:32, dy: 0 },
  { count:0x01, dx:80, dy:-38 },
  { count:0x75, dx:32, dy: 0 },
  { count:0xff, dx: 1, dy:24 },
  { count:0xea, dx:117, dy:24 },
  { count:0x00, dx: 0, dy:24 },
  { count:0xea, dx:117, dy:24 },
  { count:0x00, dx: 0, dy:32 },
  { count:0xe2, dx:117, dy:72 },
  { count:0x00, dx: 1, dy:32 },
  { count:0xf2, dx:117, dy:48 },
  { count:0x00, dx:-1, dy: 0 },
  { count:0x18, dx:-30, dy:117 },
  { count:0x18, dx: 0, dy: 0 },
  { count:0x30, dx:-22, dy:117 },
  { count:0x20, dx: 0, dy: 1 },
  { count:0x48, dx:-6, dy:117 },
  { count:0x20, dx: 0, dy: 1 },
  { count:0x50, dx:-38, dy:117 },
  { count:0x20, dx: 0, dy:-1 },
  { count:0x01, dx:24, dy:-6 },
  { count:0x75, dx:24, dy: 0 },
  { count:0x00, dx:32, dy:-14 },
  { count:0x75, dx:72, dy: 0 },
  { count:0x01, dx:32, dy: 2 },
  { count:0x76, dx:24, dy: 0 },
  { count:0xff, dx: 0, dy:24 },
  { count:0xfa, dx:117, dy:32 },
  { count:0x00, dx: 1, dy:24 },
  { count:0xca, dx:117, dy:24 },
  { count:0x00, dx: 1, dy:56 },
  { count:0x0a, dx:118, dy:32 },
  { count:0x00, dx:-1, dy: 0 },
  { count:0x20, dx: 2, dy:118 },
  { count:0x38, dx: 0, dy: 1 },
  { count:0x20, dx:18, dy:118 },
  { count:0x50, dx: 0, dy:-1 },
  { count:0x01, dx:24, dy:26 },
  { count:0x76, dx:80, dy: 0 },
  { count:0x00, dx:80, dy:10 },
  { count:0x76, dx:32, dy: 0 },
  { count:0xff, dx: 1, dy:24 },
  { count:0x22, dx:118, dy:24 },
  { count:0x00, dx: 0, dy:80 },
  { count:0x12, dx:118, dy:24 },
  { count:0x00, dx:-1, dy: 0 },
  { count:0x18, dx:26, dy:118 },
  { count:0x18, dx: 0, dy: 1 },
  { count:0x80, dx:42, dy:118 },
  { count:0x50, dx: 0, dy:-1 },
  { count:0x01, dx:24, dy:50 },
  { count:0x76, dx:80, dy: 0 },
  { count:0x00, dx:80, dy:34 },
  { count:0x76, dx:-128, dy: 0 },
  { count:0xff, dx: 1, dy:24 },
  { count:0x3a, dx:118, dy:24 },
  { count:0x00, dx: 0, dy:80 },
  { count:0x2a, dx:118, dy:24 },
  { count:0x00, dx:-1, dy: 0 },
  { count:0x18, dx:50, dy:118 },
  { count:0x18, dx: 0, dy: 1 },
  { count:0x50, dx:-1, dy: 0 },
  { count:0x00, dx: 0, dy:-1 },
  { count:0x00, dx:32, dy:-1 },
  { count:0x00, dx: 0, dy: 0 },
  { count:0x01, dx:40, dy:74 },
  { count:0x76, dx:104, dy: 0 },
  { count:0xff, dx: 1, dy:24 },
  { count:0x52, dx:118, dy:24 },
  { count:0x00, dx: 0, dy:104 },
  { count:0x42, dx:118, dy:40 },
  { count:0x00, dx:-1, dy: 0 },
  { count:0x18, dx:74, dy:118 },
  { count:0x18, dx: 0, dy: 1 },
  { count:0x20, dx:90, dy:118 },
  { count:0x18, dx: 0, dy:-1 },
  { count:0x00, dx:24, dy:82 },
  { count:0x76, dx:32, dy: 0 },
  { count:0x01, dx:104, dy:98 },
  { count:0x76, dx:24, dy: 0 },
  { count:0xff, dx: 0, dy:24 },
  { count:0x5a, dx:118, dy:104 },
  { count:0x00, dx: 1, dy:24 },
  { count:0x6a, dx:118, dy:104 },
  { count:0x00, dx:-1, dy: 1 },
  { count:0x18, dx:114, dy:118 },
  { count:0x20, dx: 0, dy: 0 },
  { count:0x68, dx:98, dy:118 },
  { count:0x18, dx: 0, dy:-1 },
  { count:0x01, dx:24, dy:122 },
  { count:0x76, dx:24, dy: 0 },
  { count:0x00, dx:32, dy:106 },
  { count:0x76, dx:24, dy: 0 },
  { count:0xff, dx: 0, dy:24 },
  { count:0x72, dx:118, dy:24 },
  { count:0x00, dx: 1, dy:96 },
  { count:0x82, dx:118, dy:32 },
  { count:0x00, dx:-1, dy: 0 },
  { count:0x20, dx:122, dy:118 },
  { count:0x60, dx: 0, dy: 1 },
  { count:0x24, dx:-1, dy: 0 },
  { count:0x00, dx: 0, dy:-1 },
  { count:0x18, dx:22, dy: 0 },
  { count:0x08, dx: 8, dy:24 },
  { count:0x2a, dx:-120, dy: 1 },
  { count:0x28, dx:56, dy: 4 },
  { count:0xf0, dx:21, dy:41 },
  { count:0x38, dx:23, dy: 1 },
  { count:0xe0, dx:-32, dy:-1 },
  { count:0x00, dx: 0, dy: 0 },
  { count:0x00, dx:24, dy:18 },
  { count:0x00, dx:-59, dy: 0 },
  { count:0x18, dx:25, dy:-120 },
  { count:0x95, dx:-61, dy:32 },
  { count:0x04, dx: 0, dy:101 },
  { count:0x71, dx:40, dy: 4 },
  { count:0xf0, dx:-123, dy:-126 },
  { count:0x30, dx: 4, dy: 0 },
  { count:0x45, dx:96, dy:56 },
  { count:0x19, dx:-120, dy:17 },
  { count:0x63, dx:72, dy:18 },
  { count:0x00, dx:77, dy: 0 },
  { count:0x60, dx:27, dy:-120 },
  { count:0xc2, dx:-62, dy:104 },
  { count:0x04, dx:-16, dy:-75 },
  { count:0x61, dx:104, dy:25 },
  { count:0x88, dx:17, dy:34 },
  { count:0x68, dx:18, dy: 0 },
  { count:0x55, dx: 0, dy:-1 },
  { count:0x00, dx: 0, dy: 0 },
  { count:0x00, dx:24, dy: 5 },
  { count:0x00, dx:73, dy: 3 },
  { count:0x18, dx: 5, dy:-16 },
  { count:0xc1, dx: 1, dy:24 },
  { count:0x06, dx: 0, dy:-119 },
  { count:0x00, dx:32, dy:22 },
  { count:0x01, dx:36, dy:36 },
  { count:0x20, dx:23, dy: 1 },
  { count:0xc4, dx:-60, dy:32 },
  { count:0x12, dx: 0, dy:117 },
  { count:0x00, dx:-1, dy: 0 },
  { count:0x00, dx: 0, dy: 0 },
  { count:0x18, dx:22, dy: 0 },
  { count:0x00, dx: 0, dy:24 },
  { count:0x04, dx: 0, dy:-127 },
  { count:0x40, dx:24, dy:17 },
  { count:0x00, dx:-103, dy: 0 },
  { count:0x38, dx:47, dy:-127 },
  { count:0x2d, dx:-115, dy:56 },
  { count:0x1b, dx:-120, dy:37 },
  { count:0x25, dx:64, dy:45 },
  { count:0x8c, dx:114, dy:116 },
  { count:0x40, dx:45, dy:-114 },
  { count:0x8a, dx:116, dy:72 },
  { count:0x2b, dx:-4, dy:105 },
  { count:0x69, dx:80, dy: 4 },
  { count:0x00, dx:-127, dy:40 },
  { count:0x50, dx:25, dy:-120 },
  { count:0x11, dx:64, dy:96 },
  { count:0x12, dx: 0, dy:85 },
  { count:0x00, dx:104, dy:44 },
  { count:0x1f, dx:-122, dy:-108 },
  { count:0x78, dx:46, dy:21 },
  { count:0x7a, dx:106, dy:120 },
  { count:0x2e, dx:21, dy:-118 },
  { count:0x7a, dx:-128, dy:23 },
  { count:0x01, dx:-32, dy:-32 },
  { count:0x80, dx:18, dy: 0 },
  { count:0x35, dx: 0, dy:-128 },
  { count:0x04, dx:-16, dy:53 },
  { count:0x61, dx:-128, dy: 4 },
  { count:0x00, dx:-123, dy:48 },
  { count:0xff, dx: 0, dy: 0 },
  { count:0x00, dx: 0, dy:24 },
  { count:0x12, dx: 0, dy:-82 },
  { count:0x00, dx:48, dy:25 },
  { count:0x88, dx:21, dy:-124 },
  { count:0x38, dx:49, dy:-116 },
  { count:0x80, dx:-92, dy:64 },
  { count:0x10, dx: 0, dy:13 },
  { count:0x00, dx:64, dy: 4 },
  { count:0xf0, dx:85, dy:96 },
  { count:0x48, dx:25, dy:72 },
  { count:0x15, dx:-60, dy:72 },
  { count:0x04, dx: 0, dy:-123 },
  { count:0x40, dx:72, dy: 4 },
  { count:0x00, dx:117, dy:56 },
  { count:0x50, dx:46, dy:21 },
  { count:0xc6, dx:-74, dy:-1 },
  { count:0x00, dx: 0, dy: 0 },
  { count:0x00, dx:24, dy:37 },
  { count:0x84, dx:99, dy:-124 },
  { count:0x18, dx:37, dy:-124 },
  { count:0xa3, dx:64, dy:32 },
  { count:0x30, dx:-114, dy:-30 },
  { count:0x44, dx:-1, dy: 0 },
  { count:0x00, dx: 0, dy: 0 },
  { count:0x20, dx:16, dy: 0 },
  { count:0xa1, dx: 0, dy:40 },
  { count:0x48, dx:31, dy:98 },
  { count:0x80, dx:48, dy: 4 },
  { count:0x80, dx:69, dy:-128 },
  { count:0x30, dx:17, dy: 0 },
  { count:0x65, dx: 0, dy:56 },
  { count:0x1a, dx:-120, dy:-27 },
  { count:0x84, dx:64, dy: 5 },
  { count:0x00, dx:101, dy: 3 },
  { count:0x50, dx:25, dy:-120 },
  { count:0x11, dx:32, dy:80 },
  { count:0x05, dx:-16, dy:33 },
  { count:0x07, dx:88, dy: 5 },
  { count:0x00, dx:-127, dy: 5 },
  { count:0x68, dx: 4, dy: 0 },
  { count:0xa5, dx:64, dy:112 },
  { count:0x12, dx: 0, dy:-51 },
  { count:0x00, dx:112, dy:25 },
  { count:0x88, dx:21, dy:100 },
  { count:0x78, dx: 4, dy:-16 },
  { count:0x45, dx:96, dy:-128 },
  { count:0x04, dx:-16, dy:69 },
  { count:0x80, dx:-1, dy: 0 },
  { count:0x00, dx: 0, dy: 0 },
  { count:0x18, dx:44, dy:31 },
  { count:0xe2, dx:-64, dy:24 },
  { count:0x19, dx:-120, dy:21 },
  { count:0x24, dx:40, dy:17 },
  { count:0x00, dx:-59, dy: 0 },
  { count:0x28, dx:26, dy:-120 },
  { count:0xd1, dx:32, dy:56 },
  { count:0x04, dx: 0, dy:33 },
  { count:0x70, dx:64, dy: 4 },
  { count:0xf0, dx:-127, dy:96 },
  { count:0x40, dx:27, dy:-120 },
  { count:0x25, dx:36, dy:80 },
  { count:0x12, dx: 0, dy:33 },
  { count:0x00, dx:80, dy:25 },
  { count:0x88, dx:17, dy:96 },
  { count:0x60, dx:26, dy:-120 },
  { count:0xe1, dx:-96, dy:96 },
  { count:0x19, dx:-120, dy:21 },
  { count:0xc4, dx:104, dy: 4 },
  { count:0x00, dx:33, dy:96 },
  { count:0x70, dx:25, dy:-120 },
  { count:0x15, dx:-124, dy:120 },
  { count:0x05, dx: 0, dy:69 },
  { count:0x00, dx:-1, dy: 0 },
  { count:0x00, dx: 0, dy: 0 },
  { count:0x18, dx:39, dy:-120 },
  { count:0x62, dx:96, dy:24 },
  { count:0x1b, dx:-120, dy:37 },
  { count:0x24, dx:24, dy:27 },
  { count:0x88, dx:-123, dy:-124 },
  { count:0x30, dx:26, dy:-120 },
  { count:0xe1, dx:64, dy:48 },
  { count:0x19, dx:-120, dy:17 },
  { count:0x40, dx:56, dy: 4 },
  { count:0xf0, dx:85, dy:96 },
  { count:0x58, dx:27, dy:-120 },
  { count:0x81, dx:-128, dy:88 },
  { count:0x04, dx:-16, dy:-123 },
  { count:0x40, dx:104, dy:39 },
  { count:0x88, dx:98, dy:96 },
  { count:0x68, dx:18, dy: 0 },
  { count:0x25, dx: 0, dy:120 },
  { count:0x1a, dx:-120, dy:-31 },
  { count:0x00, dx:-128, dy:44 },
  { count:0x1f, dx:-124, dy:-128 },
  { count:0x80, dx:44, dy:29 },
  { count:0xe2, dx:-64, dy:-1 },
  { count:0x00, dx: 0, dy: 0 },
  { count:0x00, dx:24, dy:23 },
  { count:0x01, dx:-32, dy:-32 },
];

const ENT_NBR_MVSTEP = ent_mvstep.length;
