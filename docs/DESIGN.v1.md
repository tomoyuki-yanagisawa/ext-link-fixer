# Link Fixer — 設計書

## 1. 目的

Firefox / Chrome 共通で動作する、**正規表現による URL リダイレクト**拡張機能を作る。

- 間違った URL にアクセスしたとき、指定ルールで正しい URL に書き換える。
- ページ内のリンク（DOM）は変更しない。ページ遷移のネットワークリクエスト時に処理する。
- 設定画面で複数ルールを追加・編集・削除できる。
- 設定を保存すると、ブラウザや拡張機能を再起動せずに反映する。

## 2. 設計方針

- **WXT** を使用し、Firefox / Chrome を同一ソースでサポートする。
- アプリ実装と WXT の設定は **TypeScript** を使い、型チェックを行う。
- パッケージ管理は **npm**。pnpm は使用しない。
- UI は素の **HTML + CSS + TypeScript**。React 等は使用しない。
- リダイレクトは `declarativeNetRequest`（DNR）の**動的ルール**で実行する。
- DNR の動的ルールを設定の保存先としても使い、`storage.local` を使用しない。
- バックグラウンドスクリプト、コンテンツスクリプト、独自サーバーは作らない。
- テストフレームワークや実行時の追加依存ライブラリは、初版では導入しない。

## 3. 最小ディレクトリ構成

```text
link-fixer/
├── package.json
├── tsconfig.json
├── wxt.config.ts
└── entrypoints/
    └── options/
        ├── index.html
        └── main.ts
```

スタイルは `index.html` 内の `<style>` に記述する。

`package-lock.json` は npm が生成し、依存関係を固定するため Git 管理する。`.output/`、`.wxt/`、`node_modules/` は Git 管理しない。

## 4. 機能仕様

### 対象

- `http://` / `https://` の**トップレベルページ遷移**のみ。
- リンクの通常クリック、新しいタブで開く、アドレスバーからのアクセスを対象とする。
- 画像・スクリプト等のサブリソースには適用しない。

### 設定画面

- 1 行（または 1 ブロック）につき「マッチする正規表現」「置換後 URL」の 2 入力欄を表示する。
- **追加**、**削除**、**保存**の 3 操作だけを用意する。
- 起動時に `getDynamicRules()` から既存のルールを読み込み、表示する。
- ルールの並び順で優先順位を決める（**上が優先**）。初版では並べ替え UI は設けない。
- 保存成功・失敗は画面内に短く表示する。
- 名称、有効/無効スイッチ、テスト画面、インポート/エクスポートは初版の対象外。

### 正規表現・置換

例：

```text
正規表現: ^https://example\.com/old/(.*)$
置換先:   https://example.com/new/\1

アクセス: https://example.com/old/123
遷移先:   https://example.com/new/123
```

- 条件は DNR の `regexFilter` を使う。
- 置換には `regexSubstitution` を使い、`\0`～`\9` のキャプチャ参照をサポートする。
- JavaScript の `RegExp` とは完全互換ではない。**DNR が受け付ける正規表現**に限定する。
- 保存前に `isRegexSupported({ regex, requireCapturing: true })` などで検証し、DNRへの登録失敗も画面に表示する。
- 置換結果が無効な URL の場合、リダイレクトされないことがある。

## 5. DNR ルール

1 件の設定を次のルールへ変換する。

```json
{
  "id": 1,
  "priority": 1,
  "condition": {
    "regexFilter": "^https://example\\.com/old/(.*)$",
    "resourceTypes": ["main_frame"]
  },
  "action": {
    "type": "redirect",
    "redirect": {
      "regexSubstitution": "https://example.com/new/\\1"
    }
  }
}
```

- `id` は保存時に配列の先頭から `1, 2, 3, ...` と採番する。
- `priority` は先頭が最大になるように割り当てる。
- 空の入力行は保存対象から除外する。正規表現・置換先の片方のみ入力されている場合は保存を拒否する。
- 保存は、既存の動的ルール ID を全取得してから、`updateDynamicRules({ removeRuleIds, addRules })` **1 回**でまとめて更新する。
- この更新は原子的。失敗時には既存の動的ルールを維持し、エラーを表示する。
- DNR の動的ルールはブラウザ再起動・拡張機能更新後も保持されるため、別途保存処理は不要。

**注意：** この最小構成は「拡張機能が利用する動的ルールは Link Fixer の URL 書き換えルールのみ」という前提にする。

## 6. WXT の設定

### `package.json`

