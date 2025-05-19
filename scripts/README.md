# Scripts para Gestionar Elementos de Base de Datos

Estos scripts te permiten identificar y gestionar elementos en la base de datos SQLite, especialmente aquellos que no están vinculados a la blockchain.

## Prerrequisitos

- Node.js instalado
- Prisma Client generado (ejecuta `npx prisma generate` si no está generado)

## Scripts Disponibles

### 1. Buscar Elementos No Vinculados a la Blockchain

Encuentra todos los elementos que no tienen un ID de blockchain asociado (contractItemId es null).

```powershell
# PowerShell
.\scripts\run-db-scripts.ps1 -script local
```

### 2. Buscar Elementos Específicos

Busca elementos por ID de blockchain o dirección de propietario.

```powershell
# Buscar por ID de blockchain
.\scripts\run-db-scripts.ps1 -script find -blockchainid 0x4641030ca68692ef5cd8fa5ba620c124617f90489d689ac0b8d654e69a1d41bd

# Buscar por dirección de propietario
.\scripts\run-db-scripts.ps1 -script find -owner 0xYourWalletAddress

# Buscar con ambos criterios
.\scripts\run-db-scripts.ps1 -script find -blockchainid 0x1234... -owner 0xABCD...
```

### 3. Actualizar Asociación con Blockchain

Asocia un elemento existente con un ID de blockchain o elimina una asociación existente.

```powershell
# Asociar un elemento con un ID de blockchain
.\scripts\run-db-scripts.ps1 -script update -dbid clg123abc -blockchainid 0x4641030ca68692ef5cd8fa5ba620c124617f90489d689ac0b8d654e69a1d41bd

# Eliminar la asociación con la blockchain
.\scripts\run-db-scripts.ps1 -script update -dbid clg123abc -remove
```

### 4. Mostrar Todos los Elementos

Muestra información sobre todos los elementos en la base de datos.

```powershell
.\scripts\run-db-scripts.ps1
# o
.\scripts\run-db-scripts.ps1 -script all
```

### 5. Listar Todos los Ítems con Todos sus Campos (Detallado)

Muestra una lista completa y detallada de todos los elementos con todos sus campos.

```powershell
# Con npm
npm run db:list-all

# Con PowerShell
.\scripts\run-db-scripts.ps1 -script list-all

# Con ts-node directamente
ts-node scripts/list-all-items.ts
```

### 6. Eliminar Todos los Ítems de la Base de Datos

Elimina todos los elementos de la base de datos (con confirmación de seguridad).

```powershell
# Con npm (requiere confirmación)
npm run db:delete-all -- --confirm="ELIMINAR TODO"

# Con PowerShell
.\scripts\run-db-scripts.ps1 -script delete-all

# Con ts-node directamente
ts-node scripts/delete-all-items.ts --confirm="ELIMINAR TODO"
```

### 7. Gestionar Ítems (Listar, Editar, Eliminar)

Proporciona herramientas para gestionar ítems individuales.

```powershell
# Listar todos los ítems (versión resumida)
npm run db:manage -- --action=list
.\scripts\run-db-scripts.ps1 -script manage

# Eliminar un ítem específico
npm run db:manage -- --action=delete --id=clXYZ123 --confirm

# Editar un campo de un ítem
npm run db:manage -- --action=edit --id=clXYZ123 --field=name --value="Nuevo nombre"

# Eliminar la asociación con blockchain
npm run db:manage -- --action=edit --id=clXYZ123 --field=contractItemId --value=null
```

### 8. Verificar Elementos Blockchain

Verifica si los elementos marcados como elementos blockchain (con contractItemId) realmente existen en la blockchain. Proporciona opciones para arreglar (fijar) o eliminar elementos que no existen en la blockchain.

```powershell
# Solo verificar (sin realizar cambios)
.\scripts\run-db-scripts.ps1 -script verify

# Arreglar elementos inválidos (establecer contractItemId a null)
.\scripts\run-db-scripts.ps1 -script verify -fix

# Eliminar elementos inválidos completamente
.\scripts\run-db-scripts.ps1 -script verify -remove

# Ejecutar directamente con ts-node
npx ts-node scripts/verify-blockchain-items.ts
npx ts-node scripts/verify-blockchain-items.ts --fix
npx ts-node scripts/verify-blockchain-items.ts --remove
```

## Ejecutar Scripts Directamente

También puedes ejecutar los scripts TypeScript directamente con ts-node si lo prefieres:

```powershell
# Instalar ts-node si no está instalado
npm install -g ts-node

# Ejecutar scripts directamente
ts-node scripts/find-non-blockchain-items.ts
ts-node scripts/find-specific-blockchain-item.ts --id=0x1234... --owner=0xABCD...
ts-node scripts/update-blockchain-association.ts --dbid=clg123abc --blockchainid=0x1234...
ts-node scripts/update-blockchain-association.ts --dbid=clg123abc --remove
```

## Notas

- El ID de la base de datos (`dbid`) es el valor `id` generado por Prisma, generalmente comienza con "cl".
- El ID de blockchain (`blockchainid`) es el valor hexadecimal que identifica el elemento en la blockchain, como "0x4641030ca68692ef5cd8fa5ba620c124617f90489d689ac0b8d654e69a1d41bd".
- Si recibes errores, asegúrate de que la base de datos exista y sea accesible (comprueba el archivo .env.local para la configuración de la base de datos).
