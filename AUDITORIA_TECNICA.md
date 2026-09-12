# Auditoría técnica — MundoPalabra Acceso

Fecha de actualización: 12 de septiembre de 2026
Versión auditada: 1.10.0

## Resultado ejecutivo

- 113 pruebas unitarias y de contrato aprobadas.
- 5 pruebas de reglas aprobadas contra el emulador oficial de Firestore.
- Compilación de producción aprobada.
- Auditoría npm sin vulnerabilidades conocidas.
- La aplicación usa Firebase Authentication, roles y aislamiento por organización.
- Las entradas, salidas y reingresos se registran mediante transacciones atómicas.

## Mejoras de seguridad incorporadas

- Separación explícita entre el portal escolar y el portal maestro, incluyendo el ingreso con Google.
- Configuración Firebase analizada como datos; nunca se ejecuta el texto pegado por el usuario.
- Content Security Policy y encabezados defensivos equivalentes en Firebase Hosting y Vercel.
- Caché Firestore en memoria y limpieza de datos locales sensibles al cerrar sesión en equipos compartidos.
- Integración opcional de Firebase App Check con reCAPTCHA Enterprise mediante `VITE_FIREBASE_APPCHECK_SITE_KEY`; la exigencia de tokens debe activarse en Firebase Console después de observar métricas.
- Respaldos nuevos firmados con HMAC-SHA-256 y clave privada no persistida.
- Reglas que toleran tokens sin Custom Claims y mantienen el aislamiento entre escuelas.
- Recuperación pública de QR retirada hasta disponer de un endpoint limitado y un segundo factor apropiado.

## Rendimiento

- El historial visible está paginado.
- La analítica usa documentos agregados por puerta y hora.
- Antes de reconstruir estadísticas se compara un conteo agregado; el historial completo solo se descarga cuando existe una desincronización o cambia la versión del esquema.
- Excel, PDF, ZIP y QR se cargan en paquetes separados bajo demanda.

Los paquetes de Excel y PDF continúan siendo grandes, pero ya no forman parte del paquete inicial. Para volúmenes masivos conviene trasladar exportaciones y respaldos a tareas de backend.

## Riesgos y trabajo de plataforma pendiente

1. Migrar definitivamente la cuenta maestra desde la compatibilidad por correo a Firebase Custom Claims y después retirar el correo heredado de `firestore.rules` y `organizationPolicy.js`.
2. Implementar recuperación de QR mediante backend, límites de intentos y un factor adicional que no sea solamente RUT y curso.
3. Trasladar agregados, respaldos y exportaciones muy grandes a Cloud Functions o Cloud Run cuando aumente el volumen.
4. Incorporar pruebas E2E en teléfonos reales para cámara, permisos, pérdida de red y operación simultánea de varias porterías.
5. Definir retención, eliminación y respuesta a incidentes para los datos personales escolares.

## Verificación

```text
npm test
npm run test:rules
npm run build
npm audit --audit-level=moderate
```
