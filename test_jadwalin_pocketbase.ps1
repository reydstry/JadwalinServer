# Jadwalin - PocketBase CRUD + API Rules integration tests
# Windows PowerShell 5.1 / PowerShell 7
# Run against local DEV PocketBase only. Creates two TEST auth accounts.
param(
    [string]$Base = 'http://127.0.0.1:8090'
)

$ErrorActionPreference = 'Stop'
$Base = $Base.TrimEnd('/')
$script:Passed = 0
$script:Failed = 0

function Send-Pb {
    param(
        [Parameter(Mandatory=$true)][string]$Method,
        [Parameter(Mandatory=$true)][string]$Path,
        [object]$Data = $null,
        [string]$Token = ''
    )

    $headers = @{}
    if ($Token) { $headers['Authorization'] = $Token }

    $options = @{
        Uri = "$Base$Path"
        Method = $Method
        Headers = $headers
        UseBasicParsing = $true
        ErrorAction = 'Stop'
    }
    if ($null -ne $Data) {
        $options['ContentType'] = 'application/json'
        $options['Body'] = ConvertTo-Json -InputObject $Data -Depth 12 -Compress
    }

    try {
        $response = Invoke-WebRequest @options
        $parsed = $null
        if ($response.Content) { $parsed = $response.Content | ConvertFrom-Json }
        return [pscustomobject]@{
            Status = [int]$response.StatusCode
            Data = $parsed
            Error = ''
        }
    }
    catch {
        $code = 0
        if ($null -ne $_.Exception.Response) {
            $code = [int]$_.Exception.Response.StatusCode
        }
        $message = $_.ErrorDetails.Message
        if (-not $message -and $null -ne $_.Exception.Response) {
            try {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $message = $reader.ReadToEnd()
                $reader.Dispose()
            }
            catch { }
        }
        if (-not $message) { $message = $_.Exception.Message }
        return [pscustomobject]@{
            Status = $code
            Data = $null
            Error = $message
        }
    }
}

function Expect {
    param(
        [string]$Label,
        [object]$Response,
        [int[]]$Codes
    )
    if ($Codes -contains [int]$Response.Status) {
        $script:Passed++
        Write-Host ("PASS [{0}] {1}" -f $Response.Status, $Label) -ForegroundColor Green
    }
    else {
        $script:Failed++
        Write-Host ("FAIL [{0}] {1}. Expected: {2}" -f $Response.Status, $Label, ($Codes -join '/')) -ForegroundColor Red
        if ($Response.Error) { Write-Host ("  Response: " + $Response.Error) -ForegroundColor Yellow }
        throw "Test stopped at: $Label. Fix this issue before proceeding."
    }
}

function Expect-PrivateList {
    param(
        [string]$Label,
        [object]$Response,
        [string]$ExpectedId,
        [string]$ForeignId
    )
    Expect "$Label (HTTP)" $Response @(200)
    $ids = @($Response.Data.items | ForEach-Object { $_.id })
    if (($ids.Count -eq 1) -and ($ids -contains $ExpectedId) -and ($ids -notcontains $ForeignId)) {
        $script:Passed++
        Write-Host "PASS [data] ${Label}: own record present, foreign record absent" -ForegroundColor Green
    }
    else {
        $script:Failed++
        Write-Host "FAIL [data] ${Label}: incorrect visibility. Returned IDs: $($ids -join ', ')" -ForegroundColor Red
        throw "Isolation failure. Stop: check API Rules before release."
    }
}

Write-Host "`nJADWALIN - PocketBase API tests" -ForegroundColor Cyan
Write-Host "Target: $Base"
Write-Host 'Uses two non-superuser accounts. Run ONLY against your dev database.' -ForegroundColor Yellow

$health = Send-Pb 'GET' '/api/health'
Expect 'PocketBase server healthy' $health @(200)

