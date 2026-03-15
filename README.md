# CalculaCuentas 📱💸

CalculaCuentas es una aplicación móvil moderna, diseñada para dispositivos Android y entornos Web, que revoluciona la forma en que divides la cuenta de un restaurante, pub o bar con tus amigos. Gracias a la inteligencia artificial, elimina las matemáticas engorrosas y los cálculos injustos al permitir leer tu boleta directamente con la cámara.

![CalculaCuentas](/assets/neon-dark-theme-preview.png) *(Imagina un diseño oscuro, elegante y con toques en verde neón vibrante)*

## ✨ Funcionalidades Principales

CalculaCuentas funciona a través de un flujo intuitivo de 6 pasos:

1. 👥 **Registro de Asistentes**: Antes de empezar, ingresa rápidamente los nombres de todas las personas que compartirán la cuenta.
2. 📸 **Escáner Inteligente (OCR)**: Usa la cámara de tu teléfono para fotografiar la boleta. La aplicación la analizará en segundo plano extrayendo los productos y sus precios usando Inteligencia Artificial.
3. ✏️ **Validación Manual**: Repasa lo que leyó la IA. Si la boleta estaba arrugada y un precio se leyó mal, puedes modificarlo, eliminar ítems incorrectos, o agregar productos manualmente si prefieres no usar la cámara.
4. 🏷️ **Asignación Justa**: El corazón de la app. Para cada producto en la boleta, selecciona (con botones fáciles de tocar) qué personas lo consumieron. ¡El costo de ese ítem se dividirá *únicamente* entre los seleccionados!
5. 💰 **Gestión de Propinas**: Selecciona ágilmente una propina sugerida (10%, 15%, 20%) o ingresa un monto personalizado.
6. 📊 **Resumen y División Perfecta**: La aplicación hace la magia matemática:
   - Cobra a cada persona sus consumos individuales compartidos.
   - Si hubo montos en la cuenta que no se asignaron a nadie (ej. cargos por servicio "huérfanos"), se dividen matemáticamente por igual entre toda la mesa.
   - Aplica el costo de la propina de manera ponderada (el que gastó más, aporta más propina proporcionalmente).

## 🛠️ Tecnologías Utilizadas

La aplicación está construida utilizando una arquitectura híbrida moderna que prioriza el rendimiento web empaquetado como aplicación nativa.

### Frontend (Web)
* **[React 19](https://react.dev/)**: Librería principal para construir la interfaz de usuario de manera declarativa y reactiva mediante Hooks (`useState`, `useEffect`, `useRef`).
* **[Vite](https://vitejs.dev/)**: Entorno de desarrollo ultrarrápido y empaquetador de módulos de última generación.
* **Vanilla CSS (`index.css`)**: Estilos nativos personalizados implementando variables CSS para un tema oscuro dinámico (`Dark Mode`) y prevención de tirones (`pull-to-refresh`) logrando la experiencia auténtica de una app móvil.

### Inteligencia Artificial (OCR)
* **[Tesseract.js](https://tesseract.projectnaptha.com/)**: Motor de reconocimiento óptico de caracteres (OCR) ejecutado en WebAssembly. Permite leer los precios y productos de la boleta de manera local en el teléfono sin necesidad de consultar servidores externos. Se implementó una **optimización de Web Workers persistentes** que carga el motor en segundo plano durante el paso 1, eliminando los tiempos de carga al escanear.

### Capa Nativa (Mobile Wrapper)
* **[Capacitor](https://capacitorjs.com/)**: Framework Cross-Platform de Ionic que empaqueta la aplicación web (HTML/CSS/JS) en un binario nativo (Android/iOS).
* **`@capacitor/camera`**: Plugin oficial para interactuar con el hardware de la cámara del dispositivo móvil o la galería nativa de imágenes.

## 🚀 Instalación y Ejecución

Si deseas clonar y correr este proyecto de manera local para desarrollo:

### 1. Clonar el proyecto y descargar dependencias
```bash
git clone https://github.com/tu-usuario/calculacuentas.git
cd calculacuentas
npm install
```

### 2. Levantar servidor Web de Desarrollo
Puedes probar la app, el diseño y la cámara (desde un input de archivos como `fallback`) directamente en tu navegador web:
```bash
npm run dev
```

### 3. Compilar para Android vía Capacitor
Si deseas ver la aplicación corriendo en un emulador de Android o compilar el APK en tu teléfono:
```bash
# Construye el empaquetado web en la carpeta /dist
npm run build

# Sincroniza la carpeta web /dist con la carpeta /android nativa
npx cap sync

# Abre el proyecto nativo en Android Studio para ejecutar en emulador/dispositivo
npx cap open android
```

---
*Hecho con 💚 usando React + Vite + Capacitor.*
