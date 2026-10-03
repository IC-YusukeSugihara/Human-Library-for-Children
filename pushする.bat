@echo off
chcp 65001 > nul
setlocal

rem === Human-Library-for-Children を GitHub に送る（push）ボタン ===
rem このファイルは、リポジトリのフォルダの中、またはその1つ上のフォルダに置いて使えます。

cd /d "%~dp0"
if not exist ".git" (
  if exist "Human-Library-for-Children\.git" (
    cd /d "%~dp0Human-Library-for-Children"
  ) else (
    echo [エラー] Gitのリポジトリが見つかりません。
    echo このファイルを Human-Library-for-Children フォルダの中か、その1つ上に置いてください。
    pause
    exit /b 1
  )
)

echo ----------------------------------------
echo  送る先: 
git remote get-url origin
echo ----------------------------------------
echo  変更されたファイル:
git status --short
echo ----------------------------------------

if exist "package.json" (
  echo  動作チェック中（pnpm run check）...
  call pnpm run check --if-present
  if errorlevel 1 (
    echo [中止] チェックでエラーが出たため、送りませんでした。上のメッセージを確認してください。
    pause
    exit /b 1
  )
)

set "MSG="
set /p MSG=変更の説明を入力してEnter（空のままEnterで日時を入れます）: 
if "%MSG%"=="" set "MSG=update %date% %time%"

git add -A
git commit -m "%MSG%"
if errorlevel 1 echo （新しい変更はありませんでした。送信だけ行います）

git push
if errorlevel 1 (
  echo [エラー] 送信に失敗しました。上のメッセージを確認してください。
) else (
  echo [完了] GitHub に送りました。
)
pause
