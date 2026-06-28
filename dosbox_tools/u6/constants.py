"""U6 in-memory layout constants -- the DGROUP/DS-relative offsets, bit-field
masks, area/terrain flags and direction tables, extracted verbatim from the
former dosbox_u6_server.py top block. Pure data, no runtime refs. The spec is
u6-decompiled; re-derive before relying.
"""

# ----------------------------------------------------------------------------
# Ultima VI object model -- parallel arrays in DGROUP (offsets from u6-decompiled
# u6.h), each indexed by object/NPC slot. NPCs 0..0xFF, world objects
# 0x100..0xCFF. The Avatar is roster[0], normally slot 1. These offsets are
# IN-SEGMENT and fixed; only DS (the segment base) varies per run.
# ----------------------------------------------------------------------------
U6_Names        = 0x3236   # 14 B/entry, indexed by PARTY SLOT (Names[0] = avatar)
U6_ObjStatus    = 0xA0AB   # 1 B/slot; CoordUse = &0x18
U6_ObjPos       = 0x6828   # 3 B/slot; LOCXYZ packed x10|y10|z4; else assoc = first 2 B (holder slot)
U6_ObjShapeType = 0x3548   # 2 B/slot; type = &0x3ff, frame = >>10
U6_Amount       = 0x4EE4   # 2 B/slot; quan = low byte, qual = high byte
U6_NPCStatus    = 0x9FAB   # 1 B/slot; creature status bits (PLRCONTROL 0x80, etc.) -- != ObjStatus
U6_MAX_SLOTS    = 0xD00    # NPCs 0..0xFF + world objects 0x100..0xCFF

# NPCStatus[] bit fields (u6.h:120-149), per actor slot < 0x100. Alignment lives
# in bits 0x60 and IS the engine's own threat signal: Is_ATKPLR -> attacks the
# player (hostile); Is_ATKMON -> attacks monsters (fights on the party's side).
U6_NPC_PARALYZED  = 0x02
U6_NPC_ASLEEP     = 0x04
U6_NPC_DEAD       = 0x10
U6_NPC_ATKPLR     = 0x20   # alignment: hostile to the player (an ENEMY)
U6_NPC_ATKMON     = 0x40   # alignment: hostile to monsters (an ally-side fighter)
U6_NPC_PLRCONTROL = 0x80   # player-controlled => a PARTY member (avatar swaps with it)
U6_NPC_INCAP      = U6_NPC_DEAD | U6_NPC_ASLEEP | U6_NPC_PARALYZED   # Isbis_0016
U6_NPCFLAG_DRAGGED = 0x10  # IsDraggedUnder (NPCFlag[i] & 0x10) -- disables the swap

_COORDUSE = {0: "LOCXYZ", 0x08: "CONTAINED", 0x10: "INVEN", 0x18: "EQUIP"}


# ----------------------------------------------------------------------------
# Party / control state -- whether the player drives the whole party as one
# (PARTY mode) or a single detached member (SOLO mode), and WHO is driven now.
# DGROUP globals from u6-decompiled (u6.h, D_2C4A.h, seg_0A33.c SetActive /
# SetPartyMode). Party[0] is always the avatar/leader.
# ----------------------------------------------------------------------------
U6_Party     = 0x3533   # unsigned char[]; party index -> object slot
U6_PartySize = 0x8E50   # unsigned char; number of party members
U6_Active    = 0x2C54   # unsigned char; party index the player drives now (Party[Active])
U6_SoloFlag  = 0x2CC3   # signed char (D_2CC3): < 0 => PARTY mode; >= 0 => SOLO mode (value == Active)
U6_InCombat  = 0x2CC2   # char (InCombat): nonzero => combat is active
U6_EnemiesNum = 0xEBFB  # int; count of hostiles engaged
COMBAT_LEASH = 8        # in combat, player moves are gated to Chebyshev<=8 of the combat centre
# Names[][14] @ U6_Names is indexed by PARTY index for roster names.


