**Baulera: Fomentando la Confianza y la Recirculación de Bienes en la Comunidad**

"Baulera" se erige como una plataforma descentralizada diseñada para transformar la manera en que las comunidades interactúan con los bienes materiales. Su núcleo reside en la facilitación de préstamos y alquileres de objetos entre sus miembros, promoviendo una economía circular y fortaleciendo los lazos comunitarios a través de la confianza y la responsabilidad compartida. La aplicación opera sobre la blockchain, utilizando contratos inteligentes para garantizar la transparencia, seguridad y automatización de los acuerdos.


**Valor Social y Dinámica Comunitaria**

No es solo una plataforma de transacciones; es un catalizador para un cambio social positivo:

1.  **Fomento de la Economía Circular y Sostenibilidad:**
    *   **Recirculación de Bienes:** La aplicación combate directamente la cultura del "usar y tirar". Objetos que de otro modo permanecerían inactivos o serían desechados encuentran nueva vida al ser compartidos. Esto reduce la necesidad de producir nuevos bienes, ahorrando recursos naturales y disminuyendo la huella ecológica de la comunidad.
    *   **Acceso sobre Propiedad:** Se promueve un modelo donde el acceso a los bienes es tan valioso, si no más, que la propiedad misma. Esto es especialmente relevante para objetos de uso esporádico, permitiendo a los miembros de la comunidad satisfacer necesidades sin incurrir en el costo total de adquisición.

2.  **Construcción de Confianza y Cohesión Comunitaria:**
    *   **Interacciones Cercanas:** Al facilitar préstamos entre vecinos o miembros de una misma comunidad, "Baulera" crea puntos de contacto y fomenta relaciones interpersonales basadas en la confianza mutua. El acto de confiar un bien personal a otro, y la responsabilidad de cuidarlo, son fundamentales.
    *   **Sistema de Reputación como Capital Social:** La reputación se convierte en un activo valioso. Un historial de transacciones exitosas y comportamiento responsable abre puertas a más y mejores interacciones. Esto incentiva la honestidad y el cuidado, ya que las acciones de cada uno tienen consecuencias visibles y directas dentro de la comunidad.
    *   **Resolución Justa de Conflictos:** El sistema de arbitraje, aunque es un último recurso, proporciona un mecanismo transparente y (idealmente) imparcial para resolver desacuerdos. Esto refuerza la percepción de justicia y equidad dentro de la plataforma, vital para mantener la confianza a largo plazo.

3.  **Empoderamiento Económico y Social:**
    *   **Monetización de Activos Subutilizados:** Los dueños pueden generar ingresos pasivos a partir de objetos que no están utilizando activamente.
    *   **Ahorro para Prestatarios:** Los prestatarios pueden acceder a herramientas, equipos deportivos, artículos para eventos, etc., a una fracción de su costo de compra, liberando recursos económicos para otras necesidades.
    *   **Inclusión:** Puede facilitar el acceso a bienes a personas que de otro modo no podrían permitírselos, promoviendo una mayor equidad.

**Ejemplo de Flujo de Usuario:**

1.  **Ana tiene una escalera que usa pocas veces al año.** Decide listara en "Baulera" a través de `SecureBorrowing`. Establece una pequeña tarifa de alquiler y un depósito de seguridad.
2.  **Carlos necesita una escalera para un proyecto de fin de semana.** Busca en "Baulera", encuentra la de Ana. Su reputación es buena, así que procede. Paga la tarifa y el depósito. El contrato `SecureBorrowing` registra la transacción después de verificar la firma de Ana (que ella proveyó al listar o mediante una interacción offline).
3.  **Carlos usa la escalera y la devuelve.**
    *   **Escenario A (Sin Disputa):** Carlos la devuelve en perfecto estado. Ana (o Carlos) lo indica en la plataforma. `SecureBorrowing` le devuelve el depósito a Carlos. Ambos ven un aumento en su reputación.
    *   **Escenario B (Con Disputa):** Carlos devuelve la escalera con un peldaño roto. Ana reporta el daño. Como había un depósito, `SecureBorrowing` envía el caso y los fondos relevantes a `Arbitration`. Los árbitros votan. Supongamos que deciden que Carlos es responsable y el daño equivale al 70% del depósito. `Arbitration` instruye a `SecureBorrowing` para que pague a Ana el 70% del depósito (después de deducir los incentivos de arbitraje) y devuelva el 30% restante a Carlos. La reputación de Carlos disminuye significativamente, mientras que la de Ana recibe un pequeño impulso.

"Baulera" aspira a ser más que un mercado de alquileres. Busca tejer una red de confianza y colaboración, donde compartir recursos se convierta en una norma cultural, beneficiando tanto a los individuos como al colectivo y al medio ambiente. La tecnología blockchain y los contratos inteligentes son las herramientas que permiten que esta visión se materialice de forma segura, transparente y eficiente.

