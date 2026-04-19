# GC条件提案データガイド

`gc-method-finder.html` は下記JSONを読み込み、候補条件を提案します。  
まずはサンプルデータで動作し、あとから実データに置き換えるだけで拡張できます。

## 1. データファイル一覧

- `data/gc-machines.json` : GC本体マスター（GC2014 / GC-17A / GC-14B など）
- `data/gc-columns.json` : カラムマスター
- `data/gc-temp-programs.json` : 温度プログラムマスター
- `data/gc-rt-library.json` : RTライブラリ（実測値）
- `data/gc-method-rules.json` : 溶剤マスター、quality定義、仮スコア重み

## 2. 共通IDルール（推奨）

- 表示名と内部IDを分離する
- 内部IDは半角英数字・ハイフン推奨
- machine / column / tempProgram / solvent をIDで関連付ける

例:

- machineId: `gc2014`
- columnId: `col-wax-30m`
- tempProgramId: `tp-a`
- solventId: `acetone`

## 3. RTライブラリの登録単位

`data/gc-rt-library.json` の `records[]` は、以下を1行として登録します。

- `machineId`
- `columnId`
- `tempProgramId`
- `solventId`
- `solventLabel`
- `rt`（分）
- `quality`（`good` / `ok` / `bad`）
- `note`

## 4. 提案ロジック（初期実装）

`assets/js/gc-finder.js` は次の項目で仮スコア化します。

1. 入力溶剤カバー率
2. RT差（狭すぎ回避）
3. quality平均
4. 総分析時間（長すぎ回避）

重みは `data/gc-method-rules.json` の `scoreSettings` で調整できます。

## 5. 実データ投入時の手順

1. `gc-machines.json` に利用機器を登録
2. `gc-columns.json` に運用カラムを登録
3. `gc-temp-programs.json` に温度条件を登録
4. `gc-method-rules.json` に溶剤候補と表記ゆれ（aliases）を登録
5. `gc-rt-library.json` にRT実測値を追加
6. `gc-method-finder.html` をブラウザで開いて候補表示を確認

## 6. 注意

- 出力はあくまで「候補提案」であり、最適条件の断定ではありません。
- 同一条件で再現性や分離状態を確認し、最終判断してください。
