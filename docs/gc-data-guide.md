# GC条件提案 データ投入ガイド

`gc-method-finder.html` は静的JSONだけで動きます。  
GitHub Pagesのルート配下にそのまま配置し、`data/*.json` を更新すれば提案候補に反映されます。

## 1. ファイル構成

- `data/gc-machines.json` : 機械マスター
- `data/gc-columns.json` : カラムマスター
- `data/gc-temp-programs.json` : 温度条件マスター
- `data/gc-rt-library.json` : RTライブラリ本体
- `data/gc-method-rules.json` : 提案ロジックの重み・閾値・certainty点数・溶剤別名

## 2. 各JSONの最小スキーマ

### `gc-machines.json`

```json
[
  { "id": "gc2014", "name": "GC2014" }
]
```

### `gc-columns.json`

```json
[
  { "id": "cbp", "name": "CBP" }
]
```

### `gc-temp-programs.json`

```json
[
  { "id": "cbp_80c", "label": "80℃", "type": "isothermal", "runtime_min": 10 }
]
```

- `type` は将来の昇温条件対応のために保持（`isothermal` / `program` など）
- `runtime_min` は候補スコア用（短いほどわずかに加点）

### `gc-rt-library.json`

```json
[
  {
    "machine_id": "gc2014",
    "column_id": "cbp",
    "temp_program_id": "cbp_80c",
    "analyte_id": "acetone",
    "analyte": "アセトン",
    "rt_min": 2.033,
    "certainty": "high",
    "note": "サンプル"
  }
]
```

- 1行 = 1溶剤のRT
- `analyte_id` は内部ID
- `analyte` は表示名
- `certainty` は `high` / `medium` / `low` を推奨

### `gc-method-rules.json`

```json
{
  "weights": { "coverage": 50, "separation": 30, "runtime": 10, "certainty": 10 },
  "thresholds": { "good_rt_gap_min": 0.30, "warn_rt_gap_min": 0.15 },
  "runtime_reference_min": 20,
  "certainty_score": { "high": 1.0, "medium": 0.65, "low": 0.35 },
  "analytes": [
    { "id": "acetone", "label": "アセトン", "aliases": ["acetone", "アセトン"] }
  ]
}
```

## 3. データ投入ルール

1. **IDは固定、表示名は可変**にする（表記変更に強くするため）
2. 溶剤の表記ゆれは `analytes[].aliases` に追加する
3. RTは `rt_min` に数値で入力する（単位は分）
4. データが未登録の溶剤があっても画面は動作し、UIに不足警告を表示する
5. 出力はあくまで「候補提案」であり、確定条件ではない

## 4. 候補提案ロジック（現状）

- 入力溶剤の**カバー率**を優先
- RT差が狭すぎる条件を減点（`thresholds`使用）
- `certainty` の平均点を加味
- 総分析時間（`runtime_min`）が短い条件をわずかに加点

## 5. 追加時のチェックポイント

- `machine_id` / `column_id` / `temp_program_id` がマスターJSONに存在するか
- `analyte_id` が `gc-method-rules.json` の `analytes` と整合しているか
- 同一条件で同一溶剤の重複登録がないか
- RTの桁（小数点）を揃えるか

