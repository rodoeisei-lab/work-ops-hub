# 更新ガイド（最小版）

## 1) 品目を追加する
編集先: `data/inventory-items.json`

- 数量入力したい品目は `tube` / `supplies` の `items` に追加
- 目視確認の注文チェック項目は `visual` の `checklist` に追加
- 期限切れメモは `expiredMemo`（本数管理）

## 2) 発注目安を変更する
編集先: `data/reorder-rules.json`

`rules` に以下形式で設定します。

```json
{
  "name": "アセトン",
  "limit": 20,
  "unit": "箱",
  "label": "発注目安 20箱"
}
```

- `name` は品目名と完全一致させます
- `limit` 以下で赤系表示になります

## 3) QRリンクを変更する
編集先: `assets/js/qr-print.js`

`new URL('inventory-memo.html', window.location.href)` を、必要なら固定URLに変更してください。

## 4) よくある修正ポイント
- タブ内の初期開閉: `data/inventory-items.json` の `open`
- 保存キーを切り替えたい: `assets/js/storage.js` の `STORAGE_KEY`
- 文言調整: `inventory-memo.html` / `index.html`
