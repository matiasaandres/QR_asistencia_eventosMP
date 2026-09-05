# Auditoría técnica — MundoPalabra Acceso

Fecha: 4 de septiembre de 2026

## Resultado ejecutivo

- 32 pruebas automatizadas aprobadas.
- Compilación de producción aprobada.
- 251 estudiantes iniciales validados, sin identificadores duplicados.
- La auditoría no registró asistentes ni modificó datos de Firestore.

## Cobertura automatizada

- Login correcto e incorrecto.
- Sesión de exactamente cinco horas.
- Expiración, corrupción y cierre de sesión.
- Presencia y deduplicación de Puerta 1 y Puerta 2.
- Capacidad normal, ingreso parcial y cupo completo.
- Rechazo de cantidades inválidas o superiores al cupo.
- Un solo cupo extraordinario después de completar el cupo normal.
- Nombre y parentesco obligatorios para la persona extraordinaria.
- Rechazo de cupos extraordinarios anticipados, repetidos o para retirados.
- Simulación de dos intentos concurrentes de cupo extraordinario.
- Reinicio de contador y eliminación de los datos extraordinarios.
- Contratos de interfaz para confirmación y formulario extraordinario.
- Controles estructurales de las reglas de Firestore.
- Generación vectorial no vacía de los 251 códigos QR.
- Diseño paginable para imprimir seis credenciales por hoja A4.
- Botón explícito para descargar todos los códigos QR en PDF.
- ZIP con un PDF A4 de una sola página por alumno, agrupado en 15 carpetas de curso.
- Nombres de archivo seguros con el formato `Alumno - Curso.pdf`.

## Falla encontrada y corregida localmente

Las pantallas de búsqueda, nómina y credenciales interpretaban `maxCapacity: 0`
como cinco cupos. Esto hacía que alumnos retirados aparecieran visualmente como
habilitados. Se centralizó el cálculo de capacidad y se agregó una prueba de
regresión que exige conservar el valor cero.

También se corrigió la importación de planillas para conservar capacidades en
cero y asignar estado `RETIRADO` a esos registros.

La impresión masiva dibujaba los códigos en elementos `canvas` asíncronos. En
documentos extensos el navegador podía enviar a PDF las tarjetas antes de que
todos los lienzos estuvieran rasterizados, dejando códigos vacíos después de la
primera página. Los 251 códigos ahora se generan de forma síncrona como SVG
vectorial y el contenedor de impresión usa flujo estático paginado.

## Riesgos pendientes

### Alto — El login no protege Firestore

El login solicitado funciona completamente en el navegador y sus credenciales
forman parte del código público. Las reglas actuales de Firestore tampoco exigen
Firebase Authentication. Una persona con conocimientos técnicos podría omitir la
pantalla de login y llamar directamente a Firestore mientras el evento esté
abierto. Esto incluye leer la nómina, crear registros permitidos por las reglas y
eliminar entradas de la bitácora.

Recomendación: migrar a Firebase Authentication y exigir un usuario autenticado
con rol de portería o administrador en las reglas.

### Medio — Fecha de cierre operacional

Las reglas dejan de aceptar lecturas y escrituras el 1 de octubre de 2026. Después
de esa fecha la aplicación mostrará un error de sincronización hasta que se
publique una nueva ventana o una política distinta.

### Bajo — Tamaño del paquete

El JavaScript generado pesa aproximadamente 1,55 MB antes de compresión. La
compilación es correcta, pero Vite recomienda dividir el paquete para mejorar la
carga en teléfonos lentos.

## Límites de esta auditoría

- Las reglas de Firestore se comprobaron estructuralmente; no se levantó un
  emulador de Firebase para ejecutar permisos contra una base aislada.
- No se probaron cámaras físicas ni distintos modelos de teléfono.
- No se ejecutaron registros reales para evitar alterar la asistencia del evento.

## Comandos

```text
node --test tests/*.test.mjs
node node_modules/vite/bin/vite.js build
```
