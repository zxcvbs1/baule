# Contratos Inteligentes para Baulera

Este proyecto contiene los contratos inteligentes de Solidity para la plataforma Baulera, incluyendo los contratos `SecureBorrowing` y `Arbitration`, gestionados y desplegados usando Hardhat.

## Tabla de Contenidos
1.  [Prerrequisitos](#prerrequisitos)
2.  [Configuración e Instalación](#configuración-e-instalación)
3.  [Entorno de Desarrollo Local (Hardhat)](#entorno-de-desarrollo-local-hardhat)
    *   [Ejecutar un Nodo Local de Hardhat](#ejecutar-un-nodo-local-de-hardhat)
4.  [Compilación](#compilación)
5.  [Despliegue](#despliegue)
    *   [Desplegar Contratos](#desplegar-contratos)
6.  [Fondear Billeteras](#fondear-billeteras)
    *   [Usar Cuentas Pre-fondeadas de Hardhat](#usar-cuentas-pre-fondeadas-de-hardhat)
    *   [Script de Fondeo Personalizado](#script-de-fondeo-personalizado)
7.  [Interactuar con Contratos Desplegados (Scripts)](#interactuar-con-contratos-desplegados-scripts)
8.  [Ejecutar Pruebas](#ejecutar-pruebas)
    *   [Flujo de Trabajo Avanzado para Pruebas Específicas](#flujo-de-trabajo-avanzado-para-pruebas-específicas)
9.  [Estructura del Proyecto](#estructura-del-proyecto)
10. [Resolución de Problemas/Notas](#resolución-de-problemasnotas)

## Prerrequisitos

Antes de comenzar, asegúrate de tener instalado lo siguiente:
*   **Node.js**: (Se recomienda la última versión LTS)
*   **Bun**: (Ya que este proyecto fue inicializado con Bun) - Guía de instalación: [https://bun.sh/docs/installation](https://bun.sh/docs/installation)
*   **Git**: Para clonar el repositorio.

## Configuración e Instalación

1.  **Clonar el Repositorio**:
    ```bash
    git clone <https://github.com/zxcvbs1/baule
    cd baule/contracts
    ```

2.  **Instalar Dependencias**:
    Este proyecto usa Bun para la gestión de paquetes.
    ```bash
    bun install
    ```
    Esto instalará Hardhat y otras bibliotecas necesarias especificadas en `package.json`.

## Entorno de Desarrollo Local (Hardhat)

### Ejecutar un Nodo Local de Hardhat

Para interactuar con tus contratos localmente, necesitas ejecutar una red Hardhat. Esto simula una red Ethereum en tu máquina.

1.  **Iniciar el Nodo Hardhat**:
    ```bash
    bunx hardhat node
    ```
    Este comando:
    *   Iniciará un nodo Ethereum local (generalmente en `http://127.0.0.1:8545/`).
    *   Mostrará una lista de 20 cuentas pre-fondeadas con sus claves privadas y 10000 ETH cada una. Estas son muy útiles para el desarrollo.

    Mantén esta ventana de terminal abierta. Ejecutarás otros comandos en una nueva ventana/pestaña de terminal.

## Compilación

Aunque los scripts de despliegue y prueba suelen compilar los contratos automáticamente, puedes compilarlos manualmente:

```bash
bunx hardhat compile
```
Esto genera o actualiza el directorio `artifacts/` con los ABIs y bytecode de los contratos.

## Despliegue

### Desplegar Contratos

El script `scripts/deploy.js` maneja el despliegue de los contratos `Arbitration` y `SecureBorrowing`.

1.  **Asegurar que el Nodo Hardhat esté Corriendo**: Asegúrate de tener un nodo Hardhat corriendo en una terminal separada (ver [Ejecutar un Nodo Local de Hardhat](#ejecutar-un-nodo-local-de-hardhat)).

2.  **Ejecutar el Script de Despliegue**:
    ```bash
    bunx hardhat run scripts/deploy.js --network localhost
    ```
    Este script:
    *   Desplegará el contrato `Arbitration`.
    *   Desplegará el contrato `SecureBorrowing`, vinculándolo al contrato `Arbitration` desplegado.
    *   Imprimirá las direcciones de los contratos desplegados en la consola.

    **Importante**: Anota estas direcciones. Las necesitarás para configurar tu aplicación frontend y para usarlas en varios scripts de interacción. La dirección del contrato `SecureBorrowing` es particularmente importante para la mayoría de las operaciones relacionadas con ítems.

## Fondear Billeteras

### Usar Cuentas Pre-fondeadas de Hardhat

Cuando inicias el nodo Hardhat (`npx hardhat node`), proporciona una lista de cuentas ya fondeadas con una gran cantidad de ETH. Puedes importar estas cuentas en MetaMask (usando sus claves privadas) o usarlas directamente en tus scripts para pruebas.

### Script de Fondeo Personalizado

Si necesitas fondear una billetera externa específica (por ejemplo, tu cuenta personal de MetaMask en la red Hardhat) desde una de las cuentas fondeadas por defecto de Hardhat, puedes usar el script `scripts/fund-baule-wallet.js`.

1.  **Editar el Script (si es necesario)**:
    Abre `contracts/scripts/fund-baule-wallet.js`.
    Modifica la variable `recipientAddress` a la dirección que quieres fondear.
    ```javascript
    // const recipientAddress = "0xTU_DIRECCION_DE_BILLETERA_PERSONALIZADA_AQUI"; // Reemplazar con el objetivo
    const recipientAddress = "0x7Afb1348Eb86c2e1f8a6442f0FB724CA423eD9DE"; // Ejemplo
    ```

2.  **Ejecutar el Script de Fondeo**:
    Asegúrate de que tu nodo Hardhat esté corriendo.
    ```bash
    bunx hardhat run scripts/fund-baule-wallet.js --network localhost
    ```
    Esto enviará 100 ETH (por defecto, se puede cambiar en el script) desde la primera cuenta por defecto de Hardhat a tu `recipientAddress` especificada.

## Interactuar con Contratos Desplegados (Scripts)

El directorio `scripts/` contiene varios scripts para interactuar con tus contratos desplegados.
**Nota**: Antes de ejecutar estos scripts, asegúrate de que:
*   Tu nodo Hardhat esté corriendo (`bunx hardhat node`).
*   Los contratos hayan sido desplegados usando `scripts/deploy.js --network localhost`.
*   Hayas actualizado cualquier dirección de contrato o parámetro necesario dentro de los scripts si difieren de los valores por defecto o del último despliegue. Por ejemplo, muchos scripts pueden tener una dirección de contrato codificada que deberías actualizar a la dirección de tu último despliegue de `SecureBorrowing`.

Aquí algunos de los scripts disponibles:

*   **`scripts/check-contract-deployed.js`**:
    *   Propósito: Verifica si una lista de direcciones tiene bytecode desplegado en la red (es decir, si son contratos).
    *   Uso: Las direcciones están codificadas en el script. Modifica el array `addressesToCheck` en el script.
    *   Comando: `bunx hardhat run scripts/check-contract-deployed.js --network localhost`

*   **`scripts/check-item-onchain.js`**:
    *   Propósito: Verifica los detalles de un ID de ítem específico en el contrato `SecureBorrowing`.
    *   Uso: Necesitas establecer las variables `itemIdToCheck` y `secureBorrowingContractAddress` dentro del script.
    *   Comando: `bunx hardhat run scripts/check-item-onchain.js --network localhost`

*   **`scripts/list-all-items-from-events.js`**:
    *   Propósito: Lista los eventos `ItemListed` e `ItemDelisted` de una dirección de contrato especificada, ordenados cronológicamente.
    *   Uso: Actualiza `contractAddress` en el script si es necesario (por ejemplo, a la dirección de tu contrato `SecureBorrowing` o un despliegue anterior).
    *   Comando: `bunx hardhat run scripts/list-all-items-from-events.js --network localhost`

*   **`scripts/delist-items.js`**:
    *   Propósito: Deslista ítems especificados del contrato `SecureBorrowing`. Requiere suplantar a los propietarios de los ítems.
    *   Uso: Configura `contractAddress` y el array `itemsToDelist` (con `itemId` y `ownerAddress`) dentro del script.
    *   Comando: `bunx hardhat run scripts/delist-items.js --network localhost`

*   **(Ejemplo) Listar un Nuevo Ítem**:
    Para listar un nuevo ítem, típicamente llamarías a la función `listItem` en el contrato `SecureBorrowing`. Puedes crear un nuevo script (por ejemplo, `scripts/list-new-item.js`) para esto:
    ```javascript
    // scripts/list-new-item.js (Ejemplo - Crea este archivo)
    const hre = require("hardhat");

    async function main() {
      const secureBorrowingAddress = "0xTU_DIRECCION_DEL_CONTRATO_SECUREBORROWING"; // Reemplazar
      const [signer] = await hre.ethers.getSigners(); // Usa la primera cuenta de Hardhat

      const secureBorrowing = await hre.ethers.getContractAt("SecureBorrowing", secureBorrowingAddress, signer);

      const itemId = hre.ethers.id("miItemDePrueba123"); // ID de ítem de ejemplo (bytes32)
      const fee = hre.ethers.parseEther("0.01");
      const deposit = hre.ethers.parseEther("0.1");
      const metadataHash = hre.ethers.id("metadataItem123");
      const minReputation = 0;

      console.log(`Listando ítem ${itemId} por el propietario ${signer.address}...`);
      const tx = await secureBorrowing.listItem(itemId, fee, deposit, metadataHash, minReputation);
      await tx.wait();
      console.log(`¡Ítem listado! Hash de transacción: ${tx.hash}`);
    }

    main().catch(console.error);
    ```
    Ejecútalo con: `bunx hardhat run scripts/list-new-item.js --network localhost`

## Ejecutar Pruebas

El proyecto incluye un conjunto de pruebas en el directorio `test/`.

1.  **Ejecutar Todas las Pruebas**:
    Asegúrate de que tu nodo Hardhat **no** esté necesariamente corriendo para `bunx hardhat test`, ya que a menudo inicia su propia instancia en memoria. Sin embargo, si las pruebas están configuradas para usar la red `localhost` explícitamente, podrías necesitarlo.
    ```bash
    bunx hardhat test
    ```
    Este comando ejecutará todos los archivos de prueba (`*.t.ts` o `*.spec.ts`) en el directorio `test`.

### Flujo de Trabajo Avanzado para Pruebas Específicas

Durante el desarrollo, es común querer realizar una limpieza completa, recompilar y luego ejecutar un archivo de prueba específico para asegurar que no haya artefactos o cachés obsoletos que afecten los resultados. También es útil redirigir la salida detallada a un archivo para su posterior análisis.

El siguiente comando combina estos pasos:

```bash
rm -fr artifacts cache errors && bunx hardhat clean && bunx hardhat compile && bunx hardhat test --verbose test/Transaction.t.ts > errors
```

Desglose del comando:
*   `rm -fr artifacts cache errors`:
    *   `rm -fr`: Comando para eliminar archivos y directorios de forma forzada (`-f`) y recursiva (`-r`).
    *   `artifacts cache errors`: Especifica los directorios `artifacts/`, `cache/` y un archivo/directorio `errors` (si existe) a eliminar. Esto asegura que no queden restos de compilaciones o ejecuciones anteriores.
*   `bunx hardhat clean`:
    *   Ejecuta la tarea `clean` de Hardhat, que elimina la caché de compilación y los artefactos generados por Hardhat. Es una forma más "oficial" de limpiar el entorno de Hardhat.
*   `bunx hardhat compile`:
    *   Compila los contratos inteligentes del proyecto.
*   `bunx hardhat test --verbose test/Transaction.t.ts > errors`:
    *   `bunx hardhat test`: Ejecuta las pruebas de Hardhat.
    *   `--verbose`: Proporciona una salida más detallada durante la ejecución de las pruebas.
    *   `test/Transaction.t.ts`: Especifica que solo se debe ejecutar el archivo de prueba `Transaction.t.ts` ubicado en el directorio `test/`. Puedes cambiar esto por cualquier otro archivo de prueba.
    *   `> errors`: Redirige la salida estándar (stdout) del comando de prueba al archivo `errors` en el directorio actual. Si el archivo `errors` no existe, se creará. Si existe, se sobrescribirá. Esto es útil para capturar logs extensos o mensajes de error para una revisión detallada.

**Uso**:
Este comando es particularmente útil cuando:
*   Sospechas que la caché o artefactos antiguos están causando problemas.
*   Quieres enfocarte en un conjunto específico de pruebas (por ejemplo, `Transaction.t.ts`).
*   Necesitas un registro detallado de la ejecución de una prueba para depuración.

Asegúrate de ejecutar este comando desde el directorio raíz de tu proyecto de contratos (`contracts/`).

## Estructura del Proyecto

*   `contracts/`: Contiene los archivos fuente de los contratos inteligentes de Solidity (por ejemplo, `SecureBorrowing.sol`, `Arbitration.sol`).
*   `scripts/`: Contiene archivos JavaScript/TypeScript para el despliegue e interacción con los contratos.
*   `test/`: Contiene archivos de prueba para los contratos inteligentes (usando Hardhat, Viem, Chai).
*   `artifacts/`: Almacena los ABIs y bytecode de los contratos, generados durante la compilación. (No editar manualmente).
*   `cache/`: Archivos de caché de Hardhat. (No editar manualmente).
*   `hardhat.config.ts`: Archivo de configuración para Hardhat (configuraciones de red, versiones del compilador de Solidity, etc.).
*   `package.json`: Lista las dependencias del proyecto y scripts.
*   `bun.lockb`: Archivo de bloqueo de Bun para las dependencias.

## Resolución de Problemas/Notas

*   **Nodo Hardhat**: Siempre asegúrate de que tu nodo Hardhat local esté corriendo (`bunx hardhat node`) en una terminal separada antes de ejecutar scripts que apunten a la red `localhost` (por ejemplo, `deploy.js`, scripts de interacción).
*   **Direcciones de Contratos**: Las direcciones de los contratos cambian con cada nuevo despliegue. Asegúrate de actualizar estas direcciones en la configuración de tu frontend (archivos `.env`, constantes) y en cualquier script que las requiera. El script `deploy.js` mostrará las nuevas direcciones.
*   **"Error: connect ECONNREFUSED 127.0.0.1:8545"**: Esto usualmente significa que tu nodo local de Hardhat no está corriendo o no es accesible.
*   **Errores de Nonce / "Transaction reverted without a reason string"**: Si estás enviando transacciones rápidamente desde la misma cuenta, podrías encontrar problemas de nonce. Reiniciar el nodo Hardhat a veces puede ayudar, ya que resetea el estado de la blockchain. Para reversiones más específicas, usa `console.log` en tus contratos de Solidity o un registro de errores detallado en tus scripts.
*   **Costos de Gas**: Las operaciones en la blockchain requieren gas. Las cuentas de la red local de Hardhat están pre-fondeadas, por lo que esto usualmente no es un problema en el desarrollo local.