# ----------------------------------------------------------------------------
# Turn / input context -- what input the engine will accept RIGHT NOW. The game
# loop C_0A33_1CB4 (seg_0A33.c:1020) sets AllowMouseMov=1 immediately before its
# top-level CON_getch and =0 right after, so AllowMouseMov==1 UNIQUELY means
# "parked at the command prompt = your turn" (sub-prompts/conversation use their
# own getch). DOS keyboard input is BUFFERED, so a key sent in the wrong context
# isn't lost -- it's consumed in whatever state the engine reaches next (a command
# letter eaten as a sub-prompt's target, etc.); hence every send must be gated.
# ----------------------------------------------------------------------------
U6_AllowMouseMov = 0x04C4   # int; ==1 only while blocked at the top-level command getch
U6_SelectMode    = 0x0492   # unsigned char; nonzero => a command is awaiting a target
U6_MouseMode     = 0x04BE   # int; nonzero => mouse-driven UI mode (keyboard play wants 0)
U6_LineInput     = 0x049B   # int D_049B; ==1 only WHILE CON_gets reads a typed line
                            #   (seg_0C9C.c:1593/1626) -- i.e. the keyword prompt is live
U6_PromptCh      = 0x04D4   # int PromptCh; ==1 during a page-pause "press a key" getch
                            #   ('*' marker / screen-full, seg_0C9C.c:1698/1830), else 5
# (conversation state is U6_IsInConversation = 0x098B, defined in the talk section.)

# ----------------------------------------------------------------------------
# In-game clock + global state (DGROUP, DS-relative; D_2C4A.c). The U6 clock
# advances ~1 minute per turn/step (C_0A33_1355(1) in the move scheduler,
# seg_1E0F.c:2219); LOOK/TALK/USE pass 0 minutes (free). A month = 28 days.
# NPCs follow daily schedules keyed off Time_H, so the time of day decides
# where an NPC is. MapX/Y/Z = the map view centre (= the avatar's position).
# ----------------------------------------------------------------------------
U6_Time_M = 0x2C4C   # unsigned char; minutes (0-59)
U6_Time_H = 0x2C4D   # unsigned char; hour of day (0-23), save starts at 8
U6_Date_D = 0x2C4E   # unsigned char; day of month (1-28; a U6 month is 28 days)
U6_Date_M = 0x2C4F   # unsigned char; month (1-12)
U6_Date_Y = 0x2C50   # unsigned int (2 B); year
U6_KARMA  = 0x2C52   # unsigned char; party karma
U6_MapX   = 0x2C56   # int; map view centre X (= avatar world X)
U6_MapY   = 0x2C58   # int; map view centre Y
U6_MapZ   = 0x2C5A   # int; map view centre Z (level)


# ----------------------------------------------------------------------------
# Status-panel / inventory-UI state -- the "eyes" into the panel that the keyboard
# inventory-target route drives (USE/READY on a CARRIED item: <tab> into the panel,
# arrow to the item, Enter). All source-derived from BSS.ASM (the `;D_xxxx` layout +
# the `Selection`/`Equipment` declarations) and the .c `/*xxxx*/` offset annotations
# -- convention verified: SelectMode /*0492*/, MouseMode /*04BE*/, AllowMouseMov
# /*04C4*/ match the turn-gate offsets above.
# ----------------------------------------------------------------------------
U6_StatusDisplay = 0x04C0   # int; which status view is shown (CMD_90/91/92), seg_0C9C.c:39
U6_PanelChar     = 0x04B3   # int (D_04B3); party index whose panel is displayed
U6_PanelCol      = 0x0499   # char (D_0499); inventory-panel cursor column
U6_PanelRow      = 0x049A   # char (D_049A); inventory-panel cursor row
U6_InvScroll     = 0x07CE   # unsigned char (D_07CE); backpack scroll offset (paged by 4)
U6_VisBackpack   = 0xE70F   # int[12] (D_E70F); the visible backpack slots (4 col x 3 row)
U6_Equipment     = 0xE6E4   # int[8]; equipped object slots, indexed SLOT_HEAD..FEET (0..7)
U6_Sel_x         = 0xB6AF   # int; Selection.x  (u6.h: struct {int x,y,obj} @ B6AF/B6B1/B6B3)
U6_Sel_y         = 0xB6B1   # int; Selection.y
U6_Sel_obj       = 0xB6B3   # int; Selection.obj -- the committed target object slot
# Status-view modes (cmd.h CMD_9x). The panel must be INVENTORY (CMD_92) to target a
# carried item; F1-F8 select a member's view, '*' toggles PORTRAIT<->INVENTORY.
_PANEL_VIEW = {0x90: "PORTRAIT", 0x91: "PARTY", 0x92: "INVENTORY"}
U6_BACKPACK_COLS = 4        # backpack grid is 4 cols x 3 visible rows (C_155D_1267);
U6_BACKPACK_ROWS = 3        # visible index = row*4 + col, object = D_E70F[index]


