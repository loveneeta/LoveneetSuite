$filePath = $args[0]
if (-not $filePath) {
    $filePath = 'C:\Users\Machine28\Downloads\BIBITH_catalogue1.pptx'
}
Write-Host "Testing PPTX: $filePath"

$ppt = New-Object -ComObject PowerPoint.Application
try {
    # Open(FileName, ReadOnly, Untitled, WithWindow)
    # -1 is msoTrue, 0 is msoFalse
    $pres = $ppt.Presentations.Open($filePath, 0, 0, 0)
    Write-Host ">>> POWERPOINT OPENED FILE SUCCESSFULLY! Slide Count: $($pres.Slides.Count)"
    $pres.Close()
} catch {
    Write-Host ">>> POWERPOINT FAILED TO OPEN FILE:"
    Write-Host $_.Exception.Message
} finally {
    try { $ppt.Quit() } catch {}
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ppt) | Out-Null
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
}
