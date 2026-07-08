#!/usr/bin/env python3
# path_001D — all THREE routes overlaid. One bytecode, two fork points:
#   F7 (transient gate) peels off route 2; F0 (stage-8 gate) splits 1 vs 3.
# Every point is computed by the real bugMotion.js motion model.
import math

path_001D = [0x23,0x06,0x16, 0x23,0x00,0x19,
             0xF7,0x4B,0x00, 0x23,0xF0,0x02, 0xF0,0x5E,0x00,
             0x23,0xF0,0x24, 0xFB, 0x23,0x00,0xFF,0xFF]
path_004B = [0x23,0xF0,0x26, 0x23,0x14,0x13, 0xFE, 0x0D,0x0B,0x0A,0x08,0x06,0x04,0x03,0x01,
             0x23,0xFF, 0xFF,0xFF]                        # transient swoop → FF despawn
path_005E = [0x44,0xE4,0x18, 0xFB, 0x44,0x00,0xFF,0xFF]   # stage-8+ approach → FB home
SUB = {0x004B: path_004B, 0x005E: path_005E}

def rawX(x): return x*2 - 9
def rawY(y): return ((~(y + 0x4F)) & 0xFF)*2 + 1 - 32
def sgn(b): return b-256 if b > 127 else b
START = (rawX(0x34), rawY(0x9B), 0x03 << 8)
HOME  = (104, 60)
PLAYER_X = 112          # fixed player position for the FE (route-2) targeting

