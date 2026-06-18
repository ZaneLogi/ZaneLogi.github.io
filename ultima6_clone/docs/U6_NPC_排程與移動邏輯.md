# Ultima VI — NPC 排程、尋路與受阻處理整合說明

本文整合 `ergonomy-joe/u6-decompiled`(PC/MS-DOS 版 GAME.EXE 逆向重建碼)中關於 NPC 行為的三大子系統：

1. **時程安排(Schedule)**——NPC 在什麼時間、該去哪、做什麼
2. **尋路(Pathfinding)**——如何規劃從現在位置到目標點的路線
3. **受阻處理(Blocking)**——路被擋住或目標點被佔時怎麼辦

主要程式碼位於 `SRC/seg_1E0F.c`,行為模式常數定義於 `SRC/ai.h`。

---

## 一、整體架構

U6 的 NPC AI 是一個由 `NPCMode[objNum]` 這個單位元組「狀態」驅動的狀態機。每個 NPC 每回合根據自己的 `NPCMode` 跳到對應處理（分派器 `C_1E0F_4ED9` 一帶的 `switch`）。

整套系統分四層協作，刻意把「規劃」做得便宜、把「臨場衝突」延後到執行階段解決：

| 層次 | 機制 | 目的 |
|------|------|------|
| 規劃層 | 尋路不計入動態角色；每 tick 限制重算數量 | 省成本、路徑可快取 |
| 執行層 | 走路時才做碰撞檢查；受阻則「等待→降級→重算」 | 臨場應付擋路 |
| 時間層 | 排程時鐘每小時強制切換目標 | 保證 NPC 不會永久停擺 |
| 視野層 | 離開 Avatar 可見區的 NPC 直接瞬移到目標 | 看不見時不精細模擬，確保世界最終一致 |

---

## 二、時程安排（Schedule）

### 2.1 資料結構

排程條目定義於 `u6.h`：

```c
struct tSchedule {
    unsigned char time;   /* 觸發時間（編碼了小時與星期） */
    unsigned char action; /* 到達後要做的事（AI_FARM, AI_SLEEP, ...） */
    struct coord xyz;     /* 目標座標 */
};
```

相關全域：

- `Schedule[]` — 所有 NPC 的排程條目串接而成（從 `savegame\objlist` 載入）
- `SchedPointer[objNum]` — 該 NPC 排程條目區段的起點
- `SchedIndex[objNum]` — 目前生效的條目相對偏移
- 當前生效條目 = `Schedule[SchedIndex[objNum] + SchedPointer[objNum]]`

### 2.2 時間驅動的目標切換（`C_1E0F_5165`，每遊戲小時呼叫）

這是排程系統的「時鐘」。它每小時掃過所有 NPC，倒序比對其排程條目的 `time` 欄位與當前 `Time_H`（小時）和 `Date_D`（星期）：

```c
for(di = bp_04; di >= bp_06; di --) {
    bp_02 = Schedule[di].time;
    if((bp_02 & 0x1f) == Time_H)
    if((bp_02 >> 5) == ((Date_D - 1) % 7 + 1) || (bp_02 & 0xe0) == 0) {
        SchedIndex[si] = di - bp_06;      /* 切到新條目 */
        NPCMode[si] = AI_FINDPATH;        /* 強制重新規劃路徑 */
        break;
    }
}
```

`time` 的位元配置：低 5 位（`& 0x1f`）= 小時；高 3 位（`>> 5`）= 星期（0 表示每天皆觸發）。

**關鍵特性：切換是純時間驅動，完全不檢查 NPC 是否真的抵達了上一個目標。** 時間一到，無論 NPC 卡在哪裡，目標與 `NPCMode` 都會被重設。這正是「無法永久困住一個 NPC 的意圖」的根本原因——你只能阻止它在某時段內到某地，時鐘一跳它就放棄舊目標、衝向新目標。

---

## 三、尋路（Pathfinding）

### 3.1 工作區與「阻力地圖」

尋路在 Avatar 周圍一塊 `AREA_W × AREA_H`（皆為 40）的視窗內進行，使用借來的通用緩衝區 `ScratchBuf` 存放尋路用的資料結構：

```c
typedef struct {
    unsigned char PTH_map[AREA_H][AREA_W];     /* Dijkstra 累積距離（含 0x80 旗標位） */
    int           PTH_rank[0x100];             /* 優先佇列（依距離分桶） */
    int           PTH_link[0x100];             /* 佇列鏈結 */
    unsigned char PTH_x[0x100], PTH_y[0x100];  /* 佇列節點座標 */
    unsigned char PTH_resist[AREA_H][AREA_W];  /* 每格地形阻力（移動成本） */
} /* (_ScratchBuf) */;
```

### 3.2 阻力計算（`__ComputeResistance`）— **關鍵：不計入角色**

尋路前先填整張阻力地圖。流程：

1. 先依地形填底：不可通行地形設 `0xff`，其餘設 `(TerrainType >> 4) + 1`。
2. 再掃描區域內所有物件，調整對應格的阻力——但**只處理靜態物件**：
   - 門（`OBJ_129..0x12C`）：關著設 `0xff`（全阻），開著只 +1。
   - 可穿透物（`OBJ_116/0x118`）：+1。
   - 一般地圖物件 / 家具：**判斷條件為 `objNum >= 0x100`**。