# Reserved example.com addresses, intentionally not real mailboxes.
$tag = [guid]::NewGuid().ToString('N').Substring(0, 10)
$emailA = "jadwalin-a-$tag@example.com"
$emailB = "jadwalin-b-$tag@example.com"
$password = 'Jadwalin-Test#2026!'

$userA = Send-Pb 'POST' '/api/collections/users/records' @{
    email = $emailA; password = $password; passwordConfirm = $password; name = 'Tester Jadwalin A'
}
Expect 'Public registration user A' $userA @(200)

$userB = Send-Pb 'POST' '/api/collections/users/records' @{
    email = $emailB; password = $password; passwordConfirm = $password; name = 'Tester Jadwalin B'
}
Expect 'Public registration user B' $userB @(200)

$loginA = Send-Pb 'POST' '/api/collections/users/auth-with-password' @{
    identity = $emailA; password = $password
}
Expect 'Password login A' $loginA @(200)
$loginB = Send-Pb 'POST' '/api/collections/users/auth-with-password' @{
    identity = $emailB; password = $password
}
Expect 'Password login B' $loginB @(200)

$uidA = $loginA.Data.record.id
$uidB = $loginB.Data.record.id
$tokenA = $loginA.Data.token
$tokenB = $loginB.Data.token
Write-Host "Test users: A=$uidA, B=$uidB" -ForegroundColor DarkCyan

$mkA = Send-Pb 'POST' '/api/collections/mata_kuliah/records' @{
    user = $uidA; nama = 'PAPB - Uji A'; dosen = 'Dosen Uji'; sks = 3
} $tokenA
Expect 'A creates own mata_kuliah' $mkA @(200)

$mkB = Send-Pb 'POST' '/api/collections/mata_kuliah/records' @{
    user = $uidB; nama = 'Basis Data - Uji B'; dosen = 'Dosen Uji'; sks = 3
} $tokenB
Expect 'B creates own mata_kuliah' $mkB @(200)

$mkListA = Send-Pb 'GET' '/api/collections/mata_kuliah/records' $null $tokenA
Expect-PrivateList 'A lists mata_kuliah' $mkListA $mkA.Data.id $mkB.Data.id
$mkListB = Send-Pb 'GET' '/api/collections/mata_kuliah/records' $null $tokenB
Expect-PrivateList 'B lists mata_kuliah' $mkListB $mkB.Data.id $mkA.Data.id

$mkListGuest = Send-Pb 'GET' '/api/collections/mata_kuliah/records'
Expect 'Guest mata_kuliah list request' $mkListGuest @(200)
if (@($mkListGuest.Data.items).Count -ne 0) {
    throw 'SECURITY FAIL: Guest can read mata_kuliah records. Stop and fix List Rule.'
}
Write-Host 'PASS [data] Guest sees no mata_kuliah records' -ForegroundColor Green
$script:Passed++

Expect 'A cannot view B mata_kuliah' (Send-Pb 'GET' "/api/collections/mata_kuliah/records/$($mkB.Data.id)" $null $tokenA) @(404)
Expect 'A cannot create mata_kuliah for B' (Send-Pb 'POST' '/api/collections/mata_kuliah/records' @{
    user = $uidB; nama = 'Forbidden A to B'; sks = 3
} $tokenA) @(400)
Expect 'A updates own mata_kuliah' (Send-Pb 'PATCH' "/api/collections/mata_kuliah/records/$($mkA.Data.id)" @{
    nama = 'PAPB - Updated by A'
} $tokenA) @(200)
Expect 'A cannot change mata_kuliah owner' (Send-Pb 'PATCH' "/api/collections/mata_kuliah/records/$($mkA.Data.id)" @{
    user = $uidB
} $tokenA) @(404)
Expect 'A cannot update B mata_kuliah' (Send-Pb 'PATCH' "/api/collections/mata_kuliah/records/$($mkB.Data.id)" @{
    nama = 'Illegal update'
} $tokenA) @(404)
Expect 'A cannot delete B mata_kuliah' (Send-Pb 'DELETE' "/api/collections/mata_kuliah/records/$($mkB.Data.id)" $null $tokenA) @(404)

