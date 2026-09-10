# Acceso Escolar 1.3 — arquitectura multi-escuela

## Objetivo

La aplicación funciona como un servicio multiempresa: cada escuela es una organización aislada y contiene sus propios usuarios, eventos, nóminas y registros de acceso.

```text
organizations/{organizationId}
  members/{userId}
  events/{eventId}
    families/{familyId}
    students/{studentId}
    logs/{logId}
organizationInvitations/{code}
```

Las reglas de Firestore validan la organización y el rol en cada lectura y escritura. No existe una consulta global de estudiantes ni eventos.

Los alumnos que comparten cupo guardan únicamente la referencia `familyId`. El
contador, cupo, estado, integrantes y cupo extraordinario pertenecen al documento
`families/{familyId}`. Al abrir un evento anterior como administrador, la
aplicación crea estos documentos de forma idempotente a partir de los datos
históricos; desde ese momento los ingresos actualizan la familia y la bitácora en
una misma transacción.

## Roles

- `admin`: configura eventos, importa nóminas, corrige registros y crea invitaciones.
- `operator`: escanea códigos y registra ingresos; no puede administrar la nómina.
- `viewer`: consulta el panel y la bitácora sin modificar datos.

Cada ingreso guarda el UID y correo del operador que lo registró.

## Alta de una escuela

1. Un administrador elige **Nueva escuela** y crea la organización con su correo.
2. La aplicación crea un evento inicial vacío.
3. En **Usuarios**, el administrador crea códigos de invitación con vigencia de siete días.
4. El invitado elige **Invitación**, indica el código, su correo y una contraseña.
5. La organización aparece automáticamente en la cuenta del usuario.

Las invitaciones se vinculan a un correo y no pueden reutilizarse.

## Migración de Mundo Palabra

El identificador reservado es `colegio-mundopalabra`. Al registrar por primera vez una organización llamada **Colegio MundoPalabra**, la aplicación copia automáticamente los eventos, alumnos e historial desde la estructura anterior. La fuente anterior queda intacta y en modo de solo lectura.

Existe una alternativa manual para recuperación. Las credenciales se entregan como variables temporales y nunca se guardan en el repositorio:

```powershell
$env:MIGRATION_EMAIL = 'administrador@colegio.cl'
$env:MIGRATION_PASSWORD = 'contraseña-temporal'
npm run migrate:mundopalabra
Remove-Item Env:MIGRATION_EMAIL
Remove-Item Env:MIGRATION_PASSWORD
```

Después de verificar la migración se debe retirar el bloque de compatibilidad `/events/{eventId}/{legacyDocument=**}` de `firestore.rules`.

## Activación productiva

1. Habilitar Firebase Authentication con correo y contraseña.
2. Desplegar `firestore.rules`.
3. Publicar la versión 1.3 en Vercel.
4. Registrar `Colegio MundoPalabra` desde la aplicación.
5. Confirmar que eventos, nómina e historial fueron copiados.
6. Probar una invitación con rol operador y otra con rol consulta.
7. Retirar el acceso de migración y volver a desplegar las reglas.

No se debe publicar la interfaz 1.3 sin completar los pasos 1 y 2: la versión nueva no utiliza la contraseña compartida anterior.

## Privacidad

La recuperación pública de QR por RUT fue retirada del inicio de sesión. Exponer la nómina completa a usuarios sin autenticar es incompatible con el aislamiento multi-escuela. Una futura recuperación para apoderados debe usar un endpoint limitado, códigos de un solo uso o un enlace individual firmado.

## Operación de eventos (v1.7)

- Cada evento define `status` (`draft`, `open`, `paused`, `closed`), `startsAt` y `endsAt`.
- `enteredCount` conserva las personas autorizadas que ya se registraron; `insideCount` representa cuántas permanecen dentro.
- Los movimientos guardan `movementType` (`ENTRY`, `EXIT`, `REENTRY`), `insideAfter`, puerta, operador y dispositivo.
- `doorSessions` mantiene presencia, último movimiento y conexión de cada dispositivo operativo.
- `familyHistory` conserva en forma inmutable las uniones y separaciones de familias.
- Los respaldos con SHA-256 usan el esquema 3 e incluyen el historial familiar, manteniendo compatibilidad con esquemas 1 y 2.
