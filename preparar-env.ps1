# =============================================================================
#  preparar-env.ps1 - el .env de Patrimonio Inmuebles, con secretos al azar
# =============================================================================
#  Los secretos no tienen valor por omision en el repositorio: un valor escrito
#  ahi seria publico. Este script los genera en tu .env, que no se sube.
#
#    .\preparar-env.ps1
#        Crea el .env desde .env.example si no existe, y completa cada secreto
#        que falte o este vacio. Lo que ya tiene valor no se toca.
#
#    .\preparar-env.ps1 -Renovar
#        Ademas cambia los secretos que todavia tengan el valor de desarrollo
#        que antes venia escrito en el repositorio (lo reconoce por su huella
#        SHA-256, sin guardarlo aqui). La clave del panel se cambia tambien en
#        el usuario que ya existe, a traves del servidor (que tiene que estar
#        arriba).
#
#    .\preparar-env.ps1 -Renovar -TambienCifrado
#        Lo mismo, y tambien CIFRADO_LLAVE. Cuidado: con ella se cifran la clave
#        de la agencia y el secreto de sus avisos; despues de cambiarla hay que
#        volver a conectar la agencia en la pestana Cobranza.
#
#    .\preparar-env.ps1 -Cambiar ADMIN_PASSWORD
#        Cambia ese secreto aunque ya tenga un valor propio: para cuando se
#        filtro (quedo en una captura, en un registro, en un chat).
#
#  Nunca muestra un valor. Despues: docker compose up -d.
# =============================================================================
param(
    [switch]$Renovar,
    [switch]$TambienCifrado,
    [string[]]$Cambiar = @(),
    #  Donde responde el servidor. Solo cambia en una prueba.
    [string]$Servidor = ''
)

$ErrorActionPreference = 'Stop'
$archivo = Join-Path $PSScriptRoot '.env'
$ejemplo = Join-Path $PSScriptRoot '.env.example'
$sinBom = New-Object System.Text.UTF8Encoding($false)

#  Los secretos, y la huella SHA-256 del valor publico que tenia cada uno.
$secretos = [ordered]@{
    ADMIN_PASSWORD = 'b08484025c59fc905b68ab2bb23daa4249a7d88ad96a6af6e4d982485ac7a078'
    CIFRADO_LLAVE  = '8f4360518f0031947845458f093f65474526d606570a2b9bdf49bb5e91b6a766'
}

function Nueva-Clave {
    #  48 bytes al azar del generador criptografico, en base64 sin + / ni =.
    $bytes = New-Object byte[] 48
    $generador = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $generador.GetBytes($bytes)
    $generador.Dispose()
    return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Huella([string]$texto) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $hash = $sha.ComputeHash($sinBom.GetBytes($texto))
    $sha.Dispose()
    return -join ($hash | ForEach-Object { $_.ToString('x2') })
}

function Valor([System.Collections.Generic.List[string]]$lineas, [string]$nombre) {
    foreach ($linea in $lineas) {
        if ($linea -match "^\s*$nombre\s*=(.*)$") { return $Matches[1].Trim() }
    }
    return $null
}

function Poner([System.Collections.Generic.List[string]]$lineas, [string]$nombre, [string]$valor) {
    for ($i = 0; $i -lt $lineas.Count; $i++) {
        if ($lineas[$i] -match "^\s*$nombre\s*=") { $lineas[$i] = "$nombre=$valor"; return }
    }
    $lineas.Add("$nombre=$valor")
}

#  Cambia la clave del panel a traves del servidor: entra con la actual y pide
#  la nueva (PUT /api/admin/mi-clave). Las claves van en el cuerpo de la
#  peticion, nunca en la linea de comandos.
function Cambiar-En-El-Panel([string]$base, [string]$correo, [string]$actual, [string]$nueva) {
    try {
        $sesion = Invoke-RestMethod -Method Post -Uri "$base/api/admin/login" -ContentType 'application/json' `
            -Body (@{ correo = $correo; clave = $actual } | ConvertTo-Json)
        Invoke-RestMethod -Method Put -Uri "$base/api/admin/mi-clave" -ContentType 'application/json' `
            -Headers @{ Authorization = "Bearer $($sesion.token)" } `
            -Body (@{ actual = $actual; nueva = $nueva } | ConvertTo-Json) | Out-Null
        Invoke-RestMethod -Method Post -Uri "$base/api/admin/logout" -Headers @{ Authorization = "Bearer $($sesion.token)" } | Out-Null
        return $true
    } catch {
        return $false
    }
}

if (-not (Test-Path $archivo)) {
    Copy-Item $ejemplo $archivo
    Write-Host "Cree el .env desde .env.example."
}
$lineas = New-Object System.Collections.Generic.List[string]
foreach ($linea in [System.IO.File]::ReadAllLines($archivo, $sinBom)) { $lineas.Add($linea) }

if (-not $Servidor) {
    $puerto = Valor $lineas 'PATRIMONIO_PORT'
    if (-not $puerto) { $puerto = '3001' }
    $Servidor = "http://localhost:$puerto"
}
$correo = Valor $lineas 'ADMIN_CORREO'
if (-not $correo) { $correo = 'admin@patrimonioinmuebles.cl' }

foreach ($nombre in $secretos.Keys) {
    $actual = Valor $lineas $nombre
    if (-not $actual) {
        Poner $lineas $nombre (Nueva-Clave)
        Write-Host "$nombre`: generado."
        continue
    }
    $forzado = $Cambiar -contains $nombre
    if ((Huella $actual) -ne $secretos[$nombre] -and -not $forzado) {
        Write-Host "$nombre`: ya tiene un valor propio, no se toca."
        continue
    }
    if (-not $Renovar -and -not $forzado) {
        Write-Host "$nombre`: tiene el valor publico de antes. Cambialo con -Renovar." -ForegroundColor Yellow
        continue
    }
    if ($nombre -eq 'CIFRADO_LLAVE' -and -not $TambienCifrado -and -not $forzado) {
        Write-Host "CIFRADO_LLAVE: tiene el valor publico de antes. No la cambio sin -TambienCifrado (habria que volver a conectar la agencia)." -ForegroundColor Yellow
        continue
    }
    $nueva = Nueva-Clave
    if ($nombre -eq 'ADMIN_PASSWORD') {
        if (-not (Cambiar-En-El-Panel $Servidor $correo $actual $nueva)) {
            Write-Host "ADMIN_PASSWORD: no pude cambiarla en el panel ($Servidor tiene que estar arriba, con esta version); el .env queda como estaba." -ForegroundColor Yellow
            continue
        }
    }
    Poner $lineas $nombre $nueva
    Write-Host "$nombre`: renovado." -ForegroundColor Green
}

[System.IO.File]::WriteAllLines($archivo, $lineas, $sinBom)
Write-Host ""
Write-Host "Listo. Para que el contenedor tome los valores: docker compose up -d"
exit 0
