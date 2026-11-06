# Local startup

The owner selected this Windows computer as the host. This first connection trial runs the existing HTTP service on 127.0.0.1:3000. It does not yet make Discord commands work from the Internet.

1. In the official Discord Developer Portal, open Sparkling Mutuals > Bot and generate/save the bot token privately. The user must complete credential changes and any account confirmation. Do not put the token in chat or source files.
2. Double-click Start-Local.cmd in this folder. Its Node launcher asks for the Discord bot token without displaying the characters. Paste the token and press Enter.
3. The launcher registers this application's four commands only in SM, then starts the local HTTP service. If registration fails, it stops before starting the service. Leave the window open; Ctrl+C stops it.
4. Verify http://127.0.0.1:3000/health in a browser. It should return a JSON object with status ok.
5. Establish a reviewed HTTPS route to this local listener, then configure its /interactions URL in the Discord Developer Portal and verify Discord accepts the endpoint. No tunnel has been created yet. Never forward other local services or disable signature checks.
6. Publish the privacy policy and support/deletion contact, then test /help in SM. Successful registration alone does not establish a working interaction endpoint.

The launcher intentionally keeps stats and release notifications disabled. Hypixel's Personal application was submitted and its last observed status was review pending. Do not use that key until approval. Release automation also needs durable protected storage, channel configuration, a signed notification route and the separately reviewed GitHub integration.

The initial launcher holds the bot token in process memory and never saves it to a configuration file or command-line argument. It forces in-memory SQLite for this trial, so no Discord interaction IDs or announcement receipts are intentionally written to disk by the service. Closing/restarting loses those trial receipts; notification posting therefore stays disabled. Normal operation needs reviewed encrypted durable storage and secret handling before enabling feeds. The launcher does not automatically start with Windows, prevent sleep or change security settings.

For manual invocation from this folder:

    node tools/start-local.ts --register

The installed Node location used by Start-Local.cmd is C:\Program Files\nodejs\node.exe. Runtime dependencies remain built into Node.

Local verification: 38 controlled tests pass and all 28 TypeScript files pass syntax checks. The checks cover masked input and terminal restoration, credentials excluded from arguments, environment isolation, disabled live features, in-memory trial receipts and stopping after registration failure. Registration failures now show the HTTP status and a fixed explanation without logging credentials, response bodies or raw transport errors. Static type checking and live connectivity remain separate.

If Ctrl+V triggers an invalid-format error in the hidden prompt, reopen the launcher and use the terminal's right-click Paste action instead. If registration fails, report only the displayed HTTP status or connection message; do not share the token. A format check passing does not confirm Discord accepted the credential.

This agent session cannot perform the live startup: a real local HTTP connection failed with EACCES and an unauthenticated Discord connectivity check failed with ENOTFOUND. Windows also refused PowerShell script files under its existing execution policy. The Node launcher avoids changing that policy; the user must run the launcher normally, and the result still needs observation. No execution-policy override, router change, public tunnel or live credential use was performed.

Cloudflare Quick Tunnels are one possible temporary testing route. They use a changing public hostname, stop with their process and are intended for development rather than production. A stable route should be selected for continuing operation. [Official Quick Tunnel documentation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)

The user approved this temporary testing connection. Download the Windows 64-bit executable from [Cloudflare's official downloads page](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/). Keep cloudflared-windows-amd64.exe in the normal Downloads folder, or put it in a bin folder beside this launcher. Double-click Start-Tunnel.cmd while the bot is running. This launches only `cloudflared tunnel --url http://127.0.0.1:3000`; it does not install a Windows service, change firewall rules or configure automatic startup. It asks for no bot or Hypixel token. Share only the generated https://...trycloudflare.com address for endpoint setup, and leave both windows open. Download and successful tunnel connection still require verification.
