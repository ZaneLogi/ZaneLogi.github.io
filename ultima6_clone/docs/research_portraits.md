# Research: U6 conversation portraits

**Status:** decoded 2026-06-05 for the I-12 dialog-window portrait
pipeline. Source read end-to-end: the loader `C_2FC1_1C19`
(`seg_2FC1.c:734-779`), its status-panel caller `C_27A1_02D9`
(`seg_27a1.c:168-249`), and the two conversation-VM call sites
(`seg_1703.c:932`, `seg_1703.c:1094`). Cross-validated against the file-
format tech doc `../ultima6/doc/u6tech.txt` §"Portraits"/"Libraries"/
"LZW-compressed Files"/"Palettes", and against the legacy port (which
does **not** decode portraits — see §"Legacy port"). Where the tech doc
and the source disagree, **the source wins** (per `../CLAUDE.md`
§"Tech-docs caveat").

Citations are relative: `seg_XXXX.c:NNN` in the u6-decompiled clone
(absolute path is per-PC, see `../CLAUDE.md` §"Source of truth"),
`../ultima6/...` for the legacy port + its tech docs, and bare paths
(`assets/...`) for this clone.

**Verified live 2026-06-05** (preview-eval on real Britain data): the full
chain works — `portrait.a` = 98 entries, `portrait.b` = 96, offset tables
ascending; every sampled block LZW-decodes to exactly 3584 = 56×64 with
in-range palette indices; 8 portraits rendered correctly through `u6pal`
(`a[4]` = Lord British). The `a[0]` edge resolved (see §"Open / deferred").

## Headline

A conversation portrait is a **56×64, one-byte-per-pixel indexed
bitmap**, LZW-compressed, stored as one object in a `lib_32` library
file (`portrait.a` / `portrait.b` / `portrait.z`). The pixel bytes
index the **active in-game palette `u6pal`** — there is **no dedicated
portrait palette** (correcting the I-12 design note). Both the LZW
decoder and the `u6pal` loader already exist in this clone, so the I-12
decoder is small: read the offset table → slice block N →
`decompressCompressedFile` → 3584 indices → `u6pal` → RGBA.

## File format

### Container — plain `lib_32`

