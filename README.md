# Link Fixer

正規表現で URL を書き換える、Chrome / Firefox 向けのブラウザ拡張機能です。

例えば次のルールを登録すると、

- マッチする正規表現: `^https://example\.com/old/(.*)$`
- 置換後の URL: `https://example.com/new/\1`

`https://example.com/old/123` へのアクセスが `https://example.com/new/123` に転送されます。

## 特徴

- 複数のルールを設定画面から追加・編集・削除できる
- 上にあるルールほど優先される
- 保存すると即座に反映され、ブラウザを再起動しても保持される
- ページ内のリンクや DOM は書き換えない（トップレベルのページ遷移時のみ処理する）
- バックグラウンドスクリプトやコンテンツスクリプトを使わず、`declarativeNetRequest` の動的ルールだけで動作する
- 設定はブラウザ内にのみ保存され、外部へ送信されない

## インストール

[Releases](https://github.com/tomoyuki-yanagisawa/ext-link-fixer/releases) から最新のファイルをダウンロードします。

> [!IMPORTANT]
> この拡張機能は**署名していません**。Firefox の通常版（Release / Beta）と Chrome は、未署名の拡張機能をそのまま常設インストールできません。以下の手順が必要です。

### Chrome

`link-fixer-<version>-chrome.zip` を展開し、`chrome://extensions` で「デベロッパー モード」を有効にして「パッケージ化されていない拡張機能を読み込む」から、展開したフォルダを選びます。

### Firefox

**未署名のアドオンを常設で使えるのは Firefox ESR、Firefox Developer Edition、Firefox Nightly などです。**

1. `about:config` を開く
2. `xpinstall.signatures.required` を `false` にする
3. `link-fixer-<version>-firefox.xpi` を Firefox で開く

Firefox 126 以前は、インストール時にサイトアクセスが許可されません。設定画面の上部にサイトアクセスの状態と「サイトアクセスを許可」ボタンが表示されるので、未許可の場合は押して許可してください（許可済みならボタンは無効になります）。表示されない場合は `about:addons` の Link Fixer →「権限」から「すべてのウェブサイトのデータへのアクセス」を許可します。許可しないと、ルールは保存できても実際のリダイレクトは行われません。

設定の詳細は Mozilla のサポート記事を参照してください。

- [アドオンの署名 | Firefox ヘルプ — 未署名のアドオンを利用したい場合](https://support.mozilla.org/ja/kb/add-on-signing-in-firefox#w_wei-shu-ming-noadoonwoshi-itaichang-he-shang-ji-yu-za-xiang-ke)

通常版の Firefox で試したいだけなら、`about:debugging#/runtime/this-firefox` の「一時的なアドオンを読み込む」から同じ `.xpi` を選べます（Firefox を再起動すると解除されます）。

## 使い方

1. 拡張機能の設定画面を開く（Chrome は `chrome://extensions` から「拡張機能のオプション」、Firefox はアドオンマネージャーから「オプション」）
2. 「ルールを追加」で行を増やし、正規表現と置換後の URL を入力する
3. 「保存」を押す

空の行は保存されません。片方だけ入力した行があると保存できません。正規表現は JavaScript の `RegExp` とは完全互換ではなく、`declarativeNetRequest` が受け付ける形式に限られます。キャプチャの参照は `\1`〜`\9` が使えます。

画面下部の「Playground」に URL を入れると、保存済みのルールすべてについてマッチ結果を表示し、実際に適用されるルールを確認できます（保存前の編集内容ではなく、保存済みの設定が対象です）。DNR の条件に合わせて、大文字小文字を区別せず、URL を正規化し、fragment（`#` 以降）は判定から除外して表示します。

## 制限

- 対象は `http://` / `https://` のトップレベルページ遷移のみです。画像やスクリプトなどのサブリソースには適用されません。
- `history.pushState` などで行う SPA の画面遷移には適用されません。
- `#fragment` だけの移動には適用されません。
- ルール間の循環リダイレクトは検出しません。
- 置換結果が無効な URL の場合、リダイレクトされないことがあります。

## 開発

```bash
npm install
npm run dev              # Chrome で開発
npm run dev:firefox      # Firefox (MV3) で開発
npm run build            # Chrome 向けビルド
npm run build:firefox    # Firefox (MV3) 向けビルド
npm run zip              # Chrome 向け zip
npm run zip:firefox      # Firefox 向け zip
npm run typecheck        # 型チェック
```

`test/preview.html` をブラウザで開くと、サンプル入りの静的な見た目を確認できます（JS は動作しません）。

リリースは GitHub Actions で自動化されています。`main` の `package.json` の `version` を上げて push すると、ビルドと GitHub Release の作成が行われます。

構成の詳細は [docs/DESIGN.v1.md](docs/DESIGN.v1.md) を参照してください。
