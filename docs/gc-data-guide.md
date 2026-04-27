# GC条件提案 データ投入ガイド（実務向け）

`gc-method-finder.html` は静的JSONのみで動作します。  
GitHub Pagesにそのまま置ける構成のため、**`data/*.json` の更新だけで反映**できます。

---

## 1. 目的と運用方針

- 現在は **GC2014 / CBP** の投入を先行し、将来 **GC-17A / GC-14B** を段階追加する。
- 候補表示は常に「候補提案」であり、確定条件ではない。
- 表記ゆれ吸収・後編集容易性を最優先にし、CSV→JSON変換しやすい列設計にしている。

---

## 2. 編集対象ファイル

- `data/gc-machines.json` : 機械マスター
- `data/gc-columns.json` : カラムマスター
- `data/gc-temp-programs.json` : 温度条件マスター（IDと表示名を分離）
- `data/gc-workplaces.json` : 単位作業場所コードマスター（匿名コードのみ）
- `data/gc-analyte-aliases.json` : analyte表記ゆれ辞書
- `data/gc-rt-library.json` : RTライブラリ本体
- `data/gc-method-rules.json` : 提案ロジック重み・閾値・certainty点数

---

## 2-1. 単位作業場所コードの匿名化ルール（必須）

- 公開ファイル（HTML / JS / JSON / docs）には実在の作業場所名を入れない。
- `data/gc-workplaces.json` は `A01` のような匿名コードのみを扱う。
- `display_label` も匿名コード、または匿名コードに一般化ラベルを加えた形式に限定する。
- 実名との対応表はリポジトリに保存しない（作成機能・保存機能も持たせない）。
- 運用上必要な実名対応は、公開対象外の手元管理でのみ扱う。

---

## 3. RTライブラリの必須スキーマ

`data/gc-rt-library.json` は1レコード1溶剤RTで、以下を必須にします。

```json
{
  "machine_id": "gc2014",
  "column_id": "cbp",
  "temp_program_id": "80c",
  "analyte_original": "IPA",
  "analyte_normalized": "IPA",
  "rt_min": 2.378,
  "certainty": "high",
  "source": "manual_scan",
  "note": "sample"
}
```

### 各項目の意味

- `machine_id` : `gc-machines.json` の `id` を参照
- `column_id` : `gc-columns.json` の `id` を参照
- `temp_program_id` : `gc-temp-programs.json` の `id` を参照
- `analyte_original` : 元データに記載されていた文字列をそのまま保持（監査用）
- `analyte_normalized` : 集計・照合に使う正規化名（同義語はここで統一）
- `rt_min` : RT（分）数値
- `certainty` : `high` / `medium` / `low`
- `source` : 取得元 (`manual_scan`, `verified_note`, `instrument_export`)
- `note` : 補足（例: `sample`, 手書き不鮮明、再確認予定）

---

## 4. analyte_original と analyte_normalized の使い分け

- `analyte_original`
  - 元帳票や手書きメモ表記を保持
  - 後から原文照合するときに使う
- `analyte_normalized`
  - ロジック照合用の主キー
  - 表記ゆれ・言語差（英語/日本語）を吸収した値にする

例:
- original: `イソプロピルアルコール` / normalized: `IPA`
- original: `isopropyl alcohol` / normalized: `IPA`

---

## 5. 表記ゆれの直し方（alias辞書運用）

`data/gc-analyte-aliases.json` に正規化キーごとに別名を列挙します。

```json
{
  "IPA": ["IPA", "イソプロピルアルコール", "isopropyl alcohol"],
  "MEK": ["MEK", "メチルエチルケトン"]
}
```

### 実務手順

1. まず `analyte_normalized` に統一したいキーを決める（例: `IPA`）。
2. 現場で見つかった揺れ表記を alias に追記。
3. 既存RTデータの `analyte_normalized` を同キーに揃える。
4. UIで「未登録」が減ることを確認。

---

## 6. 温度条件マスター（IDと表示名分離）

`data/gc-temp-programs.json` では以下を持たせます。

- `id` : 機械可読ID（`80c`, `70c_isothermal` など）
- `code` : 人が管理しやすいコード（`80C`, `70C_isothermal`）
- `display_name` : 画面表示名（`80℃` など）

この分離により、表示名変更があっても参照IDは固定化できます。

---

## 7. certainty の使い分け

- `high`
  - 装置出力や十分な検証で確度高
- `medium`
  - 一次確認済みだが再確認余地あり
- `low`
  - 手書き読取不鮮明、転記差分懸念など