`portrait.a/.b/.z` are each a **`lib_32`** (`u6tech.txt` §"Libraries",
confirmed by the loader's read pattern):

- A flat table of **little-endian `uint32` offsets at file offset 0**,
  one per object, each pointing at that object's data within the file.
  The loader reads entry N directly at byte `N*4`
  (`OSI_read(di, objNum<<2, 4, &bp_04)`, `seg_2FC1.c:773`) — no leading
  `file_size` field, so this is `lib_32`, **not** `s_lib_32`.
- Offsets are ascending, so the object count is derivable as
  `offsets[0] / 4` (the first object's data begins right after the
  table). Bounds-checking only; the source itself never computes the
  count — it trusts the index.
- Object N spans `[offsets[N], offsets[N+1])` (last object → EOF).

(Contrast `converse.a`, a `lib_32` whose first two offsets are null
pointers — `research_conversation_vm.md` §"Data layer". Portrait files
have no such special-casing.)

### Object — standard LZW-compressed block

Each object is a U6 compressed file (`u6tech.txt` §"LZW-compressed
Files"): a 4-byte little-endian **uncompressed-size header** followed by
a 9-bit-code LZW stream (begins with the `0x100` dictionary-reset code,
ends with `0x101`). The decompressor reads the size header itself
(`decompress(di, bp_04, ...)`, `seg_2FC1.c:774`). For portraits the
uncompressed size is always `0xE00` = 3584 = 56×64.

### Pixels

3584 bytes = a 56×64 image, **one byte per pixel = a palette index**
(`u6tech.txt` §"Portraits"). The loader stamps `width=56, height=64`
onto the pixmap (`seg_2FC1.c:776-777`) and blits it (`GR_18`).

## objNum → file + block index

From `C_2FC1_1C19` (`seg_2FC1.c:734-779`). Input `objNum` is the
character's object/NPC number — the same 1-based NPC numbering the clone
uses for actor slots (NPC 1 = the Avatar).

| Case | File | Block index |
|---|---|---|
| `objNum == 1` (Avatar) | `portrait.z` | `D_2CCB - 1` (char-creation portrait choice; `< 0` ⇒ no portrait, return) |
| otherwise, after `objNum--` (1-based→0-based): index `≥ 0x62` | `portrait.b` | `index - 0x62` |
| otherwise: index `< 0x62` | `portrait.a` | `index` |

Wrinkles:

- **`objNum--` skips zero:** `if(objNum) objNum--;` — `objNum 0` stays 0.
  Real NPCs are 1-based, so `portrait.a[0]`'s occupant is an edge worth
  eyeballing against real data at impl time (see §"Open / deferred").
- **Generic NPC types remap first** (`seg_2FC1.c:740-751`): before the
  split, Wisp `OBJ_175`→`objNum 0xc0`, Guard `OBJ_17E`→`0xc1`, Gargoyle
  `OBJ_16B`→`0xc2`. These are `≥ 0xe0` typed objects substituted to a
  fixed numeric portrait id, which then falls through the normal split
  (landing in `portrait.b`).
- **Shrines / statues** don't reach this routine with their objNum:
  the caller `C_27A1_02D9` passes `GetQual(objNum)` as the portrait
  number for `OBJ_189` (shrine) and `OBJ_18D/18E/18F` (statues)
  (`seg_27a1.c:220-221,243`). So a talkable shrine/statue's portrait =
  its quality value indexed into `portrait.a`.

## Palette — uses `u6pal`, NOT a dedicated portrait palette

**The I-12 design note's "portraits have their own palette" is wrong.**
Two independent confirmations:

1. **The loader loads no palette.** `C_2FC1_1C19` decompresses indexed
   pixels straight into a pixmap and blits via `GR_18`
   (`seg_2FC1.c:774-778`); it never touches a palette. The bytes are
   indices into whatever VGA palette is currently active.
2. **The tech doc names no portrait palette** (`u6tech.txt`
   §"Palettes"): only the in-game `u6pal` and the cut-scene
   `palettes.int` (explicitly "startup, introduction, character
   creation" — not conversation). Conversation is in-game, so the active
   palette is `u6pal`.

`u6pal` is `256×3` bytes, 6-bit components (left-shift each by 2 for
8-bit RGB) — already loaded by this clone (`assets/palette.js`). Portrait
indices map through it directly.

## Source call graph (for I-13 wiring later)

The portrait is shown twice in a conversation, both via the status-panel
composer `C_27A1_02D9` → the loader `C_2FC1_1C19`:

- **On talk start:** `TalkDriver` calls `C_27A1_02D9(npc)` for the
  initial portrait + the "You see …" description (`seg_1703.c:1093-1095`).
- **`OP_SHOW_CONVERSE` opcode `0xbf`** (the VM's swap-the-face op): the
  conversation can re-show any character's portrait mid-script
  (`seg_1703.c:931-932`, `C_27A1_02D9(mk_npcnum(...))`). The legacy
  port's opcode table names this `PORTRAIT = 0xbf`
  (`../ultima6/u6opcode.js:73`).

`C_27A1_02D9` (`seg_27a1.c:168`) is the source's **status-panel**
composer: it draws the portrait + equipment + inventory into the in-game
right panel (region `{168,8,311,103}`, `seg_0C9C.c:99`). This is U6
reusing the status panel for the portrait — i.e. the "Design B
(repurpose the Fixed-Shell)" the I-12 note **rejected** in favor of a
self-contained modal. So the clone does **not** port `C_27A1_02D9`; the
dialog window calls the *loader* equivalent directly and places the
bitmap in its own region.

## Legacy port (`../ultima6/`) — not implemented

The only `PORTRAIT` references are the opcode constant
(`../ultima6/u6opcode.js:73`, `0xbf`) and the conversation VM, which
emits a text line `SHOW PORTRAIT N` (`../ultima6/script.js:272-274`) and
otherwise `skipEvalBlock`s the opcode (`script.js:1292-1293`). No image
decode or render exists. This clone writes a fresh decoder — but reuses
the existing LZW + palette machinery (below).

## Clone port plan (I-12)

**Reuse — no new LZW, no new palette, no portrait palette:**

- `assets/lzw.js` → `decompressCompressedFile(bytes)` already validates
  the 4-byte size header and LZW-decodes (same call the tile loader uses
  for `maptiles.vga`, `assets/tiles.js:24`). Each portrait block is
  exactly this format.
- `assets/palette.js` → the `u6pal` loader already in use.
- Offset-table slicing — pattern-match `assets/objblk.js`'s dword reads.

**Decoder recipe (per portrait):**

1. Read the `lib_32` offset table from the chosen file (`uint32`-LE at
   `index*4`); `count = offsets[0]/4` for bounds-checking.
2. `block = file.subarray(offsets[N], offsets[N+1])` (or to EOF for the
   last; slicing to EOF also works — `lzwDecode` stops at the `0x101`
   END code, ignoring trailing bytes).
3. `pixels = decompressCompressedFile(block)` → 3584 bytes.
4. Map each index through `u6pal` → an `ImageData`/offscreen `<canvas>`
   (56×64), built with `putImageData` (**synchronous** — no async flash
   when the window opens; the approach `view/ui_icons.js` uses for atlas
   icons, just bigger).

**Lazy-cache (the I-12 note's plan, unchanged):** load the raw
`portrait.*` file bytes at boot (BYO/IndexedDB, undecoded); decode a
given `npcId` on **first show**, cache the resulting bitmap in a
`Map<npcId, bitmap>`; every later show is a cache hit. This is the
project's **first lazy-decoded asset** (tiles/map/anim all decode
eagerly at boot) — justified by ~200 portraits, only a handful seen per
session. No eviction (a 56×64 bitmap is trivial). Expose a settable slot
`setPortrait(id)` (decode ANY id, default the talk target) so
`OP_SHOW_CONVERSE` swaps faces for free at I-13.

## Open / deferred

- **`portrait.a[0]` edge — RESOLVED** (verified 2026-06-05): `a[0]` is a
  **horse/mount portrait, not an NPC**. The `objNum 0` no-decrement case
  lands here; real NPCs (`objNum ≥ 2`) map to `a[objNum-1]`, so the named
  humans begin at `a[1]` (e.g. `a[4]` rendered as Lord British). No
  off-by-one to fix — the decrement is correct; `a[0]` is simply the
  generic-creature slot the avatar (`objNum 1`, redirected to
  `portrait.z`) would otherwise occupy.
- **Avatar face — `portrait.z` + `D_2CCB`** — needed only to show the
  *Avatar's own* portrait (e.g. a future self/`OP_SHOW_CONVERSE` case).
  `D_2CCB` is the char-creation portrait choice, which comes from the
  save. The I-12 talk target is always an NPC (the self-check refuses
  talking to yourself), so `portrait.z` is deferrable.
- **Generic-type portraits** (Wisp/Guard/Gargoyle → `0xc0/0xc1/0xc2`)
  and **shrine/statue via `GetQual`** — register when those talk targets
  matter; the index rules are recorded above.

## Cross-references

- `research_conversation_vm.md` — the conversation VM that drives portrait
  display (`OP_SHOW_CONVERSE` `0xbf`); `converse.a/.b` share the
  `lib_32`-of-LZW pattern (`LoadConversation`, `seg_2FC1.c:783-834`).
- `research_object_interaction.md` §"Talk" — the I-11 talk trigger; the
  `openConversation(target)` seam I-12 reopens.
- `research_save_load.md` — LZW + library file conventions.
- `progress.md` §"I-12 scope" (to be written) — the dialog window that
  consumes this.