# ----------------------------------------------------------------------------
# Character stats + item weight -- the inputs for "suit the party" gear decisions
# (u6.h, seg_2337.c GetStr/GetDex/GetInt, seg_155D.c STAT_GetEquipSlot). STREN/
# DEXTE/INTEL are direct DGROUP byte arrays per slot; Level/TypeWeight are far
# pointers. Equip slot is decided by an object's TILE id (BaseTile[type]+frame),
# not its type. Load caps: carry = STR*20 (seg_1944.c:1945), equip = STR*10
# (seg_155D.c:546); both comparable to TypeWeight[type].
# ----------------------------------------------------------------------------
U6_STREN = 0x8C4A           # unsigned char[]; Strength per slot (direct)
U6_DEXTE = 0x3316           # unsigned char[]; Dexterity per slot (direct)
U6_INTEL = 0x3433           # unsigned char[]; Intelligence per slot (direct)
U6_Level_ptr      = 0x8E4C  # far ptr -> Level[] (unsigned char per slot)
U6_TypeWeight_ptr = 0xB417  # far ptr -> TypeWeight[type] (unsigned char)
U6_EquipWeaponTbl = 0x07DD  # int[33] (D_07DD) stored DIRECTLY in DGROUP; RHND weapon TILE ids
CARRY_PER_STR = 20          # max carried weight = STR * 20
EQUIP_PER_STR = 10          # max readied weight = STR * 10

# Equip-slot index -> name (u6.h SLOT_*). STAT_GetEquipSlot returns one of these
# or -1 (not readyable); 8/9 are input slots resolved to a free hand/finger.
_EQUIP_SLOT_NAME = {0: "HEAD", 1: "NECK", 2: "RHND", 3: "RFNG", 4: "CHST",
                    5: "LHND", 6: "LFNG", 7: "FEET", 8: "2HND", 9: "RING"}


# ----------------------------------------------------------------------------
# Ultima VI conversation / "talk" engine -- DGROUP globals (offsets from the
# u6-decompiled seg_1703.c "talkdr" module, u6.h, BSS.ASM). On talk start the VM
# loads the current NPC's WHOLE script from converse.a into TalkBuf, then
# interprets it with Talk_PC as the program counter (PARSE_U8 == TalkBuf[Talk_PC++]).
# It prints text (OP_PRINTSTR) until an input opcode, then BLOCKS on CON_gets /
# CON_getch for the player's keyword -- so the conversation is turn-based by
# construction, and BOTH the NPC's text and the valid keyword branches live in
# TalkBuf (no screen scrape needed).
# ----------------------------------------------------------------------------
U6_IsInConversation = 0x098B   # 1 B; 1 while a conversation is active
U6_TalkBuf_ptr      = 0x4D50   # far ptr (off:2, seg:2) -> loaded script buffer
U6_TalkBuf_SIZE     = 0x2800   # TalkBuf allocation size (__MemAlloc, seg_0903.c)
U6_Talk_PC          = 0xE7AB   # 2 B; VM program counter = index into TalkBuf
U6_TalkInterloc     = 0xE796   # 2 words: [0]=interlocutor (active NPC#), [1]=locutor (party speaker)
U6_TalkInput        = 0xE732   # 0x32 B; player's last typed input (CON_gets buffer)
U6_TalkSavedPC      = 0xE7A7   # 4 B; D_E7A7 -- VM scratch save-PC for jumps (NOT the prompt PC)
U6_NpcName          = 0xE764   # up to ~50 B; current NPC name (D_E764), high-bit terminates
# Converse-VM variable tables + per-NPC flags, for decoding text/conditions:
U6_VarInt    = 0xB6E1   # int[36]; converse vars (#0-9 scratch, A-Z = 10-35). IF/expr operands.
U6_VarStr    = 0xB72D   # char *[36]; string vars -- NEAR ptrs (string at base+off), seg_1703.c
U6_TalkFlags = 0xB2EB   # unsigned char[]; per-NPC conversation flag byte (OP_TST/SET/CLR)
U6_HitPoints = 0x66E4   # unsigned char[]; per-slot HP (OP_WOUNDED, vs computed MaxHP)
OBJ_HORSE    = 0x1AF    # GetType == this => OP_HORSED true
POISONED_BIT = 0x10     # NPCStatus & 0x10 (OP_POISONNED)

