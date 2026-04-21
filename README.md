# work-ops-hub

GitHub Pages でそのまま公開できる、モバイル向け「作業用ミニハブ」です。

## 構成（root 配置）
- `index.html` : トップページ（在庫メモ / QR印刷 / GC条件提案 / GC標準液マスタ / 更新手順）
- `inventory-memo.html` : 在庫メモ本体（localStorage 保存）
- `qr-print.html` : 掲示・印刷用ページ
- `gc-method-finder.html` : GC条件提案（候補表示）
- `docs/update-guide.md` : 更新手順
- `docs/gc-data-guide.md` : GC条件提案のデータ投入ガイド
- `data/*.json` : 品目と発注目安の設定
- `assets/css/*.css` : 画面スタイル
- `assets/js/*.js` : 画面ロジック

## 変更時の目安
- 品目を増やす: `data/inventory-items.json`
- 発注目安を変える: `data/reorder-rules.json`
- 在庫メモの動き変更: `assets/js/inventory.js`
- トップ画面変更: `index.html`
- 印刷画面変更: `qr-print.html`, `assets/js/qr-print.js`
- GC条件提案変更: `gc-method-finder.html`, `assets/js/gc-finder.js`, `assets/css/gc-finder.css`
- GC標準液マスタ変更: `gc-std-master.html`, `data/gc-std-master.json`, `assets/js/gc-std-master.js`, `assets/css/gc-std-master.css`
- GCデータ更新: `data/gc-*.json`, `docs/gc-data-guide.md`

## GitHub Pages 公開
1. このリポジトリを GitHub に push
2. `Settings > Pages` で Branch を選択（例: `main` / `/ (root)`）
3. 数分後に公開URLへアクセス

※ サーバー/API なし、ビルド不要の静的サイトです。