```json
{
  "name": "link-fixer",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wxt",
    "dev:firefox": "wxt -b firefox --mv3",
    "build": "wxt build",
    "build:firefox": "wxt build -b firefox --mv3",
    "typecheck": "tsc --noEmit",
    "postinstall": "wxt prepare"
  }
}
```

開発依存として `wxt` と `typescript` を使用する。`postinstall` の `wxt prepare` により、型チェックに必要な `.wxt/` の設定を生成する。

### `tsconfig.json`

- WXT が生成する `.wxt/tsconfig.json` を継承し、`strict` を有効にする。
- `npm run typecheck` でビルドとは別に型を検証する。

### `wxt.config.ts`

```ts
export default defineConfig({
  manifest: {
    name: 'Link Fixer',
    permissions: ['declarativeNetRequest'],
    host_permissions: ['http://*/*', 'https://*/*'],
    browser_specific_settings: {
      gecko: {
        id: '@link-fixer.tomoyuki-yanagisawa',
        data_collection_permissions: {
          required: ['none'],
        },
      },
    },
  },
});
```

- WXT が `manifest.json` と `options_ui` を自動生成する。手書きの `manifest.json` は不要。
- Firefox は WXT のデフォルトが Manifest V2 のため、**Firefox のコマンドに `--mv3` を必ず指定**する。
- Firefox の拡張機能 ID は `@link-fixer.tomoyuki-yanagisawa` とし、公開後も維持する。
- 拡張機能の外部で保存・処理するためのユーザーデータ収集・送信は行わないため、Firefox のデータ収集申告を `none` とする。
- 任意のサイトでのリダイレクトのために広いホスト権限を要求する。ユーザーへの権限警告は許容する。

### `entrypoints/options/index.html`

- 通常の HTML。`<meta name="manifest.open_in_tab" content="true">` で設定画面をタブ表示する。
- `<script type="module" src="./main.ts"></script>` で実装を読み込む。
- 設定画面の CSS は `<style>` にまとめる。

### `entrypoints/options/main.ts`

- `import { browser } from 'wxt/browser'` を使う。
- 読み込み：`browser.declarativeNetRequest.getDynamicRules()`。
- 検証：`browser.declarativeNetRequest.isRegexSupported()`。
- 保存：`browser.declarativeNetRequest.updateDynamicRules()`。
- UI 操作、入力値の検証、DNR への変換は同一ファイル内のシンプルな関数で実装する。

## 7. 開発・ビルド

```bash
npm install
npm run dev              # Chrome
npm run dev:firefox      # Firefox (MV3)
npm run build            # Chrome
npm run build:firefox    # Firefox (MV3)
npm run typecheck        # TypeScript の型チェック
```

生成される拡張機能は `.output/` 以下に出力される。両ブラウザに読み込み、同じルールで動くことを確認する。

## 8. 動作確認

1. 設定画面を開いて正規表現と置換先を 1 件登録する。
2. 対象 URL にアクセスし、正しい URL にリダイレクトされることを確認する。
3. 保存直後に新しいルールが反映されることを確認する。
4. 設定画面を閉じ、ブラウザを再起動しても動くことを確認する。
5. ルールを削除・保存した後はリダイレクトされないことを確認する。
6. 不正な正規表現を保存しようとしても、既存ルールが維持されることを確認する。
7. Firefox と Chrome の双方で以上を確認する。

## 9. 制約と非目標

- DOM 内の `<a href>` は書き換えない。リンク先のコピーは元の URL のまま。
- ネットワークリクエストを発生させない SPA の画面遷移は対象外。
- `#fragment` の書き換えは対象外。
- ルール間の循環リダイレクトを完全には検出しない。設定時のユーザー責任とする。
- ブラウザ内蔵ページなど、拡張機能でリダイレクトできない URL は対象外。
- ルールが競合した場合は DNR の優先順位に従う。他の拡張機能による干渉は保証しない。

## 10. 完了条件

- npm + WXT、TypeScript で動作し、型チェックが通る。
- Firefox / Chrome の両方で設定画面を開ける。
- 複数の正規表現ルールを追加・編集・削除できる。
- 保存後に即時反映され、ブラウザ再起動後も設定が維持される。
- バックグラウンドスクリプト、コンテンツスクリプト、別ストレージを使わない。

## 参考（公式）

- WXT Manifest: https://wxt.dev/guide/essentials/config/manifest
- WXT Entrypoints / Options: https://wxt.dev/guide/essentials/entrypoints
- WXT Browser Targets: https://wxt.dev/guide/essentials/target-different-browsers
- Chrome DNR: https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest
- MDN DNR Regex: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/declarativeNetRequest/isRegexSupported
- MDN DNR Redirect: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/declarativeNetRequest/Redirect
