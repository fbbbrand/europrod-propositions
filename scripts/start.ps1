param(
  [switch]$Demo
)

$runtimeRoot = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
$runtimeNode = Join-Path $runtimeRoot 'node\bin\node.exe'
$runtimeModules = Join-Path $runtimeRoot 'node\node_modules'
$runtimePython = Join-Path $runtimeRoot 'python\python.exe'
$runtimeBin = Join-Path $runtimeRoot 'bin\override'
$skillDir = Join-Path $env:USERPROFILE '.codex\plugins\cache\openai-primary-runtime\presentations\26.905.11957\skills\presentations'

if (-not (Test-Path -LiteralPath $runtimeNode)) {
  throw "Runtime Node.js introuvable : $runtimeNode"
}
if (-not (Test-Path -LiteralPath $runtimeModules)) {
  throw "Modules de présentation introuvables : $runtimeModules"
}

$env:RUNTIME_NODE = $runtimeNode
$env:RUNTIME_NODE_MODULES = $runtimeModules
$env:RUNTIME_PYTHON = $runtimePython
$env:RUNTIME_BIN_DIR = $runtimeBin
$env:SKILL_DIR = $skillDir

if ($Demo) {
  & $runtimeNode (Join-Path $PSScriptRoot 'generate-demo.mjs')
  exit $LASTEXITCODE
}

& $runtimeNode (Join-Path (Split-Path $PSScriptRoot -Parent) 'server.mjs')