$jA = Send-Pb 'POST' '/api/collections/jadwal/records' @{
    mata_kuliah = $mkA.Data.id; hari = 1; jam_mulai = 480; jam_selesai = 600; menit_sebelum = 15; ruangan = 'Lab A'
} $tokenA
Expect 'A creates jadwal for own mata_kuliah' $jA @(200)
$jB = Send-Pb 'POST' '/api/collections/jadwal/records' @{
    mata_kuliah = $mkB.Data.id; hari = 2; jam_mulai = 600; jam_selesai = 720; menit_sebelum = 15; ruangan = 'Lab B'
} $tokenB
Expect 'B creates jadwal for own mata_kuliah' $jB @(200)

$jListA = Send-Pb 'GET' '/api/collections/jadwal/records?expand=mata_kuliah' $null $tokenA
Expect-PrivateList 'A lists jadwal' $jListA $jA.Data.id $jB.Data.id
$jListB = Send-Pb 'GET' '/api/collections/jadwal/records' $null $tokenB
Expect-PrivateList 'B lists jadwal' $jListB $jB.Data.id $jA.Data.id
$jListGuest = Send-Pb 'GET' '/api/collections/jadwal/records'
Expect 'Guest jadwal list request' $jListGuest @(200)
if (@($jListGuest.Data.items).Count -ne 0) {
    throw 'SECURITY FAIL: Guest can read jadwal records. Stop and fix List Rule.'
}
Write-Host 'PASS [data] Guest sees no jadwal records' -ForegroundColor Green
$script:Passed++
Expect 'A cannot view B jadwal' (Send-Pb 'GET' "/api/collections/jadwal/records/$($jB.Data.id)" $null $tokenA) @(404)
Expect 'A cannot create jadwal using B mata_kuliah' (Send-Pb 'POST' '/api/collections/jadwal/records' @{
    mata_kuliah = $mkB.Data.id; hari = 3; jam_mulai = 540; menit_sebelum = 15
} $tokenA) @(400)
Expect 'A updates own jadwal' (Send-Pb 'PATCH' "/api/collections/jadwal/records/$($jA.Data.id)" @{
    jam_mulai = 540
} $tokenA) @(200)
Expect 'A cannot transfer jadwal to B mata_kuliah' (Send-Pb 'PATCH' "/api/collections/jadwal/records/$($jA.Data.id)" @{
    mata_kuliah = $mkB.Data.id
} $tokenA) @(404)
Expect 'A cannot update B jadwal' (Send-Pb 'PATCH' "/api/collections/jadwal/records/$($jB.Data.id)" @{
    ruangan = 'Hacked'
} $tokenA) @(404)
Expect 'A cannot delete B jadwal' (Send-Pb 'DELETE' "/api/collections/jadwal/records/$($jB.Data.id)" $null $tokenA) @(404)

Expect 'A deletes own jadwal' (Send-Pb 'DELETE' "/api/collections/jadwal/records/$($jA.Data.id)" $null $tokenA) @(204)
Expect 'B deletes own jadwal' (Send-Pb 'DELETE' "/api/collections/jadwal/records/$($jB.Data.id)" $null $tokenB) @(204)
Expect 'A deletes own mata_kuliah' (Send-Pb 'DELETE' "/api/collections/mata_kuliah/records/$($mkA.Data.id)" $null $tokenA) @(204)
Expect 'B deletes own mata_kuliah' (Send-Pb 'DELETE' "/api/collections/mata_kuliah/records/$($mkB.Data.id)" $null $tokenB) @(204)

Write-Host ("`nALL TESTS PASSED: {0} checks" -f $script:Passed) -ForegroundColor Green
Write-Host 'Test mata_kuliah and jadwal records were cleaned up.'
Write-Host 'Two test users remain in users collection. Delete via admin panel when finished.' -ForegroundColor Yellow
Write-Host 'Never paste auth tokens or your real password into chat.' -ForegroundColor Yellow
