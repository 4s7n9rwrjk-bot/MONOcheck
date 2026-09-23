# MONOcheck PC・スマホ同期版（修正版）

## まずやること
1. Supabaseでプロジェクトを作る
2. `supabase_schema.sql` をSupabaseのSQL Editorで実行
3. `supabase-config.js` に Project URL と Publishable key（またはブラウザ用の公開キー）を設定
4. このフォルダ一式をHTTPSで公開
5. MONOcheckの「同期」ボタンから新規登録
6. PCとスマホで同じアカウントにログイン

## 重要
`service_role` / Secret key は `supabase-config.js` に入れないでください。
ブラウザで使う公開用キーを使用してください。

## 同期画面
画面上部の「☁ 同期」を押すと、ログイン画面が開きます。
- 新規登録：最初の1台でアカウントを作成
- ログイン：もう一方の端末で同じアカウントを使用
- 今すぐ同期：手動で同期

## うまくいかない場合
- 「同期」ボタン自体が開かない → 修正版の `index.html` と `sync.js` を使う
- 「Supabaseの設定がまだありません」→ `supabase-config.js` のURL/キーが未設定
- ログインできない → Supabase Authのメール確認設定を確認
- 「同期エラー」→ `supabase_schema.sql` をSQL Editorで実行し、`monocheck_data` テーブルとRLSポリシーを確認
- 設定を変更したのに反映されない → ブラウザを再読み込み。Service Workerのキャッシュも更新されます

## データ
端末内データはlocalStorageにも残ります。クラウド同期では同じアカウントのデータを共有します。


## 今回の更新
- 「持ち物」に「アイテム / 収納」の種類を追加
- 「収納先」を追加し、ポーチ・ケース・バッグの中身を階層化
- チェックリストは実際に持ち出す最上位の収納単位で表示
- 収納を展開すると中身を確認可能
- 収納をチェックすると中身もチェック
- 「場所」はこれまで通り現在の保管場所として利用
- クラウド同期後も「場所」管理画面へ反映
- アップロードしたMONOcheckアイコンをPWA/画面ヘッダーで使用
- Service Workerのキャッシュを更新し、存在しないicon.svgの参照を削除
