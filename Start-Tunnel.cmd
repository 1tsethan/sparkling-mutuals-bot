@echo off
setlocal
set "SM_TUNNEL_CLIENT=%~dp0bin\cloudflared-windows-amd64.exe"
if not exist "%SM_TUNNEL_CLIENT%" set "SM_TUNNEL_CLIENT=%USERPROFILE%\Downloads\cloudflared-windows-amd64.exe"
if not exist "%SM_TUNNEL_CLIENT%" (
  echo Cloudflare's Windows client was not found.
  echo Download cloudflared-windows-amd64.exe from the official Cloudflare download page.
  echo Leave it in Downloads, or place it in the bin folder beside this launcher.
  pause
  exit /b 1
)
echo SM temporary HTTPS connection to http://127.0.0.1:3000 only.
echo Keep the bot launcher open as well as this window.
echo Send only the https://...trycloudflare.com address to the setup chat.
echo Do not send any bot or Hypixel token.
echo Closing this window stops the tunnel. Restarting changes its address.
"%SM_TUNNEL_CLIENT%" tunnel --url http://127.0.0.1:3000
pause
