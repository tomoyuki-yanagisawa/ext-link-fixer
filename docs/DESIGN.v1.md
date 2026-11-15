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
- ツールバーのアイコンからポップアップを開き、そこから設定画面を開けるようにする。ポップアップの JS はクリック時だけ動く。
- ユニットテストに Vitest を使用する。実行時の追加依存ライブラリは導入しない。

## 3. 最小ディレクトリ構成

```text
link-fixer/
├── package.json
├── tsconfig.json
├── wxt.config.ts
├── assets/
│   └── icon.svg
├── public/
│   └── _locales/
│       ├── en/
│       │   └── messages.json
│       └── ja/
│           └── messages.json
├── entrypoints/
│   ├── options/
│   │   ├── index.html
│   │   ├── main.ts
│   │   ├── playground.ts
│   │   ├── permissions.ts
│   │   ├── rules.ts
│   │   └── style.css
│   └── popup/
│       ├── index.html
│       ├── main.ts
│       └── style.css
├── utils/
│   └── i18n.ts
└── test/
    └── preview.html
```

スタイルは `entrypoints/options/style.css` に記述する。色・フォント・部品の見た目はブラウザ既定に任せ、レイアウトに必要な最小限だけを指定する。文字サイズ・余白は `rem` / `em` を使い、ブラウザの既定フォントサイズに追従させる。OS やブラウザで見た目が異なってよい。

`test/preview.html` は、サンプル入りの静的なプレビュー。ブラウザで直接開いて見た目を確認するための開発用ファイルで、拡張機能には含まれない（JS は動作しない）。翻訳の対象外で、日本語の文言をそのまま持つ。

`package-lock.json` は npm が生成し、依存関係を固定するため Git 管理する。`.output/`、`.wxt/`、`node_modules/` は Git 管理しない。

## 4. 機能仕様

### 対象

- `http://` / `https://` の**トップレベルページ遷移**のみ。
- リンクの通常クリック、新しいタブで開く、アドレスバーからのアクセスを対象とする。
- 画像・スクリプト等のサブリソースには適用しない。

### 設定画面

- ツールバーのアイコン → ポップアップの「設定を開く」から開く。`browser.runtime.openOptionsPage()` を使う。

- 1 行（または 1 ブロック）につき「マッチする正規表現」「置換後 URL」の 2 入力欄を表示する。
- ルールの追加・削除・上下への移動と、保存の操作を用意する。並べ替えは保存時に反映する。
- 起動時に `getDynamicRules()` から既存のルールを読み込み、表示する。
- 読み込み中と保存中は編集・保存を無効化する。読み込みに失敗した場合は、既存ルールの意図しない上書きを防ぐため、画面を再読み込みするまで無効のままにする。
- ルールの並び順で優先順位を決める（**上が優先**）。
- 保存成功・失敗は画面内に短く表示する。
- サイトアクセスの状態と許可ボタンを常に表示する。許可済みならボタンを無効化し、未許可ならボタンから `permissions.request()` を呼ぶ。失敗した場合はブラウザの設定から許可するよう案内する。Firefox 126 以前は Manifest V3 のホスト権限がインストール時に付与されず、リダイレクトだけが無効になるため。
- 画面下部に Playground を置く。URL を入力して実行すると、**保存済みのルールすべて**についてマッチするかと書き換え結果を表示し、実際に適用されるルール（優先度が最も高いもの）を明示する。
- Playground は保存済みルールを JavaScript で評価する近似であり、DNR と結果が異なる場合がある。`i` フラグで判定し、URL を正規化して fragment を除外する。リダイレクト先も再評価し、ルール数の回数後もマッチする場合は確認を打ち切ってエラーを表示する。これは循環の確定やブラウザ側の停止を意味しない。
- 名称、有効/無効スイッチ、インポート/エクスポートは初版の対象外。

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
- 保存前に JavaScript の `RegExp` と `isRegexSupported({ regex, requireCapturing: true })` の両方で検証し、DNRへの登録失敗も画面に表示する。両方で有効でも、正規表現の意味が完全に一致するとは限らない。
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

- スクリプトは `dev` / `dev:firefox` / `build` / `build:firefox` / `zip` / `zip:firefox` / `xpi` / `typecheck` / `test` / `postinstall`。
- 開発依存は `wxt`、`@wxt-dev/auto-icons`、`typescript`、`vitest`、DOM テスト用の `jsdom`。実行時の依存パッケージは持たない。
- `postinstall` の `wxt prepare` で、型チェックに必要な `.wxt/` の設定を生成する。
- 現在の定義は `package.json` を参照する。

### `tsconfig.json`

- WXT が生成する `.wxt/tsconfig.json` を継承し、`strict` を有効にする。
- `npm run typecheck` でビルドとは別に型を検証する。

### `wxt.config.ts`

現在の定義は `wxt.config.ts` を参照する。主な内容は次のとおり。

- WXT が `manifest.json` と `options_ui` を自動生成する。手書きの `manifest.json` は不要。
- `name` / `description` / `action.default_title` は `__MSG_...__`、`default_locale` は `en`（多言語対応の節を参照）。
- `@wxt-dev/auto-icons` が `assets/icon.svg` から各サイズの PNG を生成し、`icons` を設定する。`action.default_icon` は manifest で同じパスを指定する。
- アイコンは `assets/icon.svg` の 1 種類だけを使う。Chrome / Firefox とも同じアイコンで、ライト・ダーク両方のツールバーで見えるよう、グレー（`#6b6b6b`、線幅 9）にしている。Firefox の `theme_icons` は使わない。
- Firefox は WXT のデフォルトが Manifest V2 のため、**Firefox のコマンドに `--mv3` を必ず指定**する。
- Firefox の拡張機能 ID は `@link-fixer.tomoyuki-yanagisawa` とし、公開後も維持する。
- 拡張機能の外部で保存・処理するためのユーザーデータ収集・送信は行わないため、Firefox のデータ収集申告を `none` とする。
- 任意のサイトでのリダイレクトのために広いホスト権限を要求する。ユーザーへの権限警告は許容する。
- DNR の redirect は対象 URL のホスト権限が必須で、権限がないとルールは静かに無視される。