**`objNum >= 0x100` 這個條件是整套設計的核心。** 在 U6 物件編號體系中，`0x00–0xFF` 是角色（NPC / 玩家 / 怪物），`0x100` 以上才是物品與地形物件。因此這個判斷**明確跳過了所有角色**——活的角色完全不會在阻力地圖上留下任何痕跡。

> **結論：尋路規劃時，其他 NPC、玩家、怪物都不算障礙。** 演算法眼中的障礙只有牆、關著的門、家具等死物。

### 3.3 尋路主入口（`C_1E0F_2D37`）

```c
static C_1E0F_2D37(int objNum, int x, int y) {
    /* 1. 若已在目標格 → 直接判定到達 */
    if(dst_x == x && dst_y == y) { __AtDestination(objNum); return; }

    /* 2. 目標或自身在工作區外 → 改用瞬移 C_1E0F_291C，或設定偏好方向 */

    D_17A7 ++;
    __ComputeResistance(objNum);   /* 填阻力地圖（不含角色） */

    /* 3. 初始化 PTH_map / 優先佇列 */

    /* 4. 從「目標格」反向做 Dijkstra 擴散 */
    C_1E0F_2A74(0, dst_x, dst_y, 0);
    while(... && !PTH_Found) {
        /* 取出最小成本節點，向四鄰擴散，累加 PTH_resist */
        C_1E0F_2A74(PTH_resist[...] + bp_08, x±1, y, ...);
        ...
    }

    /* 5. 結果分流 */
    if(PTH_Found) {
        NPCMode[objNum] = AI_ONPATH;   /* 找到路 → 進入沿路走 */
        PathCounter[PTH_Index] = 0;
        PathTries[PTH_Index]   = 0;
    } else if(NPCMode[objNum] == AI_FINDPATH) {
        NPCMode[objNum] = AI_86;       /* 找不到 → 進入放棄/重試末態 */
    } else if(NPCMode[objNum] == AI_SEEKOBJ) {
        NPCMode[objNum] = AI_SCHEDULE;
    }
}
```

**搜尋方向是「從終點往起點」反向擴散**（`C_1E0F_2A74` 從目標格開始）。NPC 之後沿著回溯出的方向串前進。路徑被壓縮成一串「方向 + 重複次數」存於 `D_8C42->content[index][]`。

### 3.4 重算的節流

效能保護，避免太多 NPC 同時跑昂貴尋路：

- 最多 8 條路徑同時存在（`PTH_Index < 8`，`__NewPathIndex`）。
- 每 tick 限制重算與移動的 NPC 數量：`D_17A5 < 3`（移動）、`D_17A7 < 3`（重算路徑）。

---

## 四、沿路前進與受阻處理（Blocking）

### 4.1 「能不能站」判定（`C_1E0F_000F`）— 角色在這裡才算障礙

走每一步前，`TryStraightMove` 呼叫 `C_1E0F_000F` 檢查目標格是否可站。它用 `FindLoc(x, y)` 掃描該格所有東西。對於擋路的**角色**：

```c
if(i < 0x100 && i) {            /* i 是角色，且非 Avatar(編號 0) */
    if((di 不是少數可踩過的小生物) || di == objTyp) {
        keepFind = retVal = 0;  /* 判定為不可站 → 失敗 */
        break;
    }
}
```

- 一般角色（`i < 0x100`）被視為**實心、不可穿越**的障礙，等同牆。
- 例外：同隊玩家角色之間（`IsPlrControl` 分支）會 `continue` 互相穿過——這就是隊友能擠在一起不卡死的原因；此寬鬆規則不適用於一般 NPC 之間。
- 少數可被踩過的小生物（如老鼠 `OBJ_162`）也有例外。

> **對比 3.2：尋路規劃時角色不算障礙，但實際走路時角色算障礙。** 兩者的不一致，正是「為什麼會撞上沒被規劃進去的人」的根源，也是下面那套受阻機制必須存在的理由。

### 4.2 沿路走與受阻降級（`__DoOnPath`）

NPC 在 `AI_ONPATH` 狀態下，從路徑陣列讀出下一步方向，呼叫 `TryStraightMove` 嘗試直線走一步：

```c
static __DoOnPath(int objNum, int x, int y) {
    index = Leader[objNum];
    info  = D_8C42->content[index][PathCounter[index]];

    if(info == 0) {                              /* 已到路徑終點 */
        PathObject[index] = 0;
        if(COMBAT_getCathesus(objNum, x, y) < 2) /* 距目標 ≤ 1 格（八方相鄰） */
            __AtDestination(objNum);             /*   → 視為到達 */
        else
            NPCMode[objNum] = AI_FINDPATH;        /*   → 否則重新規劃 */
        SubMov(objNum, 5);

    } else if(TryStraightMove(objNum, (info & 3) << 1, 1)) {
        /* 走成功：累計嘗試次數，推進到路徑下一段 */
        if((info >> 2) <= ++PathTries[index]) {
            PathCounter[index] ++;
            PathTries[index] = 0;
        }
        NPCMode[objNum] = AI_ONPATH;

    } else if(NPCMode[objNum] == AI_ONPATH) {     /* 受阻第 1 次 */
        NPCMode[objNum] = AI_84;
        MovePts[objNum] = 0;                      /*   這回合不動，原地等 */
    } else if(NPCMode[objNum] == AI_84) {         /* 受阻第 2 次 */
        NPCMode[objNum] = AI_85;
        MovePts[objNum] = 0;
    } else if(NPCMode[objNum] == AI_85) {         /* 受阻第 3 次 */
        NPCMode[objNum] = AI_86;                  /*   放棄此路徑 */
        MovePts[objNum] = 0;
        PathObject[index] = 0;
        if(GetX(objNum)+DirIncrX[info]==x && GetY(objNum)+DirIncrY[info]==y)
            __AtDestination(objNum);              /*   若剛好貼著目標就算到 */
    }
}
```

