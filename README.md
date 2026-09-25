# 《星域防線》Starward Bastion

一款在桌面瀏覽器遊玩的未來科技塔防遊戲，採正上方俯視視角。你要守衛人類星際殖民地的能源核心，擋住沿地表通道與空中航道進攻的機械群。

> 開發中。目前的進度請見 [`PLAN.md`](PLAN.md) 的階段表。

## 特色

- **20 張地圖**：難度從一星到五星，每張都是 20 波。
- **12 種防禦塔**：分為對地、對空、空地共用三類，攻擊方式包含：
  - 無視護盾
  - 直線穿透
  - 範圍爆炸
  - 連續光束
  - 鏈式跳躍
  - 追蹤飛彈
  - 無人機
  - 重力減速
- **塔升級、移動與出售**：每座塔可升到 Lv3，提升傷害與射程；也可以隨時移到其他位置（保留等級），或出售回收部分資金。
- **16 種敵人**：包含一般、快速、重裝、護盾、空中、隱形與分裂型。隱形敵人只有冰晶偵測塔（T05）才能讓它們現形；T05 攻擊射程 4.5 格（Lv2／Lv3：4.75／5.0 格），偵測半徑 6 格。
- **地面路線與空中航道**：每張地圖都有地空共用路段，並以不同線型標示，不只靠顏色區分。
- **20 首原創 8-bit 背景音樂**：每張地圖一首，以 Web Audio 即時合成，無縫循環；另有首頁與地圖選擇共用的選單曲《星域序曲》，首頁載入即嘗試播放（瀏覽器要求先操作時會顯示提示）；首頁與地圖選擇的按鈕有點擊音效。
- **戰果分享卡**：每局勝利或失敗後，都可以下載 1200×675 的 PNG 戰果分享卡。
- **四語介面**：繁體中文、English、日本語、한국어，涵蓋首頁、對局、塔／敵人提示與戰果分享卡；切換語言不重整畫面。
- **遊戲本體無外部相依**：不使用框架、遊戲引擎或外部美術／音訊素材；依使用者指定，頁尾另載入 Buy Me a Coffee CDN 贊助小工具，於右下角顯示，需連線使用。

## 系統需求

- 桌面瀏覽器：Chrome／Edge 111 以上、Firefox 115 以上、Safari 16.4 以上。
- 視口至少 1280×720。已針對 1280×720、1366×768、1920×1080 與 2560×1440 調整。
- 只支援滑鼠與鍵盤，不支援手機或觸控。

## 執行

遊戲使用 ES 模組，因此必須透過 HTTP 開啟，直接雙擊 `index.html` 無法執行。

```sh
node tools/serve.mjs      # 需要 Node.js 20 以上，開啟 http://localhost:8080
```

也可以使用任何靜態網站伺服器，或部署到靜態網站主機。

部署前執行 `npm run assets:hash`，依 JS／CSS 內容產生 `?hash`，同步首頁 import map 與 Service Worker 快取版本；提交 `index.html`、`sw.js` 與修改過的資源。`node tools/hash-assets.mjs --check` 可檢查雜湊是否過期。模組相依檔也全部版本化，不只入口 JS。

首頁由 `src/boot.js` 先等待離線快取更新，再載入 CSS 與遊戲。Service Worker 不忽略查詢參數；導覽優先網路、離線才回退已快取首頁，避免新介面配到舊程式。舊版工作者首次收到更新前仍可能回傳舊首頁，更新完成後重新整理即可，毋須清除音量設定。

## 語言與分享網址

右上角可隨時切換語言，網址使用 `?lang=zh`、`?lang=en`、`?lang=ja`、`?lang=ko`。沒有有效的 `lang` 參數時預設使用英文；中文介面為繁體中文。

切換使用 History API，不重載頁面，不重設對局、暫停、音量、選塔或移塔狀態；瀏覽器上一頁／下一頁也會同步語言。重新載入仍依原本規則回到首頁，不提供續關。下載分享卡使用下載當下的語言，不修改原始戰果快照。

[`sitemap.xml`](sitemap.xml) 列出首頁及四個語系網址，含互相對應的 `hreflang` 與 `x-default`；[`robots.txt`](robots.txt) 宣告網站地圖。HTML 提供相同語言連結，執行 JavaScript 後會同步標題、描述、`lang`、canonical、OG／Twitter 標籤。本站是純靜態網站：不執行 JavaScript 的分享爬蟲仍會讀到預設英文標籤與英文分享圖。

## 操作

