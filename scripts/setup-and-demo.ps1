# scripts/setup-and-demo.ps1

Write-Host "Configurando entorno para scripts de base de datos..." -ForegroundColor Cyan

# Instalar dependencias necesarias
Write-Host "Instalando ts-node y otras dependencias..." -ForegroundColor Yellow
npm install ts-node@10.9.1 --save-dev

# Asegurarse de que el cliente Prisma esté generado
Write-Host "Generando el cliente Prisma..." -ForegroundColor Yellow
npx prisma generate

# Ejecutar un primer ejemplo para listar elementos locales
Write-Host "`nEjecutando demostración: Buscar elementos que no están en la blockchain..." -ForegroundColor Green
npm run db:find-local

Write-Host "`n----------------------------------------------------------------------" -ForegroundColor Cyan
Write-Host "Configuración completada. Puedes usar los siguientes comandos:" -ForegroundColor Cyan
Write-Host "----------------------------------------------------------------------" -ForegroundColor Cyan
Write-Host "npm run db:find-local" -ForegroundColor White
Write-Host "  - Lista los elementos que no están vinculados a la blockchain" -ForegroundColor Gray
Write-Host "`nnpm run db:find -- --id=0x4641030ca68692ef5cd8fa5ba620c124617f90489d689ac0b8d654e69a1d41bd" -ForegroundColor White
Write-Host "  - Busca un elemento por su ID en la blockchain" -ForegroundColor Gray
Write-Host "`nnpm run db:find -- --owner=0xTuDireccion" -ForegroundColor White
Write-Host "  - Busca elementos por dirección del propietario" -ForegroundColor Gray
Write-Host "`nnpm run db:update -- --dbid=clXYZ --blockchainid=0x4641030ca68692ef5cd8fa5ba620c124617f90489d689ac0b8d654e69a1d41bd" -ForegroundColor White
Write-Host "  - Vincula un elemento existente a un ID de blockchain" -ForegroundColor Gray
Write-Host "`nnpm run db:update -- --dbid=clXYZ --remove" -ForegroundColor White
Write-Host "  - Elimina la asociación de un elemento con la blockchain" -ForegroundColor Gray
Write-Host "`nnpm run db:script -- -script local" -ForegroundColor White
Write-Host "  - Ejecuta el script PowerShell para elementos locales" -ForegroundColor Gray
Write-Host "----------------------------------------------------------------------" -ForegroundColor Cyan