ロジック側は certainty 平均が低い候補を少し下げるため、低確度データを混ぜても候補全体が過度に上位化しにくい設計です。

---

## 8. source の使い分け

- `manual_scan`
  - 手書きやPDF目視転記
- `verified_note`
  - 人手で照合済みメモ
- `instrument_export`
  - 装置エクスポート値

後で監査・再投入する際、`source` で優先再確認対象を絞れます。

---

## 9. 手書き読取で不確かなデータの扱い

1. `certainty` は `low` にする。
2. `source` は `manual_scan` を使う。
3. `note` に不確実理由を短文で残す（例: `桁が不鮮明`）。
4. 確認後に `certainty` / `source` / `note` を更新する。

---

## 10. データ投入手順（推奨）

1. `gc-machines.json` / `gc-columns.json` / `gc-temp-programs.json` を先に確定。
2. `gc-analyte-aliases.json` に正規化キーと別名を準備。
3. `gc-rt-library.json` にRTを追加入力。
4. 画面で候補提案を実行し、警告（未登録・データ不足・検証エラー）を確認。
5. 必要なら alias 追記または `analyte_normalized` 修正。

---

## 11. 投入前チェックリスト

- `machine_id` がマスター存在値か
- `column_id` がマスター存在値か
- `temp_program_id` がマスター存在値か
- `analyte_normalized` が空でないか
- `rt_min` が数値か
- 同一条件・同一analyteの重複がないか
- `note` に `sample` / 仮投入などの識別を付けたか

---

## 12. 将来拡張（17A / 14B）

- まず `gc-machines.json` に機械IDを追加
- 既存と同じ `temp_program_id` を再利用可能（必要なら機械別ID新設）
- RTは `machine_id` ごとに追加してもUI構造変更は不要
- 段階投入中は警告表示を維持しつつ運用可能

---

## 13. GC2014実データ投入後の確認手順（今回追加）

### 13-1. 事前条件

- GitHub Pages向けの静的構成のため、`gc-method-finder.html` を開くだけで確認可能
- 外部APIやビルドは不要
- 「在庫メモ」 (`inventory-memo.html`) が従来どおり開けることも確認する

### 13-2. 推奨入力セット

以下を順に入力し、候補提案とRT表示を確認する。

- アセトン
- IPA
- トルエン
- メタノール
- n-ヘキサン
- MIBK

### 13-3. 確認観点（UI）

1. 候補カードに以下が表示されるか  
   - 機械名 / カラム名 / 温度条件 / 一致件数 / 想定RT範囲 / 最小RT差 / certainty目安
2. `certainty=low` を含む候補に「注意」または「暫定」バッジが付くか
3. `analyte_normalized = 未確定` を含む条件に「未確定データ含む」が出るか
4. 一致件数が少ない候補に「データ不足」が出るか
5. RT一覧の certainty がバッジ表示され、`low` が注意色になるか
6. RT位置図とRT一覧で番号が対応しているか
7. 未登録溶剤がある場合、RT位置図には出さず「未登録溶剤」欄に分離表示されるか

### 13-4. 候補0件時の理由表示

候補0件の場合、次の理由が明示されることを確認する。

- 未登録溶剤が多い
- データ件数不足
- 条件フィルタが厳しすぎる

### 13-5. 未確定データの扱い

- `analyte_normalized = 未確定` は候補提案ロジックで低優先扱い（直接一致から除外寄り）
- ただし、対象条件自体に未確定データが含まれる場合はカードと要約で注意表示する

---

## 14. GC標準液マスタ（STD表）の管理

`gc-std-master.html` は **RTライブラリとは別管理** の標準液一覧ページです。  
OCR読取や転記途中のデータを保持し、後で安全に見直せることを主目的とします。

### 14-1. 編集対象

- `data/gc-std-master.json` : 標準液マスタ本体
- `gc-std-master.html` : 一覧表示ページ
- `assets/js/gc-std-master.js` : 検索・要確認フィルタ
- `assets/css/gc-std-master.css` : 表示スタイル

### 14-2. レコードスキーマ

各レコードは下記項目を持たせます。

- `raw_label` : 元表記（OCR原文を保持）
- `normalized_name` : 正規化名称（機械可読・将来連携用）
- `display_name` : 画面表示用名称
- `std_value` : STD値（数値）
- `rt` : RT（未確定時は `null`）
- `area` : 面積（未確定時は `null`）
- `coefficient` : 係数（未確定時は `null`）
- `nd_line` : NDライン（`"#VALUE!"` など文字列保持可）
- `confidence` : `high` / `medium` / `low`
- `status` : `confirmed` / `provisional` / `needs_review`
- `note` : 補足メモ