### 多言語対応（`browser.i18n`）

- `public/_locales/en/messages.json`（既定）と `public/_locales/ja/messages.json` を手書きし、`manifest.default_locale` を `en` にする。日本語以外の UI 言語は英語にフォールバックする。
- manifest の `name` / `description` / `action.default_title` は `__MSG_extensionName__` などのプレースホルダーで指定する。
- HTML の文言は `data-i18n="key"`、属性は `data-i18n-aria-label="key"` のように指定し、既定ロケール（英語）の文言をそのまま書いておく。
- 起動時に `utils/i18n.ts` の `localize()` が `[data-i18n]` のテキストと `[data-i18n-aria-label]` の属性を `browser.i18n.getMessage()` で置き換える。キーが見つからない場合は HTML の文言を残す。
- `<template>` の中は `document` の走査対象外なので、`localize(ruleTemplate.content)` を呼ぶ。
- 実行時に決まる文言は `browser.i18n.getMessage()` を直接呼び、置換は `$1`〜`$9` に文字列の配列で渡す。
- 表示言語はブラウザの UI 言語に従う。`browser.i18n` の仕様上、拡張機能内で言語を切り替える UI は持たない。`<html lang>` は `browser.i18n.getUILanguage()` の値に合わせる。
- 翻訳の追加は `public/_locales/<lang>/messages.json` を増やすだけで、コードの変更は不要。

### `entrypoints/options/index.html`

- 通常の HTML。`<meta name="manifest.open_in_tab" content="true">` で設定画面をタブ表示する。
- `<script type="module" src="./main.ts"></script>` で実装を読み込む。
- 文言は `data-i18n` / `data-i18n-aria-label` で指定する（多言語対応の節を参照）。
- スタイルは `style.css` に分ける。

### `entrypoints/options/main.ts`

- `main.ts` は DOM の取得、イベント接続、保存・表示の進行を担当する。
- ルールの読み込み・検証・DNR への変換は `rules.ts`。
- Playground の URL 正規化・マッチ判定・結果整形は `playground.ts`。
- サイトアクセスの確認・要求は `permissions.ts`。
- DNR の操作は `browser.declarativeNetRequest` をそのまま使う。

### `entrypoints/popup/`

- ツールバーのアイコンから開く小さなポップアップ。見出しと「設定を開く」ボタンだけを置く。
- ボタンで `browser.runtime.openOptionsPage()` を呼び、設定画面をタブで開く。
- ポップアップの JS はクリックしたときだけ実行され、常駐しない。

## 7. 開発・ビルド

```bash
npm install
npm run dev              # Chrome
npm run dev:firefox      # Firefox (MV3)
npm run build            # Chrome
npm run build:firefox    # Firefox (MV3)
npm run zip              # Chrome 向け zip
npm run zip:firefox      # Firefox 向け zip
npm run xpi              # Firefox 向け zip と xpi
npm run typecheck        # TypeScript の型チェック
npm test                 # ユニットテスト
```

生成される拡張機能は `.output/` 以下に出力される。両ブラウザに読み込み、同じルールで動くことを確認する。

`.github/workflows/ci.yml` は PR と `main` への push 時に型チェック、ユニットテスト、Chrome / Firefox 向けビルドを実行する。

### リリース

`.github/workflows/release.yml` が、`main` ブランチの `package.json` の更新を契機にビルドとリリースを行う。

- `package.json` の `version` と同じ名前のタグ（`v0.1.9` など）のリリースが未作成の場合だけ実行する。バージョンを上げずに `package.json` を変更した場合は何もしない。
- 型チェックとユニットテストの後、Chrome / Firefox 向けの zip を作成する。Firefox 用は同じ内容を `.xpi` としても添付する。
- 署名は行わない。Firefox の通常版（Release / Beta）は未署名アドオンを拒否するため、次のいずれかで使う。
  - Firefox ESR / Developer Edition / Nightly で `xpinstall.signatures.required` を `false` にして `.xpi` をインストールする
  - `about:debugging` で一時的に読み込む（再起動で消える）
- Chrome 版も署名がないため、開発者モードでの読み込みを想定する。
- `workflow_dispatch` で手動実行もできる。

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

## 参考

- WXT Manifest: https://wxt.dev/guide/essentials/config/manifest
- WXT I18n: https://wxt.dev/guide/essentials/i18n
- MDN Internationalization: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Internationalization
- Chrome i18n: https://developer.chrome.com/docs/extensions/reference/api/i18n
- messages.json の形式: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/i18n/Locale-Specific_Message_reference
- data-i18n for Small Web Projects: https://blog.nishikanta.in/data-i18n-for-small-web-projects-a-complete-guide-to-internationalization
- WXT Entrypoints / Options: https://wxt.dev/guide/essentials/entrypoints
- WXT Browser Targets: https://wxt.dev/guide/essentials/target-different-browsers
- Chrome DNR: https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest
- MDN DNR Regex: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/declarativeNetRequest/isRegexSupported
- MDN DNR Redirect: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/declarativeNetRequest/Redirect