**受阻處理是一套「降級狀態機」**：

```
AI_ONPATH(0x83) ──走得通──> 前進，推進路徑
      │ 被擋(等1回合, MovePts=0)
      ▼
   AI_84(0x84) ──走得通──> 前進
      │ 被擋(等1回合)
      ▼
   AI_85(0x85) ──走得通──> 前進
      │ 被擋(等1回合)
      ▼
   AI_86(0x86) ──放棄路徑──> 回 AI_FINDPATH 重算
              （若已貼著目標則視為到達）
```

`ai.h` 裡標註「b1?/b2?/bl?」的 `AI_84 / AI_85 / AI_86` 三個神秘模式，本質就是**受阻重試計數器**：給被擋的 NPC 連續三個回合的寬限期，賭擋路者（常是另一個移動中的 NPC 或玩家）會自己讓開。三回合都過不去才整條路徑作廢、重新規劃。

### 4.3 對角線移動的側向繞行（唯一的主動繞行）

`TryStraightMove` 本身不繞路。唯一的小幅繞行在斜向移動時（`__TryDiagMove`、以及 `C_1E0F_0664` 中 `dir & 1` 的處理）：斜走不通時，會試「先走垂直分量」或「先走水平分量」，再不行試水平反向（帶 `OSI_rand` 隨機）。但這只試一兩個鄰格，不是真正的繞路規劃。

---

## 五、典型情境的行為結果

### 5.1 主角站在 NPC 的「路徑中途」

1. 尋路成功（規劃時不看角色），NPC 朝你走來。
2. 走到你那格時 `TryStraightMove` 失敗 → 進入 `AI_84/85/86` 等待降級。
3. 三回合後放棄，回 `AI_FINDPATH` 重算。**重算的新路徑同樣不含角色**，所以只會繞開靜態障礙，對你依舊「視而不見」——它只是賭你已移開，或幾何上找到另一條不經過你的路。
4. 若那是唯一通道，NPC 會在 `AI_86 ↔ AI_FINDPATH` 間反覆，過不去——直到排程時鐘切換目標（§2.2），或它離開視野被瞬移（§六）。

> NPC 沒有「推開你」或「智慧繞開動態障礙」的能力。擋路者多半不是被繞過，而是**被等過**——靠對方自行移動、排程改變或隨機性打破僵局。

### 5.2 主角站在 NPC 的「目標點本身」

這與擋路不同：你站的是**終點**。

1. 因為尋路不把你算障礙，**尋路必定成功**，把 NPC 帶到你面前。
2. 但 §4.2 的「到達判定」是寬容的：`COMBAT_getCathesus < 2`（切比雪夫距離 ≤ 1，即八方相鄰）即視為到達。
3. **所以 NPC 通常擠到你旁邊一格就被判定「到了」**，停止折騰、進入工作狀態（不再反覆重算）。
4. 但執行動作所需的道具（椅子 / 床 / 桌子）是用 `C_1E0F_2184` 在 **NPC 自己腳下那格** 找的；道具在你腳下、不在它腳下 → 找不到 → 它「到岗了」卻坐不下/睡不到床，只能站在你旁邊發呆。
   - 睡覺特例：找不到床會走 `SetTypeUnconscious`，原地（你旁邊地板）昏睡。
5. 不需道具的動作（站岗 `AI_STAND_*` / 守衛 `AI_GUARD_*`）：擠到旁邊、轉向正確方向，照常履職。
6. 只有當你連它的所有相鄰格都堵死（它連貼近都做不到）時，才會陷入反覆重算，最終靠排程切換或瞬移化解。

> 「相鄰即到達 + 道具就地查找 + 找不到就將就」是個務實的容錯設計：NPC 優雅降級，而非崩潰或永久卡死。

---

## 六、視野層兜底：離開可見區即瞬移（`C_1E0F_291C`）

當 NPC 走出 Avatar 周圍可見區（主迴圈中 `& bp_02` 的邊界判斷），引擎不再逐格模擬，改用 `C_1E0F_291C` 直接 `MoveObj` 把它瞬移到排程座標：

```c
static C_1E0F_291C(int objNum) {
    /* 若 NPC 或其目標在 Avatar 附近(±5格)且不允許瞬移 → 不處理 */
    if(!AllowNPCTeleport && z==MapZ &&
       x>=MapX-5 && x<=MapX+5 && y>=MapY-5 && y<=MapY+5) return;
    ...
    MoveObj(objNum, x, y, GetCoordZ(sched_xyz));  /* 直接瞬移到排程座標 */
    __AtDestination(objNum);
}
```

因此：玩家在場時看到的「卡死」只是「看得見才精細模擬」的局部現象。NPC 一旦脫離視野，就「啪」地出現在該在的位置——這是確保世界狀態最終一致的最後兜底。

---

## 七、抵達目的地後的行為（`__AtDestination`）與方向系統

NPC 一旦被判定抵達（見 §4.2「相鄰即到達」），就進入 `__AtDestination`（`C_1E0F_2276`）。這是「到岗後做什麼」的總開關：讀取排程條目的 `action`，把 `NPCMode` 設成該動作，再依動作分流到各種定義好的姿態。所有「呈現」幾乎都是**換貼圖（`ObjShapeType`）＋ 設動畫影格（`SetFrame`）＋ 設朝向**的組合，U6 並沒有真正的工作邏輯。

