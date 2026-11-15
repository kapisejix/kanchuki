# C: Drive Cleanup (owner-side, local machine)

**Status:** Runbook, not a feature. Nothing in the repo changes. Created 2026-11-15.
**Trigger:** C: almost full. WizTree (2026-11-15) showed 10.1 GB in `C:\Users\Dell\.config\manicode\projects\Kanchuki\chats`.
**Scope:** Only the dev machine's C: drive. Never touches `E:\Kanchuki`, `C:\Users\Dell\.claude` or its memory folder.

---

## 1. How to run (read first)

Do NOT paste this whole document into PowerShell. Prose and comments get pasted too, the shell sees unclosed `{` / `(`, and it sticks on the `>>` continuation prompt. Nothing runs.

If stuck on `>>`: press **Ctrl+C**.

Steps:

1. Open **PowerShell as Administrator**.
2. Create the script file:
   ```powershell
   notepad C:\cleanup.ps1
   ```
3. Paste only the code block in section 2. Save.
4. Dry run (reports sizes only, deletes nothing):
   ```powershell
   powershell -ExecutionPolicy Bypass -File C:\cleanup.ps1
   ```
5. Read the sizes. To delete for real, edit the file: `$DryRun = $true` -> `$false`. Save. Run step 4 again.

---

## 2. The script

```powershell
# ===== C: DRIVE MASTER CLEANUP =====
$DryRun = $true   # <-- set $false to really delete

$before = (Get-PSDrive C).Free
function Size($p){ if(Test-Path $p){ "{0:N2} GB" -f ((Get-ChildItem $p -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum/1GB) } else { "n/a" } }
function Wipe($p){
  if(-not (Test-Path $p)){ return }
  Write-Host ("{0,-10} {1}" -f (Size $p), $p)
  if(-not $DryRun){
    Get-ChildItem $p -Force -ErrorAction SilentlyContinue |
      Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  }
}

# 0. Close apps holding files
if(-not $DryRun){
  'chrome','msedge','brave','firefox','opera','Code','node' |
    ForEach-Object { Stop-Process -Name $_ -Force -ErrorAction SilentlyContinue }
}

# 1. Manicode / Codebuff chat history (10 GB)
Wipe "$env:USERPROFILE\.config\manicode\projects\Kanchuki\chats"

# 2. Temp
Wipe $env:TEMP
Wipe "$env:LOCALAPPDATA\Temp"
Wipe "C:\Windows\Temp"
Wipe "C:\Windows\Prefetch"

# 3. Windows junk
Wipe "$env:LOCALAPPDATA\CrashDumps"
Wipe "$env:LOCALAPPDATA\Microsoft\Windows\WER"
Wipe "C:\ProgramData\Microsoft\Windows\WER"
Wipe "C:\Windows\Minidump"
Wipe "$env:LOCALAPPDATA\D3DSCache"
Wipe "$env:LOCALAPPDATA\Microsoft\Windows\INetCache"
Get-ChildItem "$env:LOCALAPPDATA\Microsoft\Windows\Explorer" -Filter "thumbcache_*.db" -Force -ErrorAction SilentlyContinue |
  ForEach-Object { if(-not $DryRun){ Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue } }
if(-not $DryRun){
  Stop-Service wuauserv,bits -Force -ErrorAction SilentlyContinue
}
Wipe "C:\Windows\SoftwareDistribution\Download"
if(-not $DryRun){
  Start-Service wuauserv,bits -ErrorAction SilentlyContinue
  Clear-RecycleBin -Force -ErrorAction SilentlyContinue
}

# 4. Browser caches (cache only: logins, bookmarks, history stay)
$cacheNames = 'Cache','Code Cache','GPUCache','GrShaderCache','ShaderCache','DawnCache','Service Worker\CacheStorage','Service Worker\ScriptCache'
$chromium = @(
  "$env:LOCALAPPDATA\Google\Chrome\User Data",
  "$env:LOCALAPPDATA\Microsoft\Edge\User Data",
  "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\User Data",
  "$env:APPDATA\Opera Software\Opera Stable"
)
foreach($root in $chromium){
  if(-not (Test-Path $root)){ continue }
  Get-ChildItem $root -Directory -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq 'Default' -or $_.Name -like 'Profile *' } |
    ForEach-Object { foreach($c in $cacheNames){ Wipe (Join-Path $_.FullName $c) } }
}
# Firefox
Get-ChildItem "$env:LOCALAPPDATA\Mozilla\Firefox\Profiles" -Directory -ErrorAction SilentlyContinue |
  ForEach-Object { Wipe "$($_.FullName)\cache2"; Wipe "$($_.FullName)\startupCache" }

# 5. Dev tool caches
Wipe "$env:LOCALAPPDATA\npm-cache"
Wipe "$env:APPDATA\npm-cache"
Wipe "$env:LOCALAPPDATA\pnpm\store"
Wipe "$env:LOCALAPPDATA\pnpm-cache"
Wipe "$env:LOCALAPPDATA\Yarn\Cache"
Wipe "$env:LOCALAPPDATA\pip\Cache"
Wipe "$env:USERPROFILE\.cache"
Wipe "$env:USERPROFILE\.expo\versions-cache"
Wipe "$env:USERPROFILE\.gradle\caches"
Wipe "$env:LOCALAPPDATA\NuGet\v3-cache"
Wipe "$env:LOCALAPPDATA\Temp\metro-cache"
Wipe "$env:LOCALAPPDATA\Temp\haste-map-*"

# 6. Docker
if(Get-Command docker -ErrorAction SilentlyContinue){
  docker system df
  if(-not $DryRun){
    docker system prune -a --volumes -f
    docker builder prune -a -f
  }
}

# 7. Report
$after = (Get-PSDrive C).Free
"Freed: {0:N2} GB | Free now: {1:N2} GB" -f (($after-$before)/1GB), ($after/1GB)
```