**Funcionalidades Clave y Flujo de Interacción**

La plataforma se articula en torno a dos contratos inteligentes principales: `SecureBorrowing` (Préstamo Seguro) y `Arbitration` (Arbitraje).

1.  **Gestión de Objetos (SecureBorrowing):**
    *   **Listado de Objetos (`listItem`):** Los usuarios (dueños) pueden listar sus objetos especificando detalles como una tarifa de préstamo/alquiler, un depósito de seguridad, una descripción (a través de un hash de metadatos) y un nivel mínimo de reputación requerido para el prestatario. Esto crea una oferta visible en la plataforma.
    *   **Actualización y Retiro de Listados (`updateItem`, `delistItem`):** Los dueños mantienen control sobre sus ofertas, pudiendo actualizarlas o retirarlas siempre que el objeto no esté actualmente en préstamo.
    *   **Sistema de Reputación Dinámico:** Cada usuario, ya sea como dueño o prestatario, posee una puntuación de reputación. Esta reputación se ajusta positiva o negativamente según el resultado de las transacciones. Una buena reputación es crucial para acceder a préstamos y ofrecer objetos. Comportamientos negativos pueden llevar a suspensiones temporales e incluso a un baneo permanente de la plataforma, asegurando un ecosistema de confianza. La reputación se calcula en base al valor de la transacción, incentivando interacciones de mayor valor con un mayor impacto reputacional.

2.  **Proceso de Préstamo (SecureBorrowing):**
    *   **Solicitud de Préstamo (`borrowItem`):** Un prestatario interesado en un objeto debe cumplir con el requisito de reputación mínima establecido por el dueño. Para iniciar el préstamo, el prestatario envía el pago de la tarifa y el depósito de seguridad. La autorización del dueño se gestiona mediante una firma digital (EIP712), lo que permite que el proceso sea asíncrono y seguro, sin que el dueño necesite estar online para aprobar cada solicitud.
    *   **Transacción Activa:** Una vez aceptado, el objeto se marca como "no disponible" y se crea un registro de la transacción, vinculando al dueño, prestatario y los detalles del acuerdo.

3.  **Finalización de la Transacción y Resolución de Disputas (SecureBorrowing & Arbitration):**
    *   **Devolución Amigable (`settleTransaction` sin daños):** Si el prestatario devuelve el objeto en buenas condiciones y el dueño está de acuerdo (o el prestatario mismo reporta la devolución sin incidentes), la transacción se cierra. El depósito se devuelve íntegramente al prestatario. Ambas partes ven un incremento en su reputación, fomentando el buen comportamiento.
    *   **Reporte de Daños y Disputas (`settleTransaction` con daños):**
        *   **Sin Depósito Involucrado:** Si el objeto se listó sin depósito y el dueño reporta daños, el sistema ajusta directamente las reputaciones: positiva para el dueño (por reportar) y negativa para el prestatario. No hay proceso de arbitraje monetario.
        *   **Con Depósito Involucrado:** Si hay un depósito y el dueño reporta daños, la transacción entra en una fase de disputa. El contrato `SecureBorrowing` transfiere automáticamente el depósito (o una parte como incentivo) al contrato `Arbitration` y se abre un caso de disputa (`openDispute` en `Arbitration`).
    *   **Proceso de Arbitraje (`Arbitration`):**
        *   Un panel de árbitros predefinidos (o actualizables por el administrador del contrato) es asignado a la disputa.
        *   Los árbitros tienen un período para votar (`castArbitratorVote`) sobre si el daño es responsabilidad del prestatario y determinar un porcentaje de severidad del daño (del 1% al 100% del depósito en disputa).
        *   Los árbitros son incentivados por su participación y honestidad, recibiendo una porción del "incentivePool" (un porcentaje del depósito original) y viendo afectada su propia reputación de árbitro.
    *   **Finalización de la Disputa (`finalizeDispute` en `Arbitration` y `processArbitrationOutcome` en `SecureBorrowing`):**
        *   Una vez cerrado el período de votación (o si todos los árbitros han votado), cualquier usuario puede finalizar la disputa.
        *   El contrato `Arbitration` calcula el resultado basado en la mayoría de votos y la severidad promedio.
        *   Se distribuyen los incentivos a los árbitros votantes y una pequeña comisión al usuario que finalizó la disputa.
        *   `Arbitration` notifica a `SecureBorrowing` el resultado: quién ganó la disputa y qué porcentaje del depósito restante (después de incentivos) debe ir al dueño como compensación.
        *   `SecureBorrowing` distribuye los fondos (compensación al dueño y/o reembolso al prestatario) y actualiza las reputaciones de dueño y prestatario según el veredicto. Una victoria del dueño impacta negativamente la reputación del prestatario, y viceversa.




## Puesta en Marcha desde Cero

Sigue estos pasos para clonar, configurar y ejecutar el proyecto Baulera en tu entorno local.

