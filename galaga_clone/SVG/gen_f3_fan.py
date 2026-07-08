#!/usr/bin/env python3
# F3 (BREAK_TARGETED) — the red-moth dive that bends toward the player.
# One attack path, a FAN of curves: player X picks a turn-HOLD duration from an
# 8-byte LUT, so the harder you're off to one side, the harder the moth hooks.
# Faithful to bugMotion.js loadSegment F3 + launchEnemyAttack.
import math

# ATTACK_PATH_RED, offsets 0..27 (we stop at F8, the return-to-top).
RED = [0x12,0x18,0x1D, 0x12,0x00,0x28, 0x12,0xFA,0x02,
       0xF3, 0x3F,0x3B,0x36,0x32,0x28,0x26,0x24,0x22,          # F3 + 8-byte LUT
       0x12,0x04,0x30, 0x12,0xFC,0x30, 0x12,0x00,0x18, 0xF8]
def sgn(b): return b-256 if b > 127 else b

START = (72, 60)             # left-of-centre slot → moth is central at F3
START_ANGLE = 0x100          # launchEnemyAttack: j_108A sets 0x0100
NEGATE = False               # left pair member

def f3_idx(moth_x, player_x):
    px = max(0x1E, min(0xD1, round(player_x) + 16))     # sprite-space clamp
    a = (px >> 1) - (round(moth_x) + 16) // 2
    a = a >> 1                                           # signed /4 total
    if NEGATE: a = -a
    a += 0x18
    a = 0 if a < 0 else (0x2F if a > 0x2F else a)
    return a // 6                                        # 0..7

def simulate(player_x=None, stop_at_f3=False, frame0=0, max_frames=500):
    x, y, angle = START[0], START[1], START_ANGLE
    off = 0; vx = vy = rot = 0; seg_timer = 0
    pts = [(x, y)]
    frame = frame0
    while frame < frame0 + max_frames:
        if seg_timer > 0: seg_timer -= 1
        if seg_timer == 0:
            loaded = False
            while not loaded:
                if off >= len(RED): return pts, (x, y, angle, off)
                b0 = RED[off]
                if b0 == 0xF3:
                    if stop_at_f3:
                        return pts, (x, y, angle, off)          # trunk ends here
                    idx = f3_idx(x, player_x)
                    seg_timer = RED[off + 1 + idx]              # LUT[idx] hold
                    off += 9
                    loaded = True                              # keep rot (-6)
                    continue
                if b0 >= 0xEF:                                  # F8 etc → dive over
                    return pts, (x, y, angle, off)
                vx = b0 & 0x0F; vy = (b0 >> 4) & 0x0F
                rot = sgn(RED[off+1]); seg_timer = RED[off+2]
                off += 3; loaded = True
        angle = (angle + rot + 1024) & 0x3FF
        A = vx if (frame & 1) else vy
        a = angle * (2*math.pi/1024)
        x += A*math.cos(a); y -= A*math.sin(a)
        pts.append((x, y))
        frame += 1
        if y > 296 or x < -16 or x > 240: return pts, (x, y, angle, off)
    return pts, (x, y, angle, off)

# trunk: shared dive up to F3
trunk, (tx, ty, tang, toff) = simulate(stop_at_f3=True)
trunk_frames = len(trunk) - 1
print(f"trunk {len(trunk)} pts, F3 at moth=({tx:.0f},{ty:.0f}) angle={tang}")

# fan: 7 player X positions
PLAYERS = [16, 48, 80, 112, 144, 176, 208]
fan = []
for pxv in PLAYERS:
    idx = f3_idx(tx, pxv)
    pts, _ = simulate(player_x=pxv, frame0=trunk_frames)
    fan.append((pxv, idx, RED[10+idx], pts))
    print(f"  player x={pxv:3d} → idx {idx} → hold {RED[10+idx]:2d} frames → {len(pts)} pts, end x={pts[-1][0]:.0f}")

# ── SVG ────────────────────────────────────────────────────────────────────
PF_X, PF_Y, SCALE = 260, 96, 0.95
def px(cx,cy): return (PF_X+cx*SCALE, PF_Y+cy*SCALE)
def poly(pts): return 'M'+' L'.join(f'{px(a,b)[0]:.1f},{px(a,b)[1]:.1f}' for a,b in pts)
# color ramp blue→red across the 7 players
def ramp(i,n):
    t = i/(n-1)
    r = int(0x2b + t*(0xc5-0x2b)); g = int(0x6c*(1-t)+0x30*t); b = int(0xb0*(1-t)+0x30*t)
    return f'#{r:02x}{g:02x}{b:02x}'