### 7.1 `__AtDestination` 的行為分流

```c
static __AtDestination(int objNum) {
    action  = Schedule[...].action;
    isAtDest = (NPC 當前座標 == 排程目標座標);   /* 是否精確到位 */
    NPCMode[objNum] = action;                    /* 先樂觀設為目標動作 */
    ...依 action 分流（見下表）...
    if(!isAtDest) {                              /* 結尾：沒精確到位的補救 */
        NPCMode[objNum] = AI_FINDPATH;           /*   重新規劃路徑 */
        if(GetType == OBJ_188)                    /*   若還是彈琴貼圖 → 換回人形 */
            ObjShapeType[objNum] = TypeFrame(OBJ_182, 0);
    }
}
```

各動作的處理（需要道具者都先檢查 `IsOutOfArea`，在可見區外則設回 `AI_SCHEDULE` 交給瞬移系統）：

| 排程動作 | 需要的道具 | 找到道具的呈現 | 找不到的退路 | 強制 `isAtDest=1`? |
|---|---|---|---|---|
| `AI_SLEEP` 睡 | 床 `OBJ_0A3` | 換睡姿貼圖 `OBJ_092` 躺床上 | 原地昏睡 `SetTypeUnconscious` | 是 |
| `AI_SIT` 坐 | 椅子 `OBJ_0FC` | 坐姿、朝向取椅子（見 §7.3） | 站著 | 是 |
| `AI_PLAY` 演奏 | 椅子 | 椅子影格設 2，換彈琴貼圖 `OBJ_188` | 站著 | 是 |
| `AI_EAT` 吃 | 桌子 | 面向盤子方位坐下（見 §7.2） | 朝預設方向站 | 是 |
| `AI_RINGBELL` 敲鐘 | 拉繩 | 觸發鐘聲與鐘的動畫 | — | 是 |
| `AI_STAND_*` 站立 | 無 | `SetDirection` 轉向指定方位 | （沒到位則重新尋路） | 否 |
| `AI_GUARD_*` 守衛 | 無 | `SetDirection` 轉向指定方位 | （沒到位則重新尋路） | 否 |

**關鍵不一致**：睡／坐／演奏／吃／敲鐘都強制 `isAtDest = 1`（靠「相鄰即到達」將就，不走結尾的重新尋路補救）；而**站立／守衛沒有設** `isAtDest = 1`，因此沒精確踏上目標格時會被打回 `AI_FINDPATH` 繼續挪——這解釋了為何守衛較執著於走到精確岗位點，而坐著吃飯的 NPC 比較「將就」。

> 注意：`AI_FARM`（耕作）、`AI_WANDER`（遊蕩）、`AI_LOITER`（閒晃）、`AI_GRAZE`（吃草）**不經過** `__AtDestination` 的定點處理。它們是「持續性活動」，在 AI 分派器裡直接走隨機踱步（`C_1E0F_33C4`／`C_1E0F_37DB`），到了區域就一直在附近晃，讓玩家腦補成「在幹活」。

### 7.2 吃飯的動態朝向（`C_1E0F_2125`）

`AI_EAT` 找到桌子後，用 `C_1E0F_2125` 偵測「盤子」在桌子的哪個方位，讓 NPC 面朝盤子坐下：

```c
/* 在 {x,y,z} 四個正交方向找盤子 OBJ_077 */
static C_1E0F_2125(int x, int y, int z) {
    for(si = 0; si < 8; si += 2) {        /* si=0,2,4,6 → 北東南西四正交方向 */
        for(di = FindLoc(DirIncrX[si]+x, DirIncrY[si]+y, z); di >= 0; di = NextLoc())
            if(GetType(di) == OBJ_077) break;   /* 找到盤子 */
        if(di >= 0) break;
    }
    return (si < 8) ? si + 1 : 0;          /* 回傳方向編碼+1；四周無盤回 0 */
}
```

吃飯處理用其回傳值設定桌子影格與 NPC 朝向：`SetFrame(桌子, bp_02>>1)`、`C_1E0F_0664(objNum, bp_02-1)`——NPC 面朝有盤子那格坐，看起來像對著餐點用餐。此函式也兼作「找餐椅」的篩選條件（要求椅子周圍有盤子才算數）。

### 7.3 方向系統與影格編碼（`C_1E0F_0664`）

**8 方向編碼**（`DirIncrX[]/DirIncrY[]`，Y 軸向下為正，自正北順時針）：

| 編號 | (dx, dy) | 方向 | | 編號 | (dx, dy) | 方向 |
|---|---|---|---|---|---|---|
| 0 | (0, −1) | 北 N | | 4 | (0, 1) | 南 S |
| 1 | (1, −1) | 東北 NE | | 5 | (−1, 1) | 西南 SW |
| 2 | (1, 0) | 東 E | | 6 | (−1, 0) | 西 W |
| 3 | (1, 1) | 東南 SE | | 7 | (−1, −1) | 西北 NW |

偶數（0/2/4/6）為正交，奇數為對角。應用例：`C_1E0F_2125` 用 `si += 2` 只掃正交四向；`AI_STAND_*`/`AI_GUARD_*` 用 `((action-AI_STAND_N)&3)<<1` 把站立動作映射到 0/2/4/6；坐下寫死 `0`（北）、演奏寫死 `4`（南）。

