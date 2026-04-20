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
- `data/gc-analyte-aliases.json` : analyte表記ゆれ辞書
- `data/gc-rt-library.json` : RTライブラリ本体
- `data/gc-method-rules.json` : 提案ロジック重み・閾値・certainty点数

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
