# 更新ガイド（最小版）

## 1) 品目を追加する
編集先: `data/inventory-items.json`

- 数量入力したい品目は `tube` / `supplies` の `items` に追加
- 目視確認の注文チェック項目は `visual` の `checklist` に追加
- 期限切れメモは `expiredMemo`（本数管理）

## 2) 発注点を変更する
編集先: `data/reorder-rules.json`

品目名をキーにして管理します（`inventory-items.json` の名称と完全一致）。

```json
{
  "アセトン": {
    "threshold": 20,
    "unit": "箱",
    "label": "20箱以上",
    "note": ""
  },
  "N,N-ジメチルホルムアミド": {
    "threshold": null,
    "unit": "箱",
    "label": "注文一旦中止",
    "note": "自動発注警告対象から外す"
  }
}
```

- `threshold` が数値: 在庫数が `threshold` 以下で赤系警告表示
- `threshold` が `null`: 通常の自動警告対象外（注意メモとして表示）
- `label`: UIの「発注点: ...」として表示
- `note`: 補足メモ表示

## 3) QRリンクを変更する
編集先: `assets/js/qr-print.js`

`new URL('inventory-memo.html', window.location.href)` を、必要なら固定URLに変更してください。

## 4) よくある修正ポイント
- タブ内の初期開閉: `data/inventory-items.json` の `open`
- 保存キーを切り替えたい: `assets/js/storage.js` の `STORAGE_KEY`
- 文言調整: `inventory-memo.html` / `index.html`
