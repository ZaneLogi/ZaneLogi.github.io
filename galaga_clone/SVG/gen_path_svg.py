#!/usr/bin/env python3
# Proof-of-concept: render ONE Galaga fly-in path as an SVG by RUNNING the
# real motion model (faithful port of tasks/bugMotion.js) over its bytecode.
#
# The point: galaga path data is not geometry (like lunar_lander's terrain
# glyphs) — it's a velocity/rotation PROGRAM. We must integrate it to get the
# curve. This script IS the "atlas generator" prototype.
import math

# ── path_01E8 (PATH_INDEX entry 6, variant 0) — token-free reference path ──
PATH = [0x23,0x00,0x10, 0x23,0x01,0x40, 0x22,0x0c,0x37, 0x23,0x00,0xff, 0xff]

# ── start-state from VARIANTS[] + the coord transforms (paths.js) ──────────
def rawX_to_canvasX(rawX): return rawX * 2 - 9
def rawY_to_canvasY(rawY): return ((~(rawY + 0x4F)) & 0xFF) * 2 + 1 - 32
def signed(b): return b - 256 if b > 127 else b

VARIANTS = {0: (0x9B, 0x34, 0x03), 1: (0x9B, 0x44, 0x03)}  # (y, x, rotHi)

def simulate(variant, negate, max_frames=900):
    y0, x0, rotHi = VARIANTS[variant]
    x, y = rawX_to_canvasX(x0), rawY_to_canvasY(y0)
    angle = rotHi << 8                      # 10-bit; low byte inits 0
    vx = vy = rot = 0
    seg_timer = 0
    off = 0
    seg_idx = -1
    pts = []                                # (x, y, seg_idx)
    pts.append((x, y, 0))
    for frame in range(max_frames):
        # Step 1+2: segment timer / load next 3-byte segment (bugMotion loadSegment)
        if seg_timer > 0:
            seg_timer -= 1
        if seg_timer == 0:
            if off >= len(PATH) or PATH[off] == 0xFF:   # END
                break
            b0, b1, b2 = PATH[off], PATH[off+1], PATH[off+2]
            vx = b0 & 0x0F
            vy = (b0 >> 4) & 0x0F
            rot = -signed(b1) if negate else signed(b1)
            seg_timer = b2
            off += 3
            seg_idx += 1
        # Step 3: angle += rotRate (10-bit wrap)
        angle = (angle + rot + 1024) & 0x3FF
        # Step 5: both axes move; magnitude alternates vx/vy by global frame parity
        A = vx if (frame & 1) else vy
        ang = angle * (2 * math.pi / 1024)
        x += A * math.cos(ang)
        y -= A * math.sin(ang)              # canvas-Y inverted vs Z80 internal Y
        pts.append((x, y, seg_idx))
        # Clip at the playfield edge — 01E8's 255-frame tail flies off-screen
        # (it's a raw-END test path, not an FB-turn-home formation entry).
        if x < -15 or x > 226 or y > 292:
            break
    return pts

member0 = simulate(0, negate=False)
member1 = simulate(1, negate=True)

# ── decode segment table for the legend ────────────────────────────────────
SEG_COLORS = ['var(--text-accent)', 'var(--text-success)',
              'var(--text-warning)', 'var(--text-danger)']
segs = []
for i in range(4):
    b0, b1, b2 = PATH[i*3], PATH[i*3+1], PATH[i*3+2]
    segs.append((b0, b1, b2, b0 & 0x0F, (b0 >> 4) & 0xF, signed(b1), b2))

# ── SVG geometry: a playfield panel that maps canvas 224x288 → panel px ─────
PF_X, PF_Y, PF_W = 300, 250, 224 * 0.95     # playfield origin + scaled width
SCALE = PF_W / 224
def px(cx, cy): return (PF_X + cx * SCALE, PF_Y + cy * SCALE)

def polyline_by_seg(pts):
    """Emit one <path> per segment index so each is colored separately."""
    out = []
    cur = None
    d = ''
    for (cx, cy, si) in pts:
        sx, sy = px(cx, cy)
        if si != cur:
            if d:
                out.append((cur, d))
            col = SEG_COLORS[min(cur if cur is not None else 0, 3)]
            d = f'M{sx:.1f},{sy:.1f}'
            cur = si
        else:
            d += f' L{sx:.1f},{sy:.1f}'
    if d:
        out.append((cur, d))
    return out

def paths_svg(pts, width, dash=''):
    s = ''
    for (si, d) in polyline_by_seg(pts):
        col = SEG_COLORS[min(si, 3)]
        s += (f'<path d="{d}" fill="none" stroke="{col}" stroke-width="{width}" '
              f'stroke-linejoin="round" stroke-linecap="round" {dash}/>\n')
    return s

svg = []
svg.append('<svg width="100%" viewBox="0 0 680 640" role="img" '
           'xmlns="http://www.w3.org/2000/svg" '
           'font-family="-apple-system,Segoe UI,sans-serif">')
svg.append('<title>How a Galaga fly-in path unfolds from its bytecode</title>')
svg.append('<desc>Path 01E8: four 3-byte segments, run through the motion '
           'interpreter, become one swooping trajectory.</desc>')
svg.append('''<style>
  /* Unconditional dark theme: no prefers-color-scheme media query, so it
     renders dark even standalone or when embedded as an image (which ignores
     the OS dark setting). */
  svg{background:#141518;--text-primary:#eaeaea;--text-secondary:#b4b4b4;--text-muted:#8a8a8a;--text-accent:#7cb6ff;--text-success:#68d391;--text-warning:#f6ad55;--text-danger:#fc8181;--border:#444;--bg-accent:#1d3450;--pf:#161616;}
  .mono{font-family:ui-monospace,Menlo,Consolas,monospace;}
</style>''')

