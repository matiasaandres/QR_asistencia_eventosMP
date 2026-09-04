# Guía de Uso y Despliegue Gratuito: MundoPalabra Acceso

Esta guía explica cómo utilizar y desplegar la aplicación **MundoPalabra Acceso** de forma **100% gratuita** para el control de acceso con códigos QR en eventos escolares.

---

## 1. Probar la aplicación en tu computador o celular de inmediato

El servidor ya está ejecutándose localmente:
* **En tu computador:** Abre [http://localhost:5173](http://localhost:5173) en tu navegador.
* **En tu celular (mismo Wi-Fi):** Abre la dirección de red que aparece en la consola (ej: `http://192.168.18.84:5173/`).

> [!TIP]
> La aplicación ya incluye **15 estudiantes de prueba** (incluyendo a *Martina Pérez* de Kínder A) para que pruebes los flujos de escaneo, cupos parciales, búsqueda manual y el panel en vivo.

---

## 2. Flujo de Trabajo en el Evento

### Paso A: Generar las Tarjetas QR para las Familias
1. Ingresa a la pestaña **Estudiantes y Credenciales**.
2. Puedes usar los estudiantes precargados o presionar **"Importar Excel / CSV"** para subir la lista oficial del colegio.
3. Presiona **"Imprimir Tarjetas QR"**:
   * Puedes presionar **"Imprimir Tarjetas (PDF)"** para generar hojas listas para recortar en tamaño Carta o A4.
   * O puedes abrir un estudiante específico y hacer clic en **"Descargar Imagen PNG"** para enviarle el QR directamente al apoderado por WhatsApp o correo.
   * *El código QR contiene únicamente el identificador interno del estudiante (ej: `MP-2026-001`), protegiendo su RUT y datos privados.*

### Paso B: Escaneo en Portería (Uno o más celulares)
1. El personal en puerta ingresa a la pestaña **Escanear QR**.
2. En la barra superior, cada encargado puede seleccionar su punto de acceso (ej: *"Acceso Básica"*, *"Acceso Prebásica"* o *"Acceso Principal"*).
3. Al apuntar la cámara al QR de la credencial:
   * Suena un pitido y se abre automáticamente el panel de ingreso.
   * Si quedan cupos, la pantalla se muestra **verde ("ACCESO DISPONIBLE")**, mostrando los cupos disponibles.
   * El portero solo presiona el botón de la cantidad de personas que entran en ese instante: `[1]`, `[2]`, `[3]`, etc.
   * Si una familia de 5 personas ya completó su cupo, la pantalla aparece **roja ("CUPO COMPLETO")** y emite un tono de advertencia, bloqueando ingresos adicionales.

### Paso C: Si la familia olvidó su código QR
1. El personal hace clic en la pestaña **Buscar Estudiante**.
2. Escribe las primeras letras del nombre, apellido o curso.
3. Presiona **"Registrar Ingreso"** y opera con los mismos botones de cupos.

### Paso D: Monitor en Tiempo Real y Reporte para Dirección
1. En la pestaña **Panel en Vivo**, la coordinación del colegio visualiza en pantalla grande:
   * Total de estudiantes.
   * Familias que ya ingresaron vs. pendientes.
   * Total acumulado de personas en el recinto.
   * Porcentaje de asistencia por curso.
   * Bitácora en vivo de los últimos ingresos.
2. Al finalizar el acto, se presiona **"Descargar Planilla Excel"**, generando un archivo `.xlsx` con:
   * Resumen por estudiante.
   * Historial cronológico con hora y puerta de cada ingreso.
   * Estadísticas de asistencia por curso.

---

## 3. Conectar Firebase para Sincronizar Múltiples Celulares (100% Gratis)

Para que dos o más celulares en puertas diferentes trabajen sobre la misma base de datos en tiempo real (y se sincronicen en menos de 1 segundo sin duplicar cupos), utiliza **Firebase Firestore**:

1. Ingresa a [https://console.firebase.google.com](https://console.firebase.google.com) con una cuenta de Google y presiona **"Crear un proyecto"**.
2. Asígnale un nombre (ej: `mundopalabra-acceso`) y desactiva Google Analytics (no es necesario).
3. En el menú izquierdo, ve a **Compilación > Firestore Database**:
   * Presiona **Crear base de datos**.
   * Ubicación: Elige `nam5 (us-central)` o la más cercana.
   * Reglas de seguridad: Selecciona **Modo de prueba** (permite lectura y escritura inmediata para el evento).
4. En el panel principal del proyecto, presiona el icono de Web **`</>`** para registrar una aplicación web:
   * Ponle de nombre `MundoPalabra Web`.
   * Copia el objeto `firebaseConfig` que aparece en pantalla:
     ```javascript
     const firebaseConfig = {
       apiKey: "AIzaSy...",
       authDomain: "mundopalabra-acceso.firebaseapp.com",
       projectId: "mundopalabra-acceso",
       storageBucket: "mundopalabra-acceso.firebasestorage.app",
       messagingSenderId: "...",
       appId: "..."
     };
     ```
5. En la app MundoPalabra Acceso, haz clic en el icono de **Ajustes (⚙️)** en la barra superior:
   * Pega este código en el cuadro de Firebase.
   * Presiona **"Guardar y Conectar Firebase"**.
6. ¡Listo! La barra superior cambiará a **"En vivo (Cloud)"** y todos los dispositivos conectados compartirán la misma base de datos en tiempo real.

---

## 4. Opciones para Publicar la Web App Gratis en Internet

Para que los porteros puedan abrir la app desde cualquier lugar con su conexión móvil (4G/5G) y para que los navegadores móviles habiliten la cámara sin restricciones, la web debe servirse por **HTTPS**. Tienes dos excelentes opciones 100% gratuitas:

### Opción A: Vercel (La más rápida y sencilla - 2 minutos)
1. Instala Vercel CLI o sube la carpeta a GitHub.
2. Si tienes Node.js, simplemente ejecuta en esta carpeta:
   ```bash
   npx vercel
   ```
3. Sigue los pasos en pantalla (presiona Enter a todo) y Vercel te entregará una URL HTTPS gratuita y permanente (ej: `https://mundopalabra-acceso.vercel.app`).
4. Comparte ese enlace por WhatsApp a los profesores o encargados de puerta.

### Opción B: Firebase Hosting (Todo integrado con Google)
1. En la consola de tu proyecto Firebase, ve a **Hosting** y presiona comenzar.
2. Ejecuta en esta carpeta:
   ```bash
   npx firebase-tools login
   npx firebase-tools init hosting
   # Selecciona carpeta pública: dist
   # Configurar como SPA: Yes
   npm run build
   npx firebase-tools deploy --only hosting
   ```
3. Tu app quedará disponible en `https://mundopalabra-acceso.web.app`.

---

## 5. Comandos útiles en el computador

* Iniciar la aplicación para pruebas:
  ```bash
  npm run dev
  ```
* Compilar la aplicación para producción:
  ```bash
  npm run build
  ```
