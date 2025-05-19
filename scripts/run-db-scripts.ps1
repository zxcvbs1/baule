# scripts/run-db-scripts.ps1

param (
    [string]$script = "all",
    [string]$dbid = "",
    [string]$blockchainid = "",
    [string]$owner = "",
    [switch]$remove = $false,
    [switch]$fix = $false
)

$scriptPath = Join-Path -Path $PSScriptRoot -ChildPath ".."

# Preparando entorno para ejecutar scripts...
Write-Host "Preparando entorno para ejecutar scripts..." -ForegroundColor Cyan
Set-Location -Path $scriptPath

# Ejecutar el script solicitado
switch ($script) {
    "local" {
        Write-Host "Ejecutando búsqueda de elementos no vinculados a la blockchain..." -ForegroundColor Green
        npx ts-node scripts/find-non-blockchain-items.ts
    }
    "find" {
        Write-Host "Ejecutando búsqueda de elementos específicos..." -ForegroundColor Green
        $params = @()
        if ($blockchainid) {
            $params += "--id=$blockchainid"
        }
        if ($owner) {
            $params += "--owner=$owner"
        }
        npx ts-node scripts/find-specific-blockchain-item.ts $params
    }
    "update" {
        Write-Host "Ejecutando actualización de asociación con blockchain..." -ForegroundColor Green
        $params = @()
        if ($dbid) {
            $params += "--dbid=$dbid"
        }
        if ($blockchainid) {
            $params += "--blockchainid=$blockchainid"
        }
        if ($remove) {
            $params += "--remove"
        }
        npx ts-node scripts/update-blockchain-association.ts $params
    }    "all" {
        Write-Host "Ejecutando búsqueda de todos los elementos..." -ForegroundColor Green
        npx ts-node scripts/find-non-blockchain-items.ts
    }
    "list-all" {
        Write-Host "Listando todos los elementos con todos sus campos..." -ForegroundColor Green
        npx ts-node scripts/list-all-items.ts
    }
    "delete-all" {
        Write-Host "Eliminando todos los elementos de la base de datos..." -ForegroundColor Red
        npx ts-node scripts/delete-all-items.ts
    }    "manage" {
        Write-Host "Ejecutando herramienta de gestión de elementos..." -ForegroundColor Green
        npx ts-node scripts/manage-items.ts --action=list
    }    "verify" {
        Write-Host "Verificando elementos blockchain..." -ForegroundColor Green
        $params = @()
        if ($remove) {
            $params += "--remove"
        } elseif ($PSBoundParameters.ContainsKey('fix') -and $fix) {
            $params += "--fix"
        }
        npx ts-node --transpile-only scripts/verify-blockchain-items.ts $params
    }
    default {
        Write-Host "Opción no válida. Las opciones disponibles son: local, find, update, all, list-all, delete-all, manage, verify" -ForegroundColor Red
    }
}

Write-Host "`nScript completado." -ForegroundColor Cyan