# Conversation-VM opcodes where the VM blocks waiting for player input. The byte
# at TalkBuf[Talk_PC] being one of these means "the game is waiting for a reply".
_TALK_INPUT_OPS = {
    0xf7: "ASKTOP",    # free keyword via CON_gets -- the main "you say:" prompt
    0xf9: "GETSTR",    # read a string -> VarStr
    0xfb: "GETINT",    # read an integer -> VarInt
    0xfc: "GETDIGIT",  # read a single digit
    0xfa: "GETCHR",    # read a single char
    0xf8: "GET",       # menu of single keys, list terminated by OP_KEY (0xef)
    0xcb: "WAIT",      # wait for any key
}


# ----------------------------------------------------------------------------
# Map / navigation layout -- the local 40x40 "area" window + the tile-flag
# tables (u6.h, seg_101C.c GetTileAtXYZ). All DGROUP / DS-relative. Ground tiles
# are bytes 0-255; high tile ids are objects drawn on top (the object arrays).
#
# Passability is a faithful port of the engine's move-legality gate C_1E0F_000F
# (seg_1E0F.c:66) -- the function EVERY real step goes through (TryStraightMove
# @ :1421). For a cardinal step the verdict depends only on the destination cell
# + the mover, so the grid IS the per-step oracle. On foot the avatar is a plain
# land-walker, which collapses the gate to "passable ground AND no impassable
# object on the cell", with multi-tile-object spread + breakthrough overrides
# (see _build_grid). Actors (slot < 0x100) block too, but that half stays a
# separate dynamic layer (_actor_cells) so a transient NPC doesn't wall off a
# plan; movement-type (boat/horse/balloon) is Phase 2 (the branch skeleton is in
# place, its inputs hardwired to land-walker).
# ----------------------------------------------------------------------------
U6_AREA_W = 40
U6_AREA_H = 40
U6_WORLD_MASK = 0x3ff             # world is 1024x1024
U6_AreaTiles  = 0x8E51            # AREA_H*AREA_W bytes; ground tile per cell
U6_MapObjPtr  = 0xD8E7            # int[AREA_H][AREA_W]; per-cell TOP object slot (-1=none)
U6_AreaX      = 0xBBC8            # int; world X of the area-window origin
U6_AreaY      = 0xBBCA            # int; world Y of the area-window origin
U6_NPCFlag_ptr     = 0x4D4C       # far ptr -> NPCFlag[]; dir = NPCFlag[slot] & 7
U6_TerrainType_ptr = 0xB3EB       # far ptr -> TerrainType[tile] (u6.h); flags below
U6_TileFlag_ptr    = 0x8C46       # far ptr -> TileFlag[tile]  (u6.h); DoubleH/DoubleV below
U6_TileFlag2_ptr   = 0xB3EF       # far ptr -> D_B3EF[tile]    (u6.h); Br/Ig below
U6_BaseTile_ptr    = 0x6824       # far ptr -> BaseTile[type] (int16); tile = BaseTile[type]+frame

# TerrainType[tile] bits (u6.h). Low nibble = properties; high nibble feeds the
# engine path cost `(TerrainType>>4)+1`. Only IMPASS blocks the land-walker.
TERRAIN_WET    = 0x01
TERRAIN_IMPASS = 0x02
TERRAIN_WALL   = 0x04
TERRAIN_DAMAGE = 0x08
# TileFlag[tile] bits (u6.h): a multi-tile object's extent from its anchor.
TILE_DOUBLE_V  = 0x40             # object also covers the cell to its NORTH
TILE_DOUBLE_H  = 0x80             # object also covers the cell to its WEST
# D_B3EF[tile] bits (u6.h): land-walker passability overrides (seg_1E0F.c:142).
TILE2_BREAKTHROUGH = 0x04         # Br: enterable even over impassable terrain (bridges)
TILE2_IGNORE       = 0x10         # Ig: keep scanning -- the Br/match is non-definitive

_TILEFLAG_N = 0x800               # tile-flag tables span all 2048 tile ids
_BASETILE_N = 0x400               # BaseTile indexed by 10-bit object type