---

## 3. What it deletes, and what to know first

| Item | Effect |
| --- | --- |
| `manicode\...\chats` (10.1 GB) | Old Codebuff chat logs. Safe to delete. |
| Browser caches | Cache folders only. Passwords, cookies, bookmarks, history stay. Browsers are force-closed. |
| Docker `prune -a --volumes` | Deletes stopped containers, unused images **and unused volumes**. A local Postgres/Redis container that keeps data in a volume loses that data. Drop `--volumes` to keep volumes. |
| `pnpm\store`, `.gradle\caches`, npm/yarn/pip | Re-downloaded on next install/build. Costs time and bandwidth, not data. |
| Temp, Prefetch, WER, crash dumps, thumbnails, Windows Update download cache, Recycle Bin | Regenerated by Windows. |
| NOT touched | `E:\Kanchuki`, `C:\Users\Dell\.claude` (incl. memory), browser profiles. |

---

## 4. Docker/WSL disk still big after prune

The `.vhdx` file does not shrink by itself. Run each block separately, with real paths (no `<path>` placeholders).

1. Quit Docker Desktop. Then:
   ```powershell
   wsl --shutdown
   Get-ChildItem "$env:LOCALAPPDATA\Docker\wsl","$env:LOCALAPPDATA\Docker" -Recurse -Filter *.vhdx -ErrorAction SilentlyContinue | Select FullName, @{n='GB';e={[math]::Round($_.Length/1GB,1)}}
   ```
2. Copy the real path from the output.
3. With Hyper-V module (Pro/Enterprise):
   ```powershell
   Optimize-VHD -Path "C:\real\path\ext4.vhdx" -Mode Full
   ```
4. Windows Home (no `Optimize-VHD`): use diskpart.
   ```powershell
   diskpart
   ```
   ```
   select vdisk file="C:\real\path\ext4.vhdx"
   attach vdisk readonly
   compact vdisk
   detach vdisk
   exit
   ```
5. Compact takes minutes. Wait for it to finish.

---

## 5. Other big wins to check

- `C:\hiberfil.sys`: `powercfg -h off` frees several GB (disables hibernate and Fast Startup).
- `C:\Windows\Installer`, `C:\Windows\WinSxS`: use `cleanmgr` or `Dism /Online /Cleanup-Image /StartComponentCleanup`. Do not delete by hand.
- Pagefile size and location.
- Re-run WizTree after cleanup to see what is left.

---

## 6. Done checklist

- [ ] Dry run read, sizes look right
- [ ] `$DryRun = $false` run completed
- [ ] "Freed / Free now" line noted
- [ ] Docker vhdx compacted (if applicable)
- [ ] Local DB containers re-seeded if volumes were pruned
- [ ] WizTree re-checked