def simulate(mode, max_frames=1500):
    # mode: 'low' (stage<8, formation), 'high' (stage>=8, formation), 'trans' (F7)
    x, y, angle = START
    base, off = path_001D, 0
    vx = vy = rot = 0
    seg_timer = 0
    homing = False
    marks = {}                      # 'f7' / 'f0' → point index where processed
    pts = [(x, y)]
    for frame in range(max_frames):
        if not homing:
            if seg_timer > 0: seg_timer -= 1
            if seg_timer == 0:
                loaded = False
                while not loaded:
                    if off >= len(base): return pts, marks
                    b0 = base[off]
                    if b0 == 0xFF: return pts, marks           # despawn / end
                    if b0 == 0xFB:                             # TURN_HOME
                        ang = math.atan2(-(HOME[1]-y), HOME[0]-x)
                        angle = int(round((ang % (2*math.pi))/(2*math.pi)*1024)) & 0x3FF
                        rot = 0; homing = True; break
                    if b0 == 0xF7:                             # transient gate
                        marks['f7'] = len(pts)-1
                        if mode == 'trans':
                            base = SUB[(base[off+2]<<8)|base[off+1]]; off = 0
                        else:
                            off += 3
                        continue
                    if b0 == 0xF0:                             # stage-8 gate
                        marks['f0'] = len(pts)-1
                        if mode == 'high':
                            base = SUB[(base[off+2]<<8)|base[off+1]]; off = 0
                        else:
                            off += 3
                        continue
                    if b0 == 0xFE:                             # player-region hold (route 2)
                        shipX = (PLAYER_X + 9) & 0xFF
                        targetX = ((0xF2 - shipX) & 0xFF)      # negate=False
                        targetX = (targetX + 0x0E) & 0xFF
                        idx = max(1, min(8, targetX // 0x1E))
                        seg_timer = base[off + idx]            # LUT[idx-1]
                        off += 9
                        loaded = True                          # keep vx/vy/rot
                        continue
                    vx = b0 & 0x0F; vy = (b0>>4)&0x0F
                    rot = sgn(base[off+1]); seg_timer = base[off+2]
                    off += 3; loaded = True
                if homing: pass
            if not homing:
                angle = (angle + rot + 1024) & 0x3FF
        A = vx if (frame & 1) else vy
        a = angle*(2*math.pi/1024)
        x += A*math.cos(a); y -= A*math.sin(a)
        pts.append((x, y))
        if homing and abs(x-HOME[0])<=2 and abs(y-HOME[1])<=2: return pts, marks
        if mode == 'trans' and (x < -15 or x > 240 or y > 302 or y < -15): return pts, marks
    return pts, marks

low,  m_low  = simulate('low')
high, m_high = simulate('high')
trans,m_tr   = simulate('trans')
f7 = m_low['f7']; f0 = m_low['f0']
print(f"low {len(low)} high {len(high)} trans {len(trans)} | f7@{f7} f0@{f0}")

trunkA  = low[:f7+1]           # start → F7  (all three share)
trunkB  = low[f7:f0+1]         # F7 → F0     (routes 1 & 3 share)
br_low  = low[f0:]             # stages 1-7  (blue)
br_high = high[f0:]            # stages 8+   (orange)
br_tr   = trans[f7:]           # transient   (purple)

PF_X, PF_Y, SCALE = 300, 96, 0.95
def px(cx,cy): return (PF_X+cx*SCALE, PF_Y+cy*SCALE)
def poly(pts): return 'M'+' L'.join(f'{px(a,b)[0]:.1f},{px(a,b)[1]:.1f}' for a,b in pts)

s = []
s.append('<svg width="100%" viewBox="0 0 680 470" role="img" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system,Segoe UI,sans-serif">')
s.append('<title>path_001D — one bytecode, three routes</title>')
s.append('''<style>
 /* Unconditional dark theme (see gen_path_svg.py note). */
 svg{background:#141518;--tp:#eaeaea;--ts:#b4b4b4;--tm:#8a8a8a;--acc:#7cb6ff;--warn:#fb923c;--trans:#c084fc;--grey:#6b7280;--border:#444;--pf:#161616;}
 .mono{font-family:ui-monospace,Menlo,Consolas,monospace;}
</style>''')
s.append('<text x="34" y="30" font-size="21" font-weight="500" fill="var(--tp)">One bytecode, three flights — the two gates that fork it</text>')
s.append('<text x="34" y="52" font-size="14" fill="var(--ts)">Path <tspan class="mono">001D</tspan> carries <tspan class="mono" fill="var(--tp)">F7</tspan> (transient) then <tspan class="mono" fill="var(--tp)">F0</tspan> (stage-8) — a bug runs exactly one route</text>')

# bytecode strip with the two forks marked
s.append('<text x="34" y="86" font-size="13" font-weight="500" fill="var(--tp)">The bytecode — two branch tokens</text>')
by = [('23 06 16','var(--grey)'),('23 00 19','var(--grey)'),('F7','var(--trans)'),
      ('23 F0 02','var(--grey)'),('F0','var(--warn)'),('23 F0 24','var(--acc)'),('FB','var(--grey)')]
bx = 34
for t,c in by:
    s.append(f'<text x="{bx}" y="106" font-size="12.5" class="mono" fill="{c}">{t}</text>')
    bx += len(t)*8.2 + 14
s.append('<text x="34" y="138" font-size="12" fill="var(--grey)">■ shared trunk (segments A · B · C · D)</text>')
s.append('<text x="34" y="158" font-size="12" fill="var(--trans)">■ transient: <tspan class="mono">F7</tspan> → sub-path <tspan class="mono">004B</tspan></text>')
s.append('<text x="46" y="174" font-size="11" fill="var(--tm)">swoop, target player (FE), leave (FF)</text>')
s.append('<text x="34" y="196" font-size="12" fill="var(--acc)">■ stages 1–7: skip both gates → <tspan class="mono">FB</tspan> home</text>')
s.append('<text x="34" y="216" font-size="12" fill="var(--warn)">■ stages 8+: <tspan class="mono">F0</tspan> → sub-path <tspan class="mono">005E</tspan> → <tspan class="mono">FB</tspan> home</text>')
s.append('<text x="34" y="248" font-size="11.5" fill="var(--tm)">The two formation routes peel apart only</text>')
s.append('<text x="34" y="264" font-size="11.5" fill="var(--tm)">at F0; the transient peels off earlier, at</text>')
s.append('<text x="34" y="280" font-size="11.5" fill="var(--tm)">F7, and never comes back.</text>')

pfw, pfh = 224*SCALE, 288*SCALE
s.append(f'<rect x="{PF_X}" y="{PF_Y}" width="{pfw:.1f}" height="{pfh:.1f}" fill="var(--pf)" stroke="var(--border)" stroke-width="1"/>')
for r in range(6):
    gy = PF_Y+(28+r*16)*SCALE
    s.append(f'<line x1="{PF_X+40*SCALE:.1f}" y1="{gy:.1f}" x2="{PF_X+184*SCALE:.1f}" y2="{gy:.1f}" stroke="var(--border)" stroke-width="0.5" opacity="0.5"/>')
# branches under, trunk over
s.append(f'<path d="{poly(br_tr)}" fill="none" stroke="var(--trans)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>')
s.append(f'<path d="{poly(br_low)}" fill="none" stroke="var(--acc)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>')
s.append(f'<path d="{poly(br_high)}" fill="none" stroke="var(--warn)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="5 3"/>')
s.append(f'<path d="{poly(trunkA)}" fill="none" stroke="var(--grey)" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/>')
s.append(f'<path d="{poly(trunkB)}" fill="none" stroke="var(--grey)" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/>')
# markers
sx,sy = px(*START[:2]); s.append(f'<circle cx="{sx:.1f}" cy="{sy:.1f}" r="3.5" fill="var(--tp)"/>')
s.append(f'<text x="{sx+7:.1f}" y="{sy-4:.1f}" font-size="10" fill="var(--tm)">start</text>')
for idx,pts,lab,col,lox,loy,anch in (
        (f7,low,'F7','var(--trans)',-14,-9,'end'),
        (f0,low,'F0','var(--tp)',10,11,'start')):
    fx,fy = px(*pts[idx])
    s.append(f'<rect x="{fx-4:.1f}" y="{fy-4:.1f}" width="8" height="8" fill="{col}" transform="rotate(45 {fx:.1f} {fy:.1f})"/>')
    s.append(f'<text x="{fx+lox:.1f}" y="{fy+loy:.1f}" font-size="10.5" class="mono" text-anchor="{anch}" fill="{col}">{lab}</text>')
hx,hy = px(*HOME); s.append(f'<circle cx="{hx:.1f}" cy="{hy:.1f}" r="4" fill="none" stroke="var(--tp)" stroke-width="1.5"/>')
s.append(f'<text x="{hx+8:.1f}" y="{hy+3:.1f}" font-size="10" fill="var(--tm)">home slot</text>')
# leaves marker for transient
lx,ly = px(*trans[-1])
s.append(f'<text x="{lx-2:.1f}" y="{ly-6:.1f}" font-size="10" class="mono" fill="var(--trans)">leaves ↓</text>')
# legend
for i,(c,t,dash) in enumerate([('var(--grey)','shared trunk (all routes)',''),
      ('var(--acc)','stages 1–7 → home',''),('var(--warn)','stages 8+ (F0 → 005E) → home',' dash'),
      ('var(--trans)','transient (F7 → 004B) → leaves','')]):
    yy = PF_Y+pfh+16+i*17
    s.append(f'<rect x="{PF_X}" y="{yy-3:.0f}" width="18" height="3" rx="1.5" fill="{c}"/>')
    s.append(f'<text x="{PF_X+26}" y="{yy+1:.0f}" font-size="11" fill="var(--ts)">{t}</text>')
s.append('</svg>')
open('three_routes_001D.svg','w',encoding='utf-8').write('\n'.join(s))
print('wrote three_routes_001D.svg')