| 按鍵 | 功能 |
|---|---|
| 滑鼠左鍵 | 選取塔、在可建塔格上放置（塔佔 2×2 格）；點擊已建造的塔查看等級、升級、移動與出售 |
| `1`–`0`、`-`、`=` | 選取 T01–T12 |
| `Esc` | 取消選取 |
| `Space` | 開始下一波 |
| `P` | 暫停／繼續 |
| `F` | 切換倍速 1× → 2× → 4× |
| `U` | 升級選取中的已建造塔 |
| `V` | 移動選取中的已建造塔（再按 `V`、`Esc` 或右鍵取消） |
| `S` | 出售選取中的已建造塔 |
| `M`／`N` | 音樂靜音／音效靜音 |

首頁、地圖選擇與對局頂部狀態列都有音樂與音效的音量滑桿（0–100%），旁邊的按鈕可以切換靜音。音量與靜音設定會保存在瀏覽器中，下次開啟時沿用。

## 基本規則

- 開局有 550 CR，基地生命為 20。
- 第 2 到第 20 波，按下「開始下一波」時各會發放 180 CR。擊敗敵人另可獲得獎勵 CR。
- 敵人每 2 秒出現一名，多入口地圖會依序輪替入口。
- 塔可升級至 Lv3：Lv2 花造價 60%，傷害 ×1.4、射程 +0.25 格；Lv3 再花造價 80%，傷害 ×1.8、射程 +0.5 格（皆相對 Lv1）。
- 塔可隨時移動或出售，波次進行中也可以。移動費為累計投資（造價＋升級費）的 30%，保留等級與冷卻，放下後立即攻擊；出售退還累計投資的 70%。兩者都四捨五入至 10 CR。
- 每有一名敵人抵達基地，基地生命就減 1，歸零即失敗。
- 擊敗第 20 波的全部敵人，且基地仍存活，即為勝利。

## How to Play (English)

### Controls

| Input | Action |
|---|---|
| Left click | Select a tower or place one on buildable tiles (2×2); click a built tower to view its level, upgrade, move or sell it |
| `1`–`0`, `-`, `=` | Select towers T01–T12 |
| `Esc` | Cancel selection |
| `Space` | Start the next wave |
| `P` | Pause / resume |
| `F` | Cycle speed: 1× → 2× → 4× |
| `U` | Upgrade the selected built tower |
| `V` | Move the selected built tower (press `V`, `Esc` or right-click to cancel) |
| `S` | Sell the selected built tower |
| `M` / `N` | Mute music / sound effects |

Music and sound-effect volume sliders (0–100%) are available on the home screen, map selection screen and battle HUD. Use the adjacent buttons to mute them. Volume and mute settings are saved in your browser.

### Basic Rules

- You start with 550 CR and 20 base HP.
- Starting waves 2–20 grants 180 CR each when you press “Start next wave”. Defeated enemies also award CR.
- Enemies spawn every 2 seconds; maps with multiple entrances alternate between them.
- Towers can reach Lv3. Lv2 costs 60% of the build cost, increases damage to ×1.4 and range by 0.25 tile; Lv3 costs another 80%, increases damage to ×1.8 and range by 0.5 tile (all bonuses relative to Lv1).
- You can move or sell towers at any time, including during a wave. Moving costs 30% of the total invested CR (build plus upgrades), keeps the tower’s level and cooldown, and lets it attack immediately after placement. Selling refunds 70% of the total investment. Both amounts are rounded to the nearest 10 CR.
- Each enemy that reaches the base removes 1 HP. You lose when base HP reaches zero.
- Defeat all enemies in wave 20 while the base is still standing to win.

## 遊び方（日本語）

### 操作

| 操作 | 機能 |
|---|---|
| 左クリック | タワーを選択、建設可能なマスに配置（2×2マス）。建設済みタワーをクリックすると、レベルの確認・強化・移動・売却が可能 |
| `1`–`0`、`-`、`=` | T01～T12を選択 |
| `Esc` | 選択を解除 |
| `Space` | 次のウェーブを開始 |
| `P` | 一時停止／再開 |
| `F` | ゲーム速度を切替：1× → 2× → 4× |
| `U` | 選択中の建設済みタワーを強化 |
| `V` | 選択中の建設済みタワーを移動（`V`、`Esc` または右クリックで取消） |
| `S` | 選択中の建設済みタワーを売却 |
| `M`／`N` | 音楽／効果音をミュート |

ホーム画面、マップ選択画面、戦闘画面上部には、音楽と効果音の音量スライダー（0～100%）があります。隣のボタンでミュートを切り替えられます。音量とミュートの設定はブラウザーに保存されます。

### 基本ルール

