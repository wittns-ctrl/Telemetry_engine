# Build lectio-agent.exe and publish it as the website's download.
#
#   .\build.ps1 -Api https://api.your-lectio-host.com
#   .\build.ps1                       # http://localhost:8000, for development
#
# Writes dist\lectio-agent.exe and copies it to ..\downloads\lectio-agent.exe,
# which the API serves at /api/v1/agent/download (no restart needed).
param(
    [string]$Api = "http://localhost:8000",
    [string]$Version = "1.0.0"
)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

go test ./...
if ($LASTEXITCODE -ne 0) { throw "Tests failed; not building." }

$flags = "-s -w -X main.version=$Version -X lectio/agent/internal/config.DefaultAPI=$Api"
$env:GOOS = "windows"; $env:GOARCH = "amd64"; $env:CGO_ENABLED = "0"
go build -trimpath -ldflags $flags -o dist\lectio-agent.exe .\cmd\lectio-agent
if ($LASTEXITCODE -ne 0) { throw "Build failed." }

New-Item -ItemType Directory -Force ..\downloads | Out-Null
Copy-Item dist\lectio-agent.exe ..\downloads\lectio-agent.exe -Force
$size = [math]::Round((Get-Item dist\lectio-agent.exe).Length / 1MB, 1)
Write-Host "Built lectio-agent $Version for $Api ($size MB) and published it to downloads\lectio-agent.exe"