# Header
svg.append('<text x="34" y="30" font-size="21" font-weight="500" fill="var(--text-primary)">A Galaga fly-in path, drawn from its bytecode</text>')
svg.append('<text x="34" y="52" font-size="14" fill="var(--text-secondary)">Path <tspan class="mono">01E8</tspan> · 4 steering segments → run through the motion model → one swoop</text>')

# ── Section 1: the bytecode ────────────────────────────────────────────────
svg.append('<text x="34" y="90" font-size="15" font-weight="500" fill="var(--text-primary)">1 · The data — four 3-byte segments (each a tiny steering command)</text>')
labels = ['descend', 'gentle bend', 'hard hook', 'long tail']
ry = 108
for i, (b0, b1, b2, vx, vy, rot, dur) in enumerate(segs):
    col = SEG_COLORS[i]
    svg.append(f'<rect x="34" y="{ry+i*30-11}" width="14" height="14" rx="3" fill="{col}"/>')
    svg.append(f'<text x="58" y="{ry+i*30}" font-size="13" class="mono" fill="var(--text-secondary)">'
               f'{b0:02X} {b1:02X} {b2:02X}</text>')
    svg.append(f'<text x="150" y="{ry+i*30}" font-size="12.5" fill="var(--text-muted)">'
               f'vx {vx} · vy {vy} · rot {rot:+d} · {dur} frames</text>')
    svg.append(f'<text x="340" y="{ry+i*30}" font-size="12.5" fill="var(--text-secondary)">{labels[i]}</text>')
svg.append(f'<text x="34" y="{ry+4*30}" font-size="13" class="mono" fill="var(--text-muted)">FF</text>')
svg.append(f'<text x="58" y="{ry+4*30}" font-size="12.5" fill="var(--text-muted)">END</text>')

# ── Section 2: the trajectory in the playfield ─────────────────────────────
svg.append('<text x="34" y="240" font-size="15" font-weight="500" fill="var(--text-primary)">2 · The flight — the interpreter integrates it, segment by segment</text>')
# playfield frame
pfw, pfh = 224 * SCALE, 288 * SCALE
svg.append(f'<rect x="{PF_X}" y="{PF_Y}" width="{pfw:.1f}" height="{pfh:.1f}" fill="var(--pf)" stroke="var(--border)" stroke-width="1"/>')
# formation grid hint (rows 2-5 where bugs land)
for r in range(6):
    gy = PF_Y + (28 + r * 16) * SCALE
    svg.append(f'<line x1="{PF_X+40*SCALE:.1f}" y1="{gy:.1f}" x2="{PF_X+184*SCALE:.1f}" y2="{gy:.1f}" stroke="var(--border)" stroke-width="0.5" opacity="0.5"/>')
# member 0 trajectory
svg.append(paths_svg(member0, 2.4))
# start marker + arrow
sx0, sy0 = px(*member0[0][:2])
svg.append(f'<circle cx="{sx0:.1f}" cy="{sy0:.1f}" r="3.5" fill="var(--text-primary)"/>')
svg.append(f'<text x="{sx0+7:.1f}" y="{sy0-4:.1f}" font-size="10" fill="var(--text-muted)">start (95,11)</text>')
# legend for the panel
lx, ly = 470, 250
for i, lab in enumerate(labels):
    svg.append(f'<rect x="{lx}" y="{ly+i*22-9}" width="16" height="3" rx="1.5" fill="{SEG_COLORS[i]}"/>')
    svg.append(f'<text x="{lx+24}" y="{ly+i*22}" font-size="12" fill="var(--text-secondary)">seg {i+1} · {lab}</text>')
svg.append(f'<text x="{lx}" y="{ly+4*22+6}" font-size="11" fill="var(--text-muted)">224 × 288 playfield;</text>')
svg.append(f'<text x="{lx}" y="{ly+4*22+22}" font-size="11" fill="var(--text-muted)">grid = formation rows.</text>')

# ── Section 3: the mirrored pair ───────────────────────────────────────────
svg.append('<text x="34" y="590" font-size="15" font-weight="500" fill="var(--text-primary)">3 · The pair — member 1 runs the SAME bytes with rotation negated (bit 7)</text>')
# small inset playfield at bottom
IPF_X, IPF_Y, ISCALE = 470, 300, 0  # not used; overlay drawn into main panel instead
# overlay member1 as dashed into the main panel
svg.append(paths_svg(member1, 1.8, dash='stroke-dasharray="4 3"'))
sx1, sy1 = px(*member1[0][:2])
svg.append(f'<circle cx="{sx1:.1f}" cy="{sy1:.1f}" r="3.5" fill="none" stroke="var(--text-primary)" stroke-width="1.5"/>')
svg.append('<text x="34" y="610" font-size="12" fill="var(--text-muted)">Solid = member 0 · dashed = member 1 (negated rotation) — the mirrored "wishbone" from one shared path.</text>')

svg.append('</svg>')

out = '\n'.join(svg)
with open('path_01E8.svg', 'w', encoding='utf-8') as f:
    f.write(out)

print(f"member0: {len(member0)} points, member1: {len(member1)} points")
print(f"member0 span: x[{min(p[0] for p in member0):.0f}..{max(p[0] for p in member0):.0f}] "
      f"y[{min(p[1] for p in member0):.0f}..{max(p[1] for p in member0):.0f}]")
print("wrote path_01E8.svg")