**影格公式**：U6 精靈圖採「**影格 = 朝向 × 每方向影格數 + 動作影格**」。`C_1E0F_0664(objNum, dir)` 依生物類型用不同的「每方向影格數」拆解／重組：

- 一般人形（`OBJ_178~183` 等）：每方向 **4** 格（`<<2` / `&3`），組內為走路動畫相位，配合走路狀態機（站立／邁步交替）。
- `OBJ_16A`：每方向 **12** 格；`OBJ_16B`：每方向 **3** 格；`OBJ_15C…`／彈琴 `OBJ_188` 一類：每方向 **2** 格（`>>1` / `&1`）。
- `OBJ_164`：無方向，直接 `OSI_rand(0,2)` 隨機影格（火焰／水波之類）。

`MACRO_A(dir, dirFram)` 的作用是把 8 方向**摺疊成 4 方向**（多數精靈只畫北東南西四向，對角沿用相鄰正交向的貼圖）。

**坐椅子時朝向被椅子覆蓋（重點）**：

```c
if(isOnChair) {
    objFrm = 3;                          /* 坐姿動作影格固定為 3 */
    if(bp_06 == OBJ_0FC)                  /* 坐的是椅子 */
        dirFram = GetFrame(tmpObj);       /* ★ 朝向 = 椅子自己的影格，無視傳入的 dir */
    else
        dirFram = 2;                      /* 其他坐具固定朝向 2 */
}
objFrm = objFrm + (dirFram << 2);
```

也就是說，`AI_SIT` 傳入的 `dir=0`、`AI_PLAY` 傳入的 `dir=4`，在**真正坐上椅子時會被椅子的影格覆蓋**——NPC 朝哪邊坐，由**地圖上椅子的擺放方向**決定，不是 NPC 自己決定。寫死的 `dir` 只在「沒坐到椅子、退而站著」時才生效。設計分工很清楚：地圖設計者擺椅子時就定好了坐向，引擎只讓 NPC 貼圖去配合椅子，既省事又保證視覺正確（人不會背對椅背坐）。

**對角避障與多格生物**：朝對角移動時（`dir & 1`），長身生物（蛇 `OBJ_1AA`、`OBJ_19C` 等）會先用 `C_1E0F_05D8` 檢查側邊是否被擋，被擋就把 `dir` 修正成相鄰正交向；並透過 `OBJ_getHead` 找頭／尾段同步更新影格與位置，讓多格身軀一起轉向移動。

> 朝向系統的完整拼圖：**移動／站立**用傳入的 8 方向值（摺疊成 4 向貼圖）、**吃飯**用 `C_1E0F_2125` 動態對準盤子、**坐／演奏**則被椅子的擺放影格覆蓋。會被玩家仔細看的「對著盤子吃飯」做了動態計算，其餘姿態用固定值＋地圖擺設即足夠——典型的 U6 省力風格。

---

## 八、守衛與執法系統

守衛（guard）並不是一套獨立的智慧 AI，而是「排程站岗」＋「犯罪廣播」＋「逮捕問答」幾個鬆散部分拼起來的。理解它的關鍵是：**守衛沒有眼睛、沒有巡邏智能、也沒有通緝記憶**；治安完全靠一個犯罪廣播函式、距離輻射、陣營過濾與幾個簡單 AI 模式堆出來。

### 8.1 平時站岗 —— 純粹的「轉向 + 微動」

平時無事的守衛處於 `AI_GUARD_N/E/S/W`（朝東南西北守衛）。到達岗位後（`__AtDestination`）只做兩件事：`SetDirection` 轉向指定方向、定住；之後在分派器中有 1/2 機率（`OSI_rand(0,1)`）原地朝守衛方向走一步又退回，製造「踱步戒備」的微動感。

> 守衛的「巡邏」其實是**排程**把不同時段的岗位座標排出來的（見 §二），不是守衛自己決定的。站岗本身與農夫被擺在田裡隨機踱步（`AI_FARM`）是同一套機制。

### 8.2 視線判定 `COMBAT_canSee` —— 不算遮擋

守衛追捕時用 `COMBAT_canSee(A, B)` 判斷「A 能否看見 B」。但它**完全不計算牆壁遮擋、視錐角度或距離**，只檢查 B 是否處於不可見狀態：

```c
COMBAT_canSee(objNum_0, objNum_1) {
    isVisible = !IsInvisible(objNum_1);            /* 隱形 → 看不見 */
    /* 例外：玩家角色之間即使隱形也互相看得見 */
    if(IsDraggedUnder(objNum_1)) isVisible = 0;     /* 被拖入水下等 */
    if(ObjShapeType == OBJ_165)  isVisible = 0;     /* 特定隱蔽形態 */
    if(IsTileIg(...))            isVisible = 0;      /* tile 標記不可見 */
    if(GetZ(0) != GetZ(1))       isVisible = 0;     /* 不同樓層 → 看不見 */
    return isVisible;
}
```

> **U6 的「視線」＝同一樓層 + 對方沒隱身。** 沒有牆壁阻擋判定、沒有視錐、沒有距離上限（距離限制由各呼叫端自行加，例如追捕用 `dist_min = 50`）。這解釋了為何守衛/怪物有時「隔著牆」也能鎖定你——引擎層面它們確實不被牆擋視線。

### 8.3 犯罪廣播 `C_2337_1B0E` —— 「做了壞事，所有人追他」

