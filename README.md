# work-ops-hub

GitHub Pagesでそのまま公開できる、モバイルファーストの作業ハブです（外部API・ビルド不要）。

## ページ構成
- `index.html` : 作業メニュー（在庫 / GC当日 / GC条件 / RT / STD / QR / 更新手順）
- `inventory-memo.html` : 在庫メモ（localStorage保存）
- `gc-day-plan.html` : GC当日プラン（複数匿名コードの割り振り）
- `gc-method-finder.html` : GC条件提案（単体条件提案）
- `gc-rt-library.html` : GC RTライブラリ（条件別RT一覧）
- `gc-std-master.html` : GC標準液マスタ（STD確認）
- `qr-print.html` : 掲示・印刷用QR
- `docs/update-guide.md` : 更新手順
- `docs/gc-data-guide.md` : GCデータ投入/運用ガイド

## GC機能の使い分け
- **GC当日プラン**: 複数の単位作業場所（A01, A02...）をまとめて計画。
- **GC条件提案**: 1単位または1セットの溶剤で候補探索。
- **GC RTライブラリ**: RTデータの横断確認・絞り込み。
- **GC標準液マスタ**: STD値と要確認データの確認。

## 匿名コード運用
- 公開ファイルには実作業場名・会社名・個人名を載せない。
- 作業場は `A01` 形式の匿名コードのみ扱う。
- 在庫データとGCデータ（RT/STD）は別管理。

## データ信頼度表示
- `high / medium / low` → `高 / 中 / 低`
- `confirmed / provisional / needs_review` → `確定 / 仮 / 要確認`
- lowや要確認は注意色で表示。

## GitHub Pages公開
1. リポジトリをGitHubへpush
2. `Settings > Pages` で Branch と `/ (root)` を選択
3. 数分後に公開URLへアクセス
