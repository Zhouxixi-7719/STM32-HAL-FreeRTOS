#>
#  check_vs_dotnet.ps1  --  cross-check tools/gbk_table.bin against .NET CP936
#  ---------------------------------------------------------------------------
#  The table itself is generated from the standard GBK index by
#  tools/gen_gbk_table.js.  This script proves that Windows CP936 (the decoder
#  stack of the serial assistant) is compatible with it:
#    * every real-character slot must be identical, and
#    * every difference must be a slot where .NET keeps a private-use-area
#      codepoint (U+E000..U+F8FF) while the table carries the standard glyph.
#  Anything else fails with exit code 1.
#
#  usage: powershell -ExecutionPolicy Bypass -File tools\check_vs_dotnet.ps1
#  NOTE: keep this file ASCII-only -- Windows PowerShell 5.1 reads .ps1 as ANSI.
#>

$ErrorActionPreference = 'Stop'
$here = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$binPath = Join-Path $here 'gbk_table.bin'
$bin = [System.IO.File]::ReadAllBytes($binPath)

$DOUBLE_SLOTS = 23940
$SINGLE_OFFSET = $DOUBLE_SLOTS * 2

# U+FFFF marks "undefined in CP936" so it cannot be confused with '?' output
$enc = [System.Text.Encoding]::GetEncoding(936,
    [System.Text.EncoderFallback]::ReplacementFallback,
    (New-Object System.Text.DecoderReplacementFallback("\uFFFF")))

function DecodeOne([byte[]]$bytes) {
    $s = $enc.GetString($bytes)
    if ($s.Length -ne 1) { return -1 }
    if ([int][char]$s -eq 0xFFFF) { return -1 }     # undefined
    return [int][char]$s
}
function TableDouble([int]$lead, [int]$trail) {
    $t = if ($trail -gt 0x7F) { 1 } else { 0 }
    $idx = ($lead - 0x81) * 190 + ($trail - 0x40 - $t)
    return [int]$bin[$idx * 2] + [int]$bin[$idx * 2 + 1] * 256
}
function TableSingle([int]$b) {
    return [int]$bin[$SINGLE_OFFSET + $b * 2] + [int]$bin[$SINGLE_OFFSET + $b * 2 + 1] * 256
}
function IsPua([int]$cu) { return ($cu -ge 0xE000 -and $cu -le 0xF8FF) }

$diffPua = 0          # table = standard glyph, .NET = PUA   (expected, documented)
$diffOther = 0        # any other kind of difference        (must be zero)
$identical = 0
$examples = @()

for ($lead = 0x81; $lead -le 0xFE; $lead++) {
    for ($trail = 0x40; $trail -le 0xFE; $trail++) {
        if ($trail -eq 0x7F) { continue }
        $mine = TableDouble $lead $trail
        $dotnet = DecodeOne ([byte[]]@($lead, $trail))
        if ($mine -eq $dotnet) { $identical++; continue }
        if ($dotnet -eq -1) { continue }                       # CP936 undefined
        if ((IsPua $dotnet) -and -not (IsPua $mine) -and $mine -ne 0) {
            $diffPua++
            if ($examples.Count -lt 5) {
                $examples += ("0x{0:X2}{1:X2}: table U+{2:X4} vs .NET U+{3:X4}" -f $lead, $trail, $mine, $dotnet)
            }
            continue
        }
        $diffOther++
        if ($diffOther -le 10) {
            Write-Host ("UNEXPECTED 0x{0:X2}{1:X2}: table U+{2:X4} vs .NET U+{3:X4}" -f $lead, $trail, $mine, $dotnet)
        }
    }
}

$singleChecked = 0
$singlePua = 0
$singleDiff = 0
for ($b = 0; $b -lt 256; $b++) {
    if ($b -ge 0x81 -and $b -le 0xFE) { continue }   # lead bytes: not a single char
    $dotnet = DecodeOne ([byte[]]@($b))
    if ($dotnet -eq -1) { continue }                 # undefined alone in CP936
    $mine = TableSingle $b
    if ($mine -eq $dotnet) { $singleChecked++; continue }
    if ((IsPua $dotnet) -and -not (IsPua $mine)) {   # e.g. 0xFF: .NET U+F8F5, standard: none
        $singlePua++
        Write-Host ("single byte 0x{0:X2}: table U+{1:X4} (standard) vs .NET U+{2:X4} (legacy PUA)" -f $b, $mine, $dotnet)
        continue
    }
    $singleDiff++
    Write-Host ("single byte 0x{0:X2}: table U+{1:X4} vs .NET U+{2:X4}" -f $b, $mine, $dotnet)
}

Write-Host ""
Write-Host "table file          : $binPath ($($bin.Length) bytes)"
Write-Host "double byte slots   : $DOUBLE_SLOTS"
Write-Host "identical to CP936  : $identical"
Write-Host "documented PUA diff : $diffPua   (table = standard glyph, .NET = private use area)"
foreach ($e in $examples) { Write-Host "                      $e" }
Write-Host "unexpected diff     : $diffOther"
Write-Host "single byte         : $singleChecked identical, $singlePua legacy PUA, $singleDiff unexpected"

if ($diffOther -ne 0 -or $singleDiff -ne 0) {
    Write-Host "RESULT: FAIL"
    exit 1
}
Write-Host "RESULT: PASS - table is the standard GBK mapping and is CP936-compatible"
Write-Host "        apart from $diffPua double-byte + $singlePua single-byte legacy private-use-area slots"
exit 0
