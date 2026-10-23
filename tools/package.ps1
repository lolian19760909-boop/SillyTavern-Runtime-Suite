param([Parameter(Mandatory)][string]$OutDirectory, [switch]$Write)
$ErrorActionPreference = 'Stop'
$sourceRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$outputRoot = [IO.Path]::GetFullPath($OutDirectory)
$metadata = Get-Content -LiteralPath (Join-Path $sourceRoot 'manifest.json') -Raw | ConvertFrom-Json
$paths = @('manifest.json','index.js','style.css','README.md','ADAPTERS.md','LICENSE','NOTICE.md','CHANGELOG.md','COMPATIBILITY.md','VISUAL-GUIDE.md','MOTION.md','RENDERING.md')
foreach ($directory in @('context','runtime','visual','examples')) {
    $paths += Get-ChildItem -LiteralPath (Join-Path $sourceRoot $directory) -Recurse -File | Where-Object { $_.FullName -notlike '*\tools\*' } | ForEach-Object { [IO.Path]::GetRelativePath($sourceRoot, $_.FullName) }
}
$records = @(foreach ($relative in ($paths | Sort-Object)) {
    $file = Join-Path $sourceRoot $relative
    [ordered]@{ path = $relative.Replace('\','/'); bytes = (Get-Item -LiteralPath $file).Length; sha256 = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() }
})
$archivePath = Join-Path $outputRoot "TavernRuntimeSuite-$($metadata.version).zip"
if (Test-Path -LiteralPath $archivePath) { throw "已有安装包：$archivePath" }
$receipt = [ordered]@{ version = $metadata.version; written = [bool]$Write; archive = $archivePath; files = $records }
if ($Write) {
    New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
    $stream = [IO.File]::Open($archivePath, [IO.FileMode]::CreateNew)
    try {
        $archive = [IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Create,$true)
        try {
            foreach ($record in $records) { [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $sourceRoot $record.path),"tavern-runtime-suite/$($record.path)",[IO.Compression.CompressionLevel]::Optimal) | Out-Null }
        } finally { $archive.Dispose() }
    } finally { $stream.Dispose() }
    $archive = [IO.Compression.ZipFile]::OpenRead($archivePath)
    try {
        if ($archive.Entries.Count -ne $records.Count) { throw '安装包文件数不符。' }
        foreach ($record in $records) {
            $entry = $archive.GetEntry("tavern-runtime-suite/$($record.path)")
            if (!$entry -or $entry.Length -ne $record.bytes) { throw "安装包文件大小不符：$($record.path)" }
            $input = $entry.Open(); $hasher = [Security.Cryptography.SHA256]::Create()
            try { $hash = [Convert]::ToHexString($hasher.ComputeHash($input)).ToLowerInvariant() } finally { $hasher.Dispose(); $input.Dispose() }
            if ($hash -ne $record.sha256) { throw "安装包文件内容不符：$($record.path)" }
        }
    } finally { $archive.Dispose() }
    $receipt.bytes = (Get-Item -LiteralPath $archivePath).Length
    $receipt.sha256 = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    $receipt.readback = $true
    [IO.File]::WriteAllText((Join-Path $outputRoot 'package-receipt.json'),($receipt | ConvertTo-Json -Depth 8)+"`n",[Text.UTF8Encoding]::new($false))
}
$receipt | ConvertTo-Json -Depth 8
