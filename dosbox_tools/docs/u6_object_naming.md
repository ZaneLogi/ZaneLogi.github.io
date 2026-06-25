# U6 object naming — `LOOK.LZD` → `u6_look_names.py`

How the `dosbox-u6` tools turn a raw object into a human name ("club", "leather
helm", "dead body") for their result reports. This is the **result-reporting
subsystem** shared by the perception tools and the verb result read-backs in
`u6_verb_mechanism.md`; it is not a verb itself.

Source citations are `D:\tmp\u6-decompiled\SRC`.

---

## The engine's name lookup

`GetObjectString` (`seg_1184.c:1912`) → `GetTileString(TILE_FRAME(obj))`
(`seg_1184.c:1892`) → a name from **`LOOK.LZD`**, keyed by the object's **tile =
`BaseTile[type] + frame`**. Party members are special-cased to `Names[]`
(`:1921`).

`LOOK.LZD` is LZW-compressed and the game **re-decodes it into `ScratchBuf` on
every name lookup** (`:1899`). `ScratchBuf` is the *shared video scratch buffer*
(`__MemAlloc 0x7900`, `seg_0903.c:545`, reused for screen rendering), so **there
is no stable decoded name table in RAM to read** at runtime.

## The committed table — `u6_look_names.py`

Because there is no live table, we decode `LOOK.LZD` **once** (the repo's U6 LZW,
`ultima6/lzw_decoder.js`) into a committed module:

- `dosbox_tools/u6_look_names.py` — **514 `(tile, name)` records** + `tile_name()`
  whose bisect = "first record whose tile ≥ query", faithful to `GetTileString`.
- Spot-checks: `tile 545→club`, `512→leather helm`, `1270→dead body`, `1→grass`.
- Immutable game data → committed verbatim: no runtime decode, no dependency on
  the game-data path.

## Where names are wired in

`tile_name()` (imported as `_tile_name` in `dosbox_u6_server.py`) is used by
`u6_object`, `u6_objects_near`, `u6_inventory`, `u6_npcs_near`, and the result
read-backs of `u6_look` (`_notable_at_tile`) and `u6_use` (`_use_result_at_tile`).

**`u6_npcs_near` naming = option A:** party members show their `Names[]` name;
creatures/NPCs show the `LOOK.LZD` appearance (`rat`/`guard`/…). The
conversation-name tier (`C_1703_0116`, for named townsfolk) is **deferred** —
marginal for the tools' target-picking purpose, and the agent learns those names
by talking.

## Deployment note

The MCP server runs from a **deployment copy** (e.g. `C:\Z_Temp\tools\dosbox_mcp\`);
`u6_look_names.py` must be copied there alongside `dosbox_u6_server.py` (the
server `import`s it). An impl-only change to either needs only a **server
reconnect**.
