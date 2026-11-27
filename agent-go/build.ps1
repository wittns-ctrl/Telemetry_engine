# Build lectio-agent.exe and publish it as the website's download.
#
#   .\build.ps1 -Api https://api.your-lectio-host.com -Site https://your-site.example
#   .\build.ps1                       # http://localhost:8000 and :5173, for development
#
# -Site is the website the PC's alert notifications open ("Open dashboard").
# For a live API it defaults to https://getlectio.vercel.app.
#
# Writes dist\lectio-agent.exe and copies it to ..\downloads\lectio-agent.exe,
# which the API serves at /api/v1/agent/download (no restart needed).
param(
    [string]$Api = "http://localhost:8000",
    [string]$Site = "",
    [string]$Version = "1.0.0"
)
if (-not $Site) {
    $Site = if ($Api -match '^http://(localhost|127\.0\.0\.1)') { "http://localhost:5173" } else { "https://getlectio.vercel.app" }
}
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

go test ./...
if ($LASTEXITCODE -ne 0) { throw "Tests failed; not building." }

$flags = "-s -w -X main.version=$Version -X lectio/agent/internal/config.DefaultAPI=$Api -X lectio/agent/internal/config.DefaultDashboard=$Site"
$env:GOOS = "windows"; $env:GOARCH = "amd64"; $env:CGO_ENABLED = "0"
go build -trimpath -ldflags $flags -o dist\lectio-agent.exe .\cmd\lectio-agent
if ($LASTEXITCODE -ne 0) { throw "Build failed." }

New-Item -ItemType Directory -Force ..\downloads | Out-Null
Copy-Item dist\lectio-agent.exe ..\downloads\lectio-agent.exe -Force
$size = [math]::Round((Get-Item dist\lectio-agent.exe).Length / 1MB, 1)
Write-Host "Built lectio-agent $Version for $Api, notifications open $Site ($size MB) and published it to downloads\lectio-agent.exe"