當玩家做了壞事（偷竊被察覺、攻擊無辜者等）時呼叫。原註解：*The avatar did a bad action and "everyone" run after him*。

```c
C_2337_1B0E() {
    SubKarma(5);                                 /* 扣 5 點業力 */
    for(objNum = 0; objNum < 0x100; objNum ++) { /* 遍歷全部 256 角色 */
        if(!ObjShapeType[objNum]) continue;
        if(GetZ(objNum) != MapZ)   continue;     /* 不同層不反應 */
        if(IsDead || IsPlrControl || GetAlignment != NEUTRAL) continue;

        if(GetType(objNum) == OBJ_17E) {         /* 守衛 */
            if(COMBAT_getCathesus(objNum, MapX, MapY) < 32)
                NPCMode[objNum] = AI_ARREST;     /*   32 格內 → 出動逮捕 */
            continue;
        }
        /* 一般平民：6 格外不反應 */
        if(... AI_IMMOBILE/AI_MOTIONLESS ...) continue;
        if(COMBAT_getCathesus(objNum, MapX, MapY) >= 6) continue;

        if(NPCMode[objNum] >= AI_SCHEDULE) {     /* 有行動力的平民 */
            if(NPCMode[objNum] <= AI_86) continue;
            if(GetType(objNum) == OBJ_188)       /*   演奏中的先換回原貌 */
                ObjShapeType[objNum] = OrigShapeType[objNum];
            NPCMode[objNum] = AI_VIGILANTE;      /*   → 義警，直接動手 */
        } else {
            NPCMode[objNum] = AI_FEAR;           /*   膽小者 → 嚇跑 */
        }
    }
}
```

廣播按身份與距離分派三種反應：

| 對象 | 條件 | 反應 |
|------|------|------|
| 守衛（`OBJ_17E`） | 32 格（切比雪夫）內 | `AI_ARREST`（逮捕） |
| 有行動力的平民 | 6 格內 | `AI_VIGILANTE`（義警圍毆，走 `COMBAT_AI_Assault`） |
| 其他平民 | 6 格內 | `AI_FEAR`（恐懼逃跑，走 `COMBAT_AI_Retreat`） |

幾個關鍵特性：

- **無「持續通緝」狀態**：這是一次性的警報廣播，犯罪當下把附近的人切到對應模式，之後各自跑 AI。不維護全域「通緝犯」旗標，所以逃遠或甩開／打倒附近的人，警報自然消退（守衛抓不到你最終回 `AI_FINDPATH`／排程）。
- **靠「廣播距離」而非個體視線**：用距離（32／6 格）輻射，守衛不需真的「看著」你——這是為何被抓時感覺「整條街都知道」。`COMBAT_canSee` 只在守衛**追捕中鎖定目標**時用，與犯罪偵測是兩回事。
- **陣營是過濾器**：只有 `NEUTRAL`（中立平民／守衛）會響應；已是朋友（GOOD）或敵人（EVIL）的不參與。

### 8.4 追捕 —— `AI_ARREST` 鎖定與逼近（`C_1E0F_39B3`）

被切成 `AI_ARREST` 的守衛每回合呼叫 `C_1E0F_39B3`：

```c
static C_1E0F_39B3(int objNum) {
    dist_min = 50; si = -1;
    for(每個隊員 di) {
        if(ObjShapeType[di] && !IsDead(di) && COMBAT_canSee(objNum, di)) {
            dist = 平方距離;
            if(dist < dist_min || (dist == dist_min && OSI_rand(0,1)))
                { dist_min = dist; si = di; }   /* 鎖定最近的隊員 */
        }
    }
    if(si < 0) TryMoveTo(objNum, PartyGravityX, PartyGravityY); /* 看不見任何人→朝隊伍重心追 */
    else {
        TryMoveTo(objNum, GetX(si), GetY(si));  /* 帶隨機抖動的趨近，非精確尋路 */
        if(!CLOSE_ENOUGH0(1, ...)) si = -1;     /* 必須貼身(1格內)才回傳目標 */
    }
    return si;
}
```

- 掃描全隊，鎖定**看得見且最近**的隊員（距離相同隨機二選一）。
- `TryMoveTo` 是帶隨機抖動的「醉漢式」趨近（撞牆換向），不是精確尋路。
- 看不見任何隊員時，朝**隊伍重心**（`PartyGravity`）盲追。
- 只有**走到貼身（1 格內）** 才回傳目標編號，觸發下一步逮捕。

### 8.5 逮捕問答 —— `C_1E0F_3B60`

守衛貼身後，分派器呼叫 `C_1E0F_3B60`：

```c
static C_1E0F_3B60(int bp06) {
    if(!(TalkFlags[5] & 0x80)) {                /* 前提旗標未設 → 放棄逮捕 */
        NPCMode[bp06] = AI_FINDPATH; return;
    }
    CON_printf(ArrestMsg);  /* "Thou art under arrest! Wilt thou come quietly?" */
    do bp_06 = CON_getch(); while(bp_06 != 'N' && bp_06 != 'Y');
    NPCMode[bp06] = AI_FINDPATH;

    if(bp_06 == 'Y') {                          /* 束手就擒 */
        CON_printf(GotoJailMsg);  /* "The guard strikes thee unconscious!..." */
        PartyTeleport(0x0e7, 0x0ba, 0, 0);      /*   全隊瞬移入獄 */
        while(Time_H != 8) C_0A33_1355(60);     /*   快轉到早上 8 點（關一晚） */
        /* 沒收部分物品(OBJ_03F 刪除)、特定證物(OBJ_040 qual 9)鎖進獄中容器 */
        SetFrame(獄門 OBJ_12C, 9);              /*   鎖上牢門 */
        ScreenFade = 1; ...                      /*   淡入淡出 + 音樂 + 動畫過場 */
    } else {                                    /* 拒捕 */
        NPCMode[bp06] = AI_ASSAULT; SetAlignment(bp06, EVIL);
        for(di = 0; di < 0x100; di ++)          /*   全場 AI_ARREST 守衛一起翻臉 */
            if(NPCMode[di] == AI_ARREST) {
                NPCMode[di] = AI_ASSAULT; SetAlignment(di, EVIL);
            }
    }
}
```

