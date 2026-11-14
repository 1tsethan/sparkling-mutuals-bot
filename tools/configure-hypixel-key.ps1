$ErrorActionPreference = 'Stop'
$smSecure = $null
$smPointer = [IntPtr]::Zero
$smPlain = $null
$smProcess = $null
try {
  $smRoot = Split-Path -Parent $PSScriptRoot
  $smNode = Join-Path $env:ProgramFiles 'nodejs\node.exe'
  $smWrangler = Join-Path $smRoot 'node_modules\wrangler\bin\wrangler.js'
  if (!(Test-Path -LiteralPath $smNode) -or !(Test-Path -LiteralPath $smWrangler)) { throw 'Required bot tooling is unavailable.' }
  Write-Host 'Enter the approved Sparkling Mutuals Personal application API key. The entry is hidden.'
  Write-Host 'Paste using the terminal paste command, then press Enter. Do not enter it into chat.'
  $smSecure = Read-Host 'Hypixel application key' -AsSecureString
  $smPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($smSecure)
  $smPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($smPointer)
  if (!$smPlain -or $smPlain.Length -gt 512 -or $smPlain -match '\s') { throw 'The key format was not accepted.' }
  $smInfo = [Diagnostics.ProcessStartInfo]::new()
  $smInfo.FileName = $smNode
  $smInfo.Arguments = '"' + $smWrangler + '" secret put SM_HYPIXEL_API_KEY --name sparkling-mutuals-discord'
  $smInfo.WorkingDirectory = $smRoot
  $smInfo.UseShellExecute = $false
  $smInfo.CreateNoWindow = $true
  $smInfo.RedirectStandardInput = $true
  $smInfo.RedirectStandardOutput = $true
  $smInfo.RedirectStandardError = $true
  $smInfo.EnvironmentVariables['WRANGLER_LOG_SANITIZE'] = 'true'
  $smInfo.EnvironmentVariables['WRANGLER_LOG'] = 'none'
  $smInfo.EnvironmentVariables['WRANGLER_SEND_METRICS'] = 'false'
  $smProcess = [Diagnostics.Process]::Start($smInfo)
  $smOutput = $smProcess.StandardOutput.ReadToEndAsync()
  $smError = $smProcess.StandardError.ReadToEndAsync()
  $smProcess.StandardInput.Write($smPlain)
  $smProcess.StandardInput.Close()
  if (!$smProcess.WaitForExit(90000)) { $smProcess.Kill(); throw 'Cloudflare did not respond.' }
  if ($smProcess.ExitCode -ne 0) { throw 'Cloudflare did not save the key.' }
  Write-Host 'The application key was saved to Cloudflare. Stats activation still requires the reviewed bot update.'
} catch {
  Write-Host 'The key was not confirmed saved. Keep the key private and contact the bot operator.'
  exit 1
} finally {
  if ($smPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($smPointer) }
  if ($smSecure) { $smSecure.Dispose() }
  if ($smProcess) { $smProcess.Dispose() }
  $smPlain = $null
}