### 1. Clonar el Repositorio

```bash
git clone https://github.com/zxcvbs1/baule
cd baule # O el nombre que tenga el directorio clonado
```

### 2. Instalar Dependencias

El proyecto tiene dos partes principales con sus propias dependencias: el frontend (Next.js en la carpeta raíz del proyecto) y los contratos inteligentes (Hardhat en la subcarpeta `contracts`).

**Frontend (Carpeta Raíz del Proyecto):**

```bash
npm install
# o
yarn install
# o
pnpm install
# o
bun install
```

**Contratos Inteligentes (Subcarpeta `./contracts`):**
Para la instalación de dependencias, así como para las instrucciones de compilación, despliegue y otras tareas relacionadas con los contratos inteligentes, por favor consulta el archivo `README.md` ubicado dentro de la subcarpeta (`./contracts/README.md`).

### 3. Configurar Variables de Entorno y Direcciones de Contratos

#### 3.1. Variables de Entorno (Frontend)

Crea un archivo `.env.local` en la raíz del proyecto y añade las siguientes variables:

```env
# URL de la Base de Datos (Prisma)
# Esto asume que tu archivo dev.db está en ./prisma/dev.db
DATABASE_URL="file:./prisma/dev.db"

# Variables de Privy (consíguelas desde tu dashboard de Privy)
NEXT_PUBLIC_PRIVY_APP_ID="tu_privy_app_id_aqui"

# Dirección del contrato SecureBorrowing desplegado
# Esta dirección la obtendrás después de desplegar tus contratos (ver ./contracts/README.md).
NEXT_PUBLIC_SECURE_BORROWING_CONTRACT_ADDRESS="tu_direccion_de_contrato_secure_borrowing"
```

**Nota sobre `.env.local`:**
- Para Privy, necesitarás crear una cuenta en [Privy.io](https://privy.io/) y obtener tu `APP_ID`.
- `NEXT_PUBLIC_SECURE_BORROWING_CONTRACT_ADDRESS` es la dirección de tu contrato `SecureBorrowing` desplegado. Asegúrate de que esta dirección sea correcta.

#### 3.2. Actualización del ABI y Dirección del Contrato

Es crucial mantener la interfaz del frontend sincronizada con tus contratos inteligentes.

**Si modificas la estructura de tus contratos de Solidity (ej. `SecureBorrowing.sol` o `Arbitration.sol`):**
1.  **Recompila tus contratos:** Usualmente con `npx hardhat compile` dentro del directorio `contracts`.
2.  **Obtén el ABI actualizado:** El nuevo ABI se encontrará en el archivo JSON de artefactos correspondiente (ej. `contracts/artifacts/contracts/SecureBorrowing.sol/SecureBorrowing.json`).
3.  **Actualiza el ABI en el frontend:** Copia el array del ABI del archivo JSON y pégalo para reemplazar el contenido de `secureBorrowingABI` en el archivo `src/lib/contract.ts`.

**Si vuelves a desplegar tus contratos (obteniendo una nueva dirección):**
1.  Obtén la nueva dirección del contrato `SecureBorrowing` (y cualquier otro contrato relevante como `Arbitration` si su dirección también se gestiona de forma similar).
2.  Actualiza el valor de `NEXT_PUBLIC_SECURE_BORROWING_CONTRACT_ADDRESS` en tu archivo `.env.local` (o `.env`) con la nueva dirección.

**Importante:**
*   Si el contrato de `Arbitration` tiene su propio ABI y dirección que necesitas referenciar directamente desde el frontend (y no solo a través de `SecureBorrowing`), asegúrate de seguir un proceso similar para actualizar su ABI en `src/lib/contract.ts` y su dirección en el archivo `.env.local` (creando una nueva variable de entorno como `NEXT_PUBLIC_ARBITRATION_CONTRACT_ADDRESS` si es necesario).
*   Consulta el `README.md` en la carpeta `./contracts` para obtener instrucciones detalladas sobre la compilación y el despliegue de los contratos.

### 4. Configurar la Base de Datos (Prisma)

Desde la raíz del proyecto:

```bash
# Generar el cliente de Prisma
npx prisma generate

# Aplicar las migraciones para crear las tablas en la base de datos
npx prisma migrate dev --name init 
```
Esto utilizará el archivo `./prisma/schema.prisma` para configurar tu base de datos SQLite local (`./prisma/dev.db`).

### 5. Ejecutar el Proyecto (Frontend)

Una vez que todas las dependencias estén instaladas, las variables de entorno configuradas (incluyendo las de los contratos que se detallan en `./contracts/README.md`), la base de datos inicializada y los contratos desplegados (siguiendo las instrucciones de `./contracts/README.md`):

```bash
npm run dev
# o
yarn dev
# o
pnpm dev
# o
bun dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador para ver la aplicación.