- **前提旗標**：`TalkFlags[5] & 0x80` 未設時守衛直接放棄逮捕（用於在特定階段／地點關閉逮捕機制）。
- **選 Yes（就擒）**：打昏 → 全隊瞬移至監獄座標 `(0xE7, 0xBA)` → 快轉時間到早上 8 點 → 沒收部分物品、特定證物移入獄中容器 → 鎖上獄門 `(0xE7, 0xB8)` 的 `OBJ_12C`（影格設 9）→ 過場。
- **選 No（拒捕）**：當場**所有** `AI_ARREST` 守衛同時轉 `AI_ASSAULT` + `EVIL`，全城圍毆——這就是「拒捕＝全城守衛圍毆」的來源。

### 8.6 義警 `AI_VIGILANTE`

直接走 `COMBAT_AI_Assault`，與突擊同邏輯——「先斬後奏」型執法者，鎖定就打，沒有先禮後兵的問答。排程切換中（`C_1E0F_5165` 一帶）對 `AI_VIGILANTE` 另有特殊處理。

### 8.7 觸發來源：偷竊範例（`C_1E0F_3D8D`）

犯罪偵測與守衛追捕是**解耦**的：犯罪動作的程式負責呼叫廣播 `C_2337_1B0E`，守衛只被動執行。小偷 NPC（`AI_THIEF`）偷玩家金幣即一例：

```c
static C_1E0F_3D8D(int objNum_0, int objNum_1) {
    /* 註：原碼有 bug，第二參數其實是 party index，應先 objNum_1 = Party[objNum_1] */
    if(!TestObj(objNum_1, OBJ_058)) return;             /* 沒金幣就算了 */
    TakeObj(objNum_1, OBJ_058, OSI_rand(10, 30));        /* 偷走 10~30 金幣 */
    if((GetInt(objNum_1) + 30 - GetDex(objNum_0)) / 2 <= OSI_rand(1, 30))
        CON_printf(StealMsg, ...);  /* 被察覺："The %s stole some gold!" */
}
```

被察覺與否取決於**受害者智力 vs 小偷敏捷**的擲骰：`(受害者INT + 30 - 小偷DEX) / 2 ≤ rand(1,30)` 時印出「被偷」訊息。受害者越笨、小偷越敏捷，越不易被察覺。

### 8.8 完整執法流程

```
玩家做壞事
   │
   ▼
C_2337_1B0E  ── 扣業力5 + 按距離/身份/陣營廣播
   │
   ├─ 守衛(32格內)   → AI_ARREST
   ├─ 硬漢平民(6格內) → AI_VIGILANTE（直接打）
   └─ 膽小平民(6格內) → AI_FEAR（逃跑）
   │
   ▼ (守衛)
C_1E0F_39B3 ── 鎖定最近隊員 → TryMoveTo 趨近(隨機抖動) → 貼身
   │
   ▼
C_1E0F_3B60 ── 前提旗標檢查 → ArrestMsg「束手就擒？」
   │
   ├─ Yes → 打昏 → 入獄瞬移 + 快轉到8點 + 沒收物品 + 鎖門
   └─ No  → 全場 AI_ARREST 守衛同時轉 AI_ASSAULT+EVIL 圍毆
```

> U6 的守衛沒有視錐、沒有巡邏 AI、沒有警覺度累積。「治安」是用一個犯罪廣播 + 距離輻射 + 陣營過濾 + 幾個簡單 AI 模式拼出來的；平時守衛只是被排程擺在岗位上轉向的擺設，只有犯罪廣播把它點燃時，才短暫變成會追、會問、會抓的執法者。極簡實現卻能讓玩家產生「這城市有法律、有後果」的強烈體感。

---

## 九、小偷 NPC（`AI_THIEF`）

小偷（模式編號 `0x97`）幾乎沒有專屬邏輯，是把「扒竊」這個小動作掛在通用行為上拼出來的。它與交談者（`AI_CONVERSE`）共用同一段分派邏輯（`seg_1E0F.c` 行 1785-1796），且程式碼裡藏著一個明顯的賦值順序 bug。

### 9.1 行為流程

```c
case AI_THIEF:
    /* 玩家是否進入小偷被指派活動的區域（排程點 vs 玩家，5 格見方） */
    if(CLOSE_ENOUGH0_S(5, sched_x, sched_y, MapX, MapY)) {
        if((di = C_1E0F_39B3(objNum)) >= 0) {       /* 鎖定並貼身到最近隊員(1格內) */
            NPCMode[objNum] = AI_LOITER;            /* ← bug：偷竊前就把模式改掉了 */
            if(NPCMode[objNum] == AI_THIEF)         /*   此判斷因上一行而永遠為假 */
                C_1E0F_3D8D(objNum, di);            /*   偷金幣（實際永遠走不到） */
            else
                C_1E0F_3E08(objNum, di);            /*   改成跟玩家交談 */
        }
    } else {
        C_1E0F_33C4(objNum, sched_x, sched_y);      /* 玩家未靠近 → 原地附近隨機晃蕩 */
    }
    break;
```