# Actor types that DON'T block movement (C_1E0F_000F c_04ed @ seg_1E0F.c:215:
# fields/effects you walk through); every other in-world actor blocks the avatar.
_PASSABLE_ACTOR_TYPES = frozenset({0x157, 0x162, 0x164, 0x165, 0x167})

# 4-connected movement (U6 arrow-key cardinals; diagonals deferred -- they need
# numpad keys + an 8-connected search, both unverified). step (dr,dc) -> labels.
_DIR_DELTAS = ((-1, 0), (1, 0), (0, -1), (0, 1))
_STEP_NAME = {(-1, 0): "n", (1, 0): "s", (0, -1): "w", (0, 1): "e"}
_STEP_ARROW = {(-1, 0): "up", (1, 0): "down", (0, -1): "left", (0, 1): "right"}

# door object types (shared by decode._door_at_tile and the USE result reader)
_U6_DOOR_TYPES = frozenset((0x129, 0x12a, 0x12b, 0x12c))

__all__ = [
    "U6_Names",
    "U6_ObjStatus",
    "U6_ObjPos",
    "U6_ObjShapeType",
    "U6_Amount",
    "U6_NPCStatus",
    "U6_MAX_SLOTS",
    "U6_NPC_PARALYZED",
    "U6_NPC_ASLEEP",
    "U6_NPC_DEAD",
    "U6_NPC_ATKPLR",
    "U6_NPC_ATKMON",
    "U6_NPC_PLRCONTROL",
    "U6_NPC_INCAP",
    "U6_NPCFLAG_DRAGGED",
    "_COORDUSE",
    "U6_Party",
    "U6_PartySize",
    "U6_Active",
    "U6_SoloFlag",
    "U6_InCombat",
    "U6_EnemiesNum",
    "COMBAT_LEASH",
    "U6_AllowMouseMov",
    "U6_SelectMode",
    "U6_MouseMode",
    "U6_LineInput",
    "U6_PromptCh",
    "U6_Time_M",
    "U6_Time_H",
    "U6_Date_D",
    "U6_Date_M",
    "U6_Date_Y",
    "U6_KARMA",
    "U6_MapX",
    "U6_MapY",
    "U6_MapZ",
    "U6_StatusDisplay",
    "U6_PanelChar",
    "U6_PanelCol",
    "U6_PanelRow",
    "U6_InvScroll",
    "U6_VisBackpack",
    "U6_Equipment",
    "U6_Sel_x",
    "U6_Sel_y",
    "U6_Sel_obj",
    "_PANEL_VIEW",
    "U6_BACKPACK_COLS",
    "U6_BACKPACK_ROWS",
    "U6_STREN",
    "U6_DEXTE",
    "U6_INTEL",
    "U6_Level_ptr",
    "U6_TypeWeight_ptr",
    "U6_EquipWeaponTbl",
    "CARRY_PER_STR",
    "EQUIP_PER_STR",
    "_EQUIP_SLOT_NAME",
    "U6_IsInConversation",
    "U6_TalkBuf_ptr",
    "U6_TalkBuf_SIZE",
    "U6_Talk_PC",
    "U6_TalkInterloc",
    "U6_TalkInput",
    "U6_TalkSavedPC",
    "U6_NpcName",
    "U6_VarInt",
    "U6_VarStr",
    "U6_TalkFlags",
    "U6_HitPoints",
    "OBJ_HORSE",
    "POISONED_BIT",
    "_TALK_INPUT_OPS",
    "U6_AREA_W",
    "U6_AREA_H",
    "U6_WORLD_MASK",
    "U6_AreaTiles",
    "U6_MapObjPtr",
    "U6_AreaX",
    "U6_AreaY",
    "U6_NPCFlag_ptr",
    "U6_TerrainType_ptr",
    "U6_TileFlag_ptr",
    "U6_TileFlag2_ptr",
    "U6_BaseTile_ptr",
    "TERRAIN_WET",
    "TERRAIN_IMPASS",
    "TERRAIN_WALL",
    "TERRAIN_DAMAGE",
    "TILE_DOUBLE_V",
    "TILE_DOUBLE_H",
    "TILE2_BREAKTHROUGH",
    "TILE2_IGNORE",
    "_TILEFLAG_N",
    "_BASETILE_N",
    "_PASSABLE_ACTOR_TYPES",
    "_DIR_DELTAS",
    "_STEP_NAME",
    "_STEP_ARROW",
    "_U6_DOOR_TYPES",
]
