<#
.SYNOPSIS
    Batch convert MOV videos to WebM format with alpha transparency

.DESCRIPTION
    Scans directory for .mov files and converts them to VP9 + alpha WebM format using FFmpeg.
    Original filename is preserved, extension changed to .webm.

.PARAMETER InputDir
    Input directory containing MOV files. Default: script directory.

.PARAMETER OutputDir
    Output directory. Default: same as input directory.

.PARAMETER Quality
    Video quality (CRF), 0-63, lower = better quality. Default: 20.

.PARAMETER KeepOriginal
    Keep original MOV files. Default: true.

.EXAMPLE
    .\convert-mov-to-webm.ps1
    Convert all MOV files in current directory

.EXAMPLE
    .\convert-mov-to-webm.ps1 -Quality 15
    Use higher quality

.NOTES
    Requires FFmpeg in PATH.
    Download: https://ffmpeg.org/download.html
#>

param(
    [string]$InputDir = $PSScriptRoot,
    [string]$OutputDir = $null,
    [int]$Quality = 20,
    [switch]$KeepOriginal = $true,
    [string]$FFmpegPath = "d:\web\demo2-trae\ffmpeg-8.1.1-full_build\bin\ffmpeg.exe"
)

$ErrorActionPreference = "Stop"

function Write-Log {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Color
}

Write-Log "========================================" "Cyan"
Write-Log "  MOV -> WebM (VP9 + Alpha) Converter  " "Cyan"
Write-Log "========================================" "Cyan"
Write-Host ""

# Check FFmpeg
$ffmpeg = $null
if (-not [string]::IsNullOrEmpty($FFmpegPath) -and (Test-Path $FFmpegPath)) {
    $ffmpeg = $FFmpegPath
    Write-Log "[OK] Using local FFmpeg: $FFmpegPath" "Green"
}
else {
    $ffmpegCmd = Get-Command ffmpeg -ErrorAction SilentlyContinue
    if ($ffmpegCmd) {
        $ffmpeg = $ffmpegCmd.Source
        Write-Log "[OK] FFmpeg found in PATH: $($ffmpegCmd.Source)" "Green"
    }
}

if (-not $ffmpeg) {
    Write-Log "[ERROR] FFmpeg not found." "Red"
    Write-Host "Please specify -FFmpegPath or install FFmpeg to PATH." -ForegroundColor Yellow
    Write-Host "Download: https://ffmpeg.org/download.html" -ForegroundColor Yellow
    exit 1
}

# Set output directory
if ([string]::IsNullOrEmpty($OutputDir)) {
    $OutputDir = $InputDir
}

# Ensure output directory exists
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
    Write-Log "[OK] Created output directory: $OutputDir" "Green"
}

# Find all MOV files
$movFiles = Get-ChildItem -Path $InputDir -Filter "*.mov" -File

if ($movFiles.Count -eq 0) {
    Write-Log "[INFO] No .mov files found." "Yellow"
    exit 0
}

Write-Log "[OK] Found $($movFiles.Count) MOV file(s)" "Green"
Write-Host ""

$successCount = 0
$failCount = 0

foreach ($movFile in $movFiles) {
    $baseName = [System.IO.Path]::GetFileNameWithoutExtension($movFile.Name)
    $webmFile = Join-Path $OutputDir "$baseName.webm"
    
    Write-Log "Processing: $($movFile.Name)" "White"
    Write-Host "  -> $baseName.webm" -ForegroundColor Gray
    
    # FFmpeg args: VP9 + alpha (optimized for seamless loop)
    $ffmpegArgs = @(
        "-i", $movFile.FullName,
        "-c:v", "libvpx-vp9",
        "-pix_fmt", "yuva420p",
        "-crf", $Quality.ToString(),
        "-b:v", "0",
        "-g", "30",
        "-keyint_min", "30",
        "-an",
        "-y",
        $webmFile
    )
    
    try {
        $process = Start-Process -FilePath $ffmpeg -ArgumentList $ffmpegArgs -NoNewWindow -Wait -PassThru
        
        if ($process.ExitCode -eq 0) {
            $webmSize = (Get-Item $webmFile).Length / 1KB
            Write-Log "  [SUCCESS] Output size: $([math]::Round($webmSize, 1)) KB" "Green"
            $successCount++
            
            if (-not $KeepOriginal) {
                Remove-Item $movFile.FullName -Force
                Write-Log "  [DELETED] Original file removed" "DarkGray"
            }
        }
        else {
            Write-Log "  [FAILED] FFmpeg exit code: $($process.ExitCode)" "Red"
            $failCount++
        }
    }
    catch {
        Write-Log "  [FAILED] $_" "Red"
        $failCount++
    }
    
    Write-Host ""
}

Write-Log "========================================" "Cyan"
Write-Log "Done: $successCount success / $failCount failed" "Cyan"
Write-Log "========================================" "Cyan"

if ($failCount -gt 0) {
    exit 1
}
