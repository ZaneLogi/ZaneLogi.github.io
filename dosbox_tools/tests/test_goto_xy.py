"""Unit test for the u6_goto_xy planning core: _mask_walk (route AROUND standing
NPCs), _closest_reachable (pick the reachable cell nearest the target -- the target
itself when in-window/reachable, the nearest edge cell when off-window, `start` when
boxed), and that _dijkstra over the masked grid actually detours around a blocker.
Pure grid logic -- no live memory needed beyond importing the module."""
import sys, types, os

dm = types.ModuleType("dosbox_mem")
class _Sess:
    def __init__(self): self.handle = None; self.membase = None
    def reset(self): pass
dm.Session = _Sess
dm.register_base_tools = lambda mcp, S: types.SimpleNamespace()
dm.register_input_tools = lambda mcp, S: types.SimpleNamespace()
dm.read = lambda *a: b""
dm.iter_regions = lambda handle: []
dm.HINT_NO_MEMBASE = "no membase"
sys.modules["dosbox_mem"] = dm
di = types.ModuleType("dosbox_input")
di.register_input_tools = lambda mcp, S: types.SimpleNamespace()
sys.modules["dosbox_input"] = di
m_mcp = types.ModuleType("mcp"); m_srv = types.ModuleType("mcp.server")
m_fm = types.ModuleType("mcp.server.fastmcp")
class FastMCP:
    def __init__(self, *a, **k): pass
    def tool(self, *a, **k): return lambda f: f
    def run(self): pass
m_fm.FastMCP = FastMCP
sys.modules["mcp"] = m_mcp; sys.modules["mcp.server"] = m_srv
sys.modules["mcp.server.fastmcp"] = m_fm
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import dosbox_u6_server as u6

W, H = u6.U6_AREA_W, u6.U6_AREA_H
def open_grid(): return [[True] * W for _ in range(H)]
def cost1():     return [[1] * W for _ in range(H)]

ok = True
def chk(label, cond):
    global ok
    ok &= bool(cond)
    print(f"  [{'OK' if cond else 'FAIL'}] {label}")

# ax=ay=0 -> cell (r,c) maps to world (c, r); target world (tx,ty) -> cell (ty,tx).
print("_closest_reachable goal selection (ax=ay=0):")
walk = open_grid()
chk("in-window target -> target cell", u6._closest_reachable(walk, (20, 20), 0, 0, 25, 20) == (20, 25))
chk("off-window east -> east edge row", u6._closest_reachable(walk, (20, 20), 0, 0, 100, 20) == (20, W - 1))
chk("off-window north -> top edge col", u6._closest_reachable(walk, (20, 20), 0, 0, 20, -50) == (0, 20))

print("boxed-in -> returns start:")
boxed = open_grid()
for dr, dc in u6._DIR_DELTAS:
    boxed[10 + dr][10 + dc] = False
chk("fully walled neighbours -> start", u6._closest_reachable(boxed, (10, 10), 0, 0, 30, 10) == (10, 10))

print("_mask_walk clears NPC cells:")
walk = open_grid()
masked = u6._mask_walk(walk, {(20, 22)})
chk("blocked cell cleared", masked[20][22] is False)
chk("neighbour intact",     masked[20][21] is True)
chk("empty block -> same obj", u6._mask_walk(walk, set()) is walk)

print("route AROUND a standing NPC (wall of NPCs with one gap):")
# vertical NPC wall at col 22, rows 1..H-1 ; gap at row 0 -> detour over the top.
npc = {(r, 22) for r in range(1, H)}
walkm = u6._mask_walk(open_grid(), npc)
goal = u6._closest_reachable(walkm, (20, 20), 0, 0, 25, 20)     # target (20,25) behind the wall
chk("target still reachable via gap", goal == (20, 25))
steps = u6._dijkstra(walkm, cost1(), (20, 20), {goal})
chk("a path exists",          steps is not None and len(steps) > 0)
# the path must never step onto a blocked col-22 cell
def replay(start, steps):
    r, c = start; cells = [(r, c)]
    for dr, dc in steps: r += dr; c += dc; cells.append((r, c))
    return cells
chk("path avoids the NPC wall", all(cell not in npc for cell in replay((20, 20), steps)))
chk("path ends on the target",  replay((20, 20), steps)[-1] == (20, 25))

print("NPC seals the ONLY path -> closest reachable stops on the near side:")
# full wall at col 22 (no gap) -> target side unreachable when masked.
sealed = u6._mask_walk(open_grid(), {(r, 22) for r in range(H)})
goal2 = u6._closest_reachable(sealed, (20, 20), 0, 0, 25, 20)
chk("cannot cross sealed wall (goal col < 22)", goal2[1] < 22)
chk("but optimistic (ignore NPCs) can",
    u6._closest_reachable(open_grid(), (20, 20), 0, 0, 25, 20) == (20, 25))

print("ALL PASS" if ok else "SOME FAILED")
sys.exit(0 if ok else 1)