### 14-3. 画面上の見え方

- 「正式名称候補」列には `display_name` を表示
- 「確からしさ」列には `confidence` を日本語表示（高/中/低）
- 「状態」列には `status` を日本語表示（確定/仮採用/要確認）

---

## 15. 複数単位作業場所プラン機能（今回追加）

`gc-method-finder.html` の「複数作業場プラン」では、匿名コード単位で対象物質をまとめて入力し、当日のGC割り振り候補を確認できます。

### 15-1. 使い方

1. `GC開始時刻` を入力（例: `13:00`）。
2. 各作業場カードに匿名コード（例: `A01`, `A02`, `B01`）を入力。
3. 物質を追加（チップ選択またはテキスト入力）。
4. 必要に応じて `段取り余裕時間（1単位あたり min）` を調整。
5. `まとめて候補提案` を押す。

表示順は **全体プラン → 作業場別詳細** です。

### 15-2. 匿名コード運用の注意

- 実在の作業場名は入力しない。
- 公開データ/画面には匿名コードのみを扱う。
- 形式は英数字4文字以内を推奨（`A01` など）。

### 15-3. 割り振りロジックの考え方

- 各作業場ごとに既存のGC候補提案ロジックを実行し、第1候補を採用。
- 分析時間は従来通り **最大RT + 0.4 min** で算出。
- 合計目安時間は次式:

`合計目安 = 各作業場の分析時間合計 + (段取り余裕時間 × 作業場数)`

- 開始時刻入力時は合計目安を加算して終了目安時刻を表示。

### 15-4. GC2014優先・要相談表示

- 1単位: 1台運用候補を表示。
- 2単位まで: `GC2014 1台運用候補` を優先表示。
- 3単位以上: 基本コメントは `要相談`。
- ただし3単位以上でも合計目安が短い場合（既定20分以下）は `1台運用も候補` を併記。
- 合計目安が長い場合（既定30分超）や開始時刻が遅い場合（既定16:00以降）は、複数台運用検討コメントを表示。

しきい値は `data/gc-method-rules.json` の `multi_workplace_plan` で調整できます。

---

## 15. ページ分割後の運用ルール（追加）

- `gc-day-plan.html` : 複数匿名コードの当日割り振り
- `gc-method-finder.html` : 単体条件提案
- `gc-rt-library.html` : RT横断確認
- `gc-std-master.html` : STD確認

> 在庫関連データ（`inventory-items.json` / `reorder-rules.json`）と、GCデータ（`gc-rt-library.json` / `gc-std-master.json`）は別管理です。

## 16. データ信頼度・状態表示（追加）

- RT `certainty`
  - `high` → 高
  - `medium` → 中
  - `low` → 低（注意色）
- STD `status`
  - `confirmed` → 確定
  - `provisional` → 仮
  - `needs_review` → 要確認

未確定データを含む候補では、画面に以下のような補助文言を表示します。
- 要確認データを含みます
- 一部データが暫定です
- データ未登録の物質があります


## 16. GC濃度計算ページ（今回追加）

`gc-calculator.html` は、`data/gc-std-master.json` のSTD値を使って当日の係数とppmを素早く計算するページです。

### 16-1. 計算式

- 係数 = STD ÷ 当日STDエリア
- ppm = 検体エリア × 係数

### 16-2. STD値の参照元

- 物質選択は `gc-std-master.json` の `display_name` を優先表示
- `raw_label` も併記して選択しやすくする
- STD欄には `std_value` を初期反映（必要に応じて手入力上書き可）

### 16-3. 入力方法

1. 物質を選択
2. 当日STDエリアを入力
3. 検体エリアを入力
4. 係数とppmを自動確認

### 16-4. 要確認データの扱い

- `status = needs_review` は「要確認」表示
- `confidence = low` は注意表示
- `std_value = null` は選択可能だが計算不可

### 16-5. CSV保存

- 「CSV保存」ボタンで `gc-calculation-YYYY-MM-DD.csv` を出力
- 列: 日付 / 物質 / STD / STDエリア / 係数 / 検体エリア / ppm / 信頼度 / 状態 / メモ

### 16-6. localStorage保存

- 入力途中の内容は `gc-calculator-state-v1` キーへ自動保存
- ページ再訪時に復元
- 「入力を消す」で確認ダイアログ後に消去