s = []
s.append('<svg width="100%" viewBox="0 0 680 470" role="img" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system,Segoe UI,sans-serif">')
s.append('<title>F3 player-targeting fan — the red moth bends toward you</title>')
s.append('''<style>
 /* Unconditional dark theme (see gen_path_svg.py note). */
 svg{background:#141518;--tp:#eaeaea;--ts:#b4b4b4;--tm:#8a8a8a;--grey:#6b7280;--border:#444;--pf:#161616;--ship:#68d391;}
 .mono{font-family:ui-monospace,Menlo,Consolas,monospace;}
</style>''')
s.append('<text x="30" y="30" font-size="21" font-weight="500" fill="var(--tp)">The F3 fan — one dive, aimed at wherever you stand</text>')
s.append('<text x="30" y="52" font-size="14" fill="var(--ts)"><tspan class="mono" fill="var(--tp)">ATTACK_PATH_RED</tspan>: F3 reads your X, picks a turn-hold from an 8-byte LUT — a <tspan font-style="italic">continuous</tspan> family</text>')

# explanation column
s.append('<text x="30" y="88" font-size="13" font-weight="500" fill="var(--tp)">The token</text>')
s.append('<text x="30" y="108" font-size="12.5" class="mono" fill="var(--grey)">.. 12 FA 02</text>')
s.append('<text x="140" y="108" font-size="11.5" fill="var(--tm)">turn starts (rot −6)</text>')
s.append('<text x="30" y="126" font-size="12.5" class="mono" fill="var(--tp)">F3 3F 3B 36 32</text>')
s.append('<text x="30" y="142" font-size="12.5" class="mono" fill="var(--tp)">   28 26 24 22</text>')
s.append('<text x="30" y="160" font-size="11.5" fill="var(--tm)">8-byte hold LUT: 63…34 frames</text>')
s.append('<text x="30" y="184" font-size="11.5" fill="var(--tm)">idx = clamp((playerX − mothX)/4</text>')
s.append('<text x="54" y="200" font-size="11.5" fill="var(--tm)">+ 24, 0..47) / 6   → 0–7</text>')
s.append('<text x="30" y="224" font-size="11.5" fill="var(--tm)">Longer hold → the −6 turn runs</text>')
s.append('<text x="30" y="240" font-size="11.5" fill="var(--tm)">longer → the dive hooks harder</text>')
s.append('<text x="30" y="256" font-size="11.5" fill="var(--tm)">toward your column. It sets the</text>')
s.append('<text x="30" y="272" font-size="11.5" fill="var(--tm)">turn DURATION, not the heading.</text>')

# playfield
pfw, pfh = 224*SCALE, 288*SCALE
s.append(f'<rect x="{PF_X}" y="{PF_Y}" width="{pfw:.1f}" height="{pfh:.1f}" fill="var(--pf)" stroke="var(--border)" stroke-width="1"/>')
# fan branches
n = len(fan)
for i,(pxv,idx,hold,pts) in enumerate(fan):
    col = ramp(i,n)
    s.append(f'<path d="{poly(pts)}" fill="none" stroke="{col}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity="0.92"/>')
    # player marker along the bottom
    mx,my = px(pxv, 250)
    s.append(f'<circle cx="{mx:.1f}" cy="{my:.1f}" r="3" fill="{col}"/>')
# trunk on top
s.append(f'<path d="{poly(trunk)}" fill="none" stroke="var(--grey)" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"/>')
sx,sy = px(*START); s.append(f'<circle cx="{sx:.1f}" cy="{sy:.1f}" r="3.5" fill="var(--tp)"/>')
s.append(f'<text x="{sx+7:.1f}" y="{sy-4:.1f}" font-size="10" fill="var(--tm)">launch</text>')
fx,fy = px(tx,ty)
s.append(f'<rect x="{fx-4:.1f}" y="{fy-4:.1f}" width="8" height="8" fill="var(--tp)" transform="rotate(45 {fx:.1f} {fy:.1f})"/>')
s.append(f'<text x="{fx+8:.1f}" y="{fy+3:.1f}" font-size="10" class="mono" fill="var(--tp)">F3</text>')
# "player positions" ticks label
py = px(112, 258)[1]
s.append(f'<text x="{PF_X+pfw/2:.0f}" y="{py+4:.0f}" font-size="10" text-anchor="middle" fill="var(--tm)">◦ = player position (dive color-matched)</text>')

# legend: color ramp
lx, ly = PF_X, PF_Y+pfh+18
s.append(f'<text x="{lx}" y="{ly}" font-size="11.5" fill="var(--ts)">player X →</text>')
for i in range(n):
    s.append(f'<rect x="{lx+66+i*20}" y="{ly-9}" width="16" height="10" rx="2" fill="{ramp(i,n)}"/>')
s.append(f'<text x="{lx+66}" y="{ly+20}" font-size="10.5" fill="var(--tm)">left edge</text>')
s.append(f'<text x="{lx+66+n*20-2}" y="{ly+20}" font-size="10.5" text-anchor="end" fill="var(--tm)">right edge</text>')
s.append('</svg>')
open('f3_fan.svg','w',encoding='utf-8').write('\n'.join(s))
print('wrote f3_fan.svg')