三階段：

1. **等獵物**：每回合用 `CLOSE_ENOUGH0_S(5, ...)` 判斷玩家是否進入小偷地盤（**排程目標點與玩家** X、Y 距離皆 < 5）。未進入就走 `C_1E0F_33C4` 在地盤裡隨機踱步（與 `AI_LOITER`/`AI_FARM` 同套機制），混在人群中等待。
2. **貼近**：玩家進入區域後，呼叫守衛同款的 `C_1E0F_39B3`——掃描全隊、鎖定看得見且最近的隊員、`TryMoveTo` 帶隨機抖動趨近，貼身到 1 格內才回傳目標。
3. **下手**：貼身後（本應）執行 `C_1E0F_3D8D` 偷金幣。

### 9.2 偷竊判定（`C_1E0F_3D8D`）

```c
static C_1E0F_3D8D(int objNum_0, int objNum_1) {
    /* 註：原碼 bug，第二參數其實是 party index，應先 objNum_1 = Party[objNum_1] */
    if(!TestObj(objNum_1, OBJ_058)) return;             /* 沒金幣 → 放棄 */
    TakeObj(objNum_1, OBJ_058, OSI_rand(10, 30));        /* 無條件偷走 10~30 金幣 */
    if((GetInt(objNum_1) + 30 - GetDex(objNum_0)) / 2 <= OSI_rand(1, 30))
        CON_printf(StealMsg, ...);  /* 顯示 "The %s stole some gold!" */
}
```

- **金幣無條件被偷**：`TakeObj` 在擲骰判斷之前就執行，只要受害者身上有金幣（`OBJ_058`），貼身即偷走 10~30 枚。
- **擲骰只決定是否「顯示被偷訊息」**，不影響偷竊成敗。公式 `(受害者INT + 30 - 小偷DEX) / 2 ≤ rand(1,30)` 牽涉受害者智力與小偷敏捷的對抗（其方向是否符合直覺有疑義，逆向語意需保留），但無論如何不影響金幣已被拿走的事實。

### 9.3 兩個 bug

逆向者標註了兩處問題：

1. **模式賦值順序 bug（行 1788，標 `bug?`）**：`NPCMode[objNum] = AI_LOITER;` 在 `if(NPCMode[objNum] == AI_THIEF)` **之前**執行，使該判斷永遠為假。結果是 `AI_THIEF` 的 NPC 一貼近玩家就被降級為 `AI_LOITER` 並走 `else` 分支（**與玩家交談** `C_1E0F_3E08`），**偷竊分支 `C_1E0F_3D8D` 永遠執行不到**。照這份 PC 版逆向碼字面執行，小偷實際上偷不了東西——很可能是原版的真實 bug。
2. **參數型別誤用**：`C_1E0F_3D8D` 第二參數傳入的是 party index 而非物件編號，缺少 `objNum_1 = Party[objNum_1]` 的轉換。

### 9.4 小偷不受執法系統約束

- 小偷得手（或被降級）後變成 `AI_LOITER`——回到「原地附近隨機閒晃」，混入人群，不逃跑、不被標記。
- **NPC 小偷偷玩家，不會觸發犯罪廣播 `C_2337_1B0E`**（那只對「玩家做壞事」觸發）。所以小偷扒你不會引來守衛抓它——U6 的執法系統只懲罰玩家的惡行，不模擬 NPC 對玩家的犯罪。你被偷了頂多看到一行訊息，得自己去找它算帳。

> 小偷幾乎沒有專屬邏輯：接近用通用隨機晃蕩（`C_1E0F_33C4`）、鎖定貼身用守衛那套（`C_1E0F_39B3`），唯一專屬的 `C_1E0F_3D8D` 還因上游賦值 bug 可能根本觸發不到。它本質上只是個「會在地盤閒晃、玩家靠近就湊過來」的 NPC，扒竊是掛在「貼身」這個通用行為上的小掛件——非常符合 U6 一貫的省力風格。

---

## 十、設計總結

U6 用一套其實相當「笨」的逐格 AI，靠四層機制疊出「活世界」的觀感：

- **規劃層**省成本：尋路不算動態角色、限制每 tick 重算數量、路徑可快取。
- **執行層**臨場應付：走路時才碰撞檢查，受阻就「等待→降級(`84/85/86`)→重算」，但不會真正智慧繞開活人。
- **時間層**保證推進：排程時鐘每小時強制切換目標，NPC 不會因卡住而永久停擺。
- **視野層**最終兜底：離開視野即瞬移到位。

代價是玩家在場時 NPC 面對彼此或玩家擋路會出現「停下來等、僵一下、再疏通」的經典畫面，且可被玩家用身體阻擋、操縱行程——而這份「有規則、又可被戲弄」的質感，正是 U6 沙盒世界感的來源。

---

*資料來源：`ergonomy-joe/u6-decompiled`（GAME.EXE 逆向重建，2013，Borland Turbo C 2.0）。函式名為逆向者所命名，`seg_XXXX` 為原始記憶體區段編號。標註 `?` 處為原逆向註解中未完全確定的部分。*