- 開始時の資金は550 CR、基地のHPは20です。
- 第2～20ウェーブは「次のウェーブを開始」を押すたびに180 CRを獲得します。敵を倒すと追加のCRを獲得できます。
- 敵は2秒ごとに1体出現します。入口が複数あるマップでは、入口を順番に切り替えます。
- タワーはLv3まで強化できます。Lv2は建設費の60%でダメージ×1.4・射程＋0.25マス、Lv3はさらに建設費の80%でダメージ×1.8・射程＋0.5マスになります（いずれもLv1比）。
- タワーはウェーブ中を含め、いつでも移動・売却できます。移動費は総投資額（建設費＋強化費）の30%で、レベルとクールダウンは維持され、再配置後すぐに攻撃できます。売却すると総投資額の70%が返還されます。どちらも10 CR単位に四捨五入されます。
- 敵が1体基地に到達するたびに基地HPが1減り、0になると敗北です。
- 基地を守りながら第20ウェーブの敵をすべて倒すと勝利です。

## 플레이 방법 (한국어)

### 조작

| 입력 | 기능 |
|---|---|
| 마우스 왼쪽 클릭 | 타워 선택 또는 건설 가능한 칸에 배치(2×2칸). 건설된 타워를 클릭하면 레벨 확인, 업그레이드, 이동 및 판매 가능 |
| `1`–`0`, `-`, `=` | T01～T12 선택 |
| `Esc` | 선택 취소 |
| `Space` | 다음 웨이브 시작 |
| `P` | 일시 정지／재개 |
| `F` | 게임 속도 전환: 1× → 2× → 4× |
| `U` | 선택한 건설 완료 타워 업그레이드 |
| `V` | 선택한 건설 완료 타워 이동 (`V`, `Esc` 또는 오른쪽 클릭으로 취소) |
| `S` | 선택한 건설 완료 타워 판매 |
| `M`／`N` | 음악／효과음 음소거 |

홈 화면, 맵 선택 화면, 전투 화면 상단에서 음악과 효과음의 음량을 0～100%로 조절할 수 있습니다. 옆 버튼으로 음소거를 전환할 수 있으며, 음량 및 음소거 설정은 브라우저에 저장됩니다.

### 기본 규칙

- 시작 자원은 550 CR, 기지 체력은 20입니다.
- 2～20 웨이브에서는 ‘다음 웨이브 시작’을 누를 때마다 180 CR을 받습니다. 적을 처치해도 추가 CR을 얻습니다.
- 적은 2초마다 한 명씩 등장하며, 입구가 여러 개인 맵에서는 입구가 순서대로 바뀝니다.
- 타워는 Lv3까지 업그레이드할 수 있습니다. Lv2는 건설 비용의 60%를 지불하고 공격력 ×1.4, 사거리 +0.25칸을 얻습니다. Lv3는 추가로 건설 비용의 80%를 지불하고 공격력 ×1.8, 사거리 +0.5칸을 얻습니다(모두 Lv1 기준).
- 타워는 웨이브 진행 중에도 언제든 이동하거나 판매할 수 있습니다. 이동 비용은 총 투자액(건설비＋업그레이드비)의 30%이며 레벨과 재사용 대기시간은 유지되고, 재배치 후 즉시 공격할 수 있습니다. 판매하면 총 투자액의 70%를 돌려받습니다. 두 금액 모두 10 CR 단위로 반올림합니다.
- 적 한 명이 기지에 도달할 때마다 기지 체력이 1 감소하며, 0이 되면 패배합니다.
- 기지가 살아 있는 상태에서 20 웨이브의 모든 적을 처치하면 승리합니다.

## 開發

```sh
npm test                 # 規格驗證（Gate A）與模擬測試，不需安裝任何套件
npm run spec:waves       # 重新產生波次資料 src/data/waves.js
npm run spec:docs        # 重新產生 docs/ 內的附錄 A–C 與 DESIGN.md
node tools/balance.mjs   # 平衡模擬，輸出 docs/平衡測試報告.md
```

- 規格文件：[`docs/規格補完提案.md`](docs/規格補完提案.md)。
- 資料附錄：
  - [地圖](docs/附錄A_地圖資料.md)
  - [波次](docs/附錄B_波次編成.md)
  - [音樂](docs/附錄C_音樂音序.md)
- 數值總表：[`DESIGN.md`](DESIGN.md)；平衡分析：[平衡測試報告](docs/平衡測試報告.md)。報告以高手、一般（初見）、新手三種玩家模型掃描每張地圖，並做敵人 HP 壓力測試。T05 射程增加後，星級平均一般勝率為 98%／94%／73%／65%／42%；20 圖皆有高手通關解，最佳配置保住至少 80% 基地生命，但只有 12／20 圖符合原訂難度區間（8 圖偏易，見驗收 B9）。
- 協作守則：[`AGENTS.md`](AGENTS.md)。

## 授權

[GNU AGPL-3.0](LICENSE)
