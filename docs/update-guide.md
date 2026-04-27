# 更新ガイド

## 1) ページ構成の更新
- トップメニュー: `index.html`
- 共通ミニナビ: `assets/js/app.js`, `assets/css/common.css`
- GC当日プラン: `gc-day-plan.html`, `assets/js/gc-day-plan.js`, `assets/css/gc-day-plan.css`
- GC条件提案: `gc-method-finder.html`, `assets/js/gc-finder.js`, `assets/css/gc-finder.css`
- RTライブラリ: `gc-rt-library.html`, `assets/js/gc-rt-library.js`, `assets/css/gc-rt-library.css`
- STDマスタ: `gc-std-master.html`, `assets/js/gc-std-master.js`, `assets/css/gc-std-master.css`

## 2) 在庫関連更新
- 品目追加: `data/inventory-items.json`
- 発注点変更: `data/reorder-rules.json`

## 3) GC当日プランの使い方
1. `gc-day-plan.html` を開く
2. GC開始時刻・段取り余裕時間を入力
3. 匿名コード（A01等）ごとに物質を追加
4. `まとめて候補提案` を押す
5. 全体プラン（1台候補 / 要相談）と作業場別詳細を確認

## 4) GC条件提案の使い方
1. `gc-method-finder.html` を開く
2. （任意）機械/カラム/温度条件を指定
3. 対象溶剤を追加して候補表示
4. `この条件を使う` で当日メモへ一時保存（localStorage）

## 5) RTライブラリの見方
- 機械・カラム・温度条件・物質名・信頼度で絞り込み可能
- `要確認または低のみ表示` で重点確認可能
- RTは短い順表示

## 6) STDマスタの見方
- 検索 + 状態 + 信頼度で絞り込み
- `要確認のみ表示` でレビュー対象を抽出
- STD値は右寄せ表示、備考は折り返し

## 7) 匿名コード運用の注意
- 公開データは匿名コードのみ（A01形式）
- 実名対応表をリポジトリに置かない

## 8) 補足
- 発注点・在庫データと、GCのRT/STDデータは別管理
- 外部APIなし・ビルド不要・静的ファイルのみで運用
