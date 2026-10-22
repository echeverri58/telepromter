# 🎬 Teleprompter PWA

Teleprompter instalable para el móvil, hecho **solo con HTML, CSS y JavaScript vanilla**.
Activa la cámara a pantalla completa, superpone el guion con desplazamiento automático
y graba **vídeo con audio**: el texto **nunca** aparece en la grabación.

Sin frameworks, sin npm, sin paso de compilación. Listo para subir a GitHub Pages.

**Demo en vivo:** <https://echeverri58.github.io/telepromter/>

---

## 1. Qué hace

| Función | Detalle |
| --- | --- |
| Guion | Editor grande con autoguardado en `localStorage` y guion de bienvenida en el primer arranque |
| Cámara | `getUserMedia`, frontal/trasera, 1080p con *fallback* automático |
| Texto | Capa HTML sobre el vídeo, fondo ajustable, espejo y línea de lectura alta (16 % por defecto, junto a la cámara) |
| Scroll | Automático y suave con `requestAnimationFrame`; velocidad y tamaño en vivo |
| Grabación | `MediaRecorder` **sobre el MediaStream original** (cámara + micrófono) |
| Resultado | Vista previa, descarga (`teleprompter-AAAA-MM-DD-HHmm.mp4`), compartir |
| PWA | Instalable, offline con service worker, rutas relativas para GitHub Pages |

---

## 2. Estructura del proyecto

```
teleprompter/
├── index.html              # Las 3 pantallas (editor, cámara, vista previa) + sprite SVG
├── style.css               # Tema oscuro, mobile-first, safe-area y orientación
├── app.js                  # Cámara, scroll rAF, grabación, wake lock, service worker
├── manifest.webmanifest    # Manifiesto PWA (start_url y scope relativos)
├── sw.js                   # Service worker: precache + cache-first + limpieza
├── README.md               # Este archivo
├── deploy.ps1              # Publicar en un paso: versiona el SW + commit + push
├── .nojekyll               # Evita el procesado Jekyll de GitHub Pages
├── icons/
│   ├── icon.svg            # Icono vectorial (fuente del diseño)
│   ├── icon-180.png        # apple-touch-icon (iPhone/iPad)
│   ├── icon-192.png        # icono normal 192
│   ├── icon-512.png        # icono normal 512
│   ├── icon-maskable-192.png
│   └── icon-maskable-512.png
└── tools/
    └── make-icons.py       # Script que regenera los PNG con Pillow
```

> **Todas las rutas son relativas (`./`)**. La app funciona igual en
> `https://usuario.github.io/teleprompter/` que en la raíz de un dominio.

---

## 3. Cómo se consigue que el texto NO se grabe

Este es el punto clave del proyecto:

1. `getUserMedia({ video, audio })` devuelve un **`MediaStream`** con dos pistas:
   vídeo de la cámara y audio del micrófono.
2. Ese mismo stream se asigna a `video.srcObject` **solo para verlo** en pantalla.
3. `new MediaRecorder(stream)` graba **ese stream original**, del que se obtienen
   los fotogramas directamente, sin pasar por la pantalla ni por el DOM.
4. El guion es un `<div>` posicionado encima del `<video>`. Es una capa de la
   interfaz que el navegador compone **después** de la captura: no existe en el
   stream, así que es imposible que acabe en el archivo.

En el código **no hay ni un `<canvas>`**, ni `captureStream()` de canvas, ni
`getDisplayMedia()`. Esas son las tres únicas formas de que un texto se colara
en un vídeo, y aquí no se usa ninguna. El comentario completo está al principio
de [`app.js`](app.js).

---

## 4. Cómo se usa

1. Escribe o pega el guion. Se guarda solo (verás «Guardado»).
   La **primera vez** que abres la app ya viene cargado un *guion de bienvenida*
   (sirve de demo y de mini-tutorial): edítalo o bórralo con **Borrar guion**.
   Una vez borrado ya no vuelve a aparecer. Para cambiar ese texto de fábrica,
   edita la constante `WELCOME_SCRIPT` en [`app.js`](app.js#L119-L135).
2. **Iniciar teleprompter** → acepta los permisos de cámara y micrófono.
3. Ajusta con los sliders:
   - **Velocidad**: 5 – 300 px/s (se aplica al instante).
   - **Tamaño**: 18 – 96 px (la posición de lectura se conserva).
   - **Fondo**: 0 – 90 % de opacidad del panel detrás del texto.
   - **Lectura**: 12 – 50 %, altura de la línea guía. Por defecto **16 %**, casi
     pegada a la cámara frontal: es la clave para que en el vídeo no se note que
     estás leyendo. Bájala más si tu cámara queda muy arriba; súbela si prefieres
     más texto a la vista.
   - **Avance**: **Continuo** (el texto se desliza suave) o **Por líneas**
     (queda inmóvil mientras lees y salta una línea de golpe cada intervalo).
     «Por líneas» es el modo que menos «barrido» produce en cámara: el ojo no
     recorre la pantalla.
4. Arriba a la derecha: **espejo** del texto (para *beam splitter*), **cambiar de
   cámara** y **pantalla completa**.
5. **Reiniciar** vuelve al principio · **Seguir/Pausa** mueve el texto sin grabar
   (modo ensayo) · el botón rojo **Grabar**.
6. Al pulsar Grabar: cuenta atrás de **3 segundos** y, al terminar, empiezan a la
   vez la grabación y el desplazamiento.
7. Al detener: vista previa con **Descargar**, **Compartir** (si el móvil lo
   permite) y **Grabar otra vez**.

> **Consejo para que no se note que lees:** mantén la mirada *quieta* en la
> línea guía (no sigas las palabras con los ojos) y colócala lo más cerca
> posible del objetivo de la cámara. El texto siempre sube: es la única
> dirección en la que las líneas llegan en orden de lectura. Con «Lectura»
> cambias **dónde lees**, no el sentido del desplazamiento.

**Gestos y atajos**

- Toca la pantalla (sin arrastrar) → oculta/muestra los controles.
- Arrastra el texto con el dedo → lo colocas donde quieras (el scroll se pausa solo).
- Escritorio: `Espacio` play/pausa · `R` grabar · `M` espejo · `F` pantalla completa ·
  `H` ocultar controles · `↑``↓` velocidad · `Esc` volver.

---

## 5. Publicar en GitHub Pages

### 5.1 Crear el repositorio y subir los archivos

**Opción A — desde la web de GitHub**

1. Entra en <https://github.com/new>.
2. Nombre: `teleprompter` (o el que quieras). Visibilidad **Public** (Pages gratis
   también funciona en repos públicos; en privado necesitas plan de pago).
3. No añadas README ni licencia (ya los tienes).
4. En el repo: **Add file → Upload files**, arrastra **todos** los archivos y
   carpetas del proyecto (`index.html`, `style.css`, `app.js`, `sw.js`,
   `manifest.webmanifest`, `README.md`, `.nojekyll`, `icons/`, `tools/`).
   ⚠️ Arrastra la **carpeta `icons`** completa, no solo su contenido.
5. **Commit changes**.

**Opción B — con Git en tu ordenador**

```bash
cd teleprompter
git init
git add .
git commit -m "Teleprompter PWA"
git branch -M main
git remote add origin https://github.com/USUARIO/teleprompter.git
git push -u origin main
```

### 5.2 Activar GitHub Pages

1. En el repositorio: **Settings** (⚙️) → **Pages** (menú lateral izquierdo).
2. **Source**: `Deploy from a branch`.
3. **Branch**: `main` · carpeta **`/ (root)`** → **Save**.
4. Espera 1–2 minutos y recarga: aparecerá
   `https://USUARIO.github.io/teleprompter/`.

Si aparece un 404 al principio, espera un poco más y recarga sin caché.

### 5.3 Abrir en el móvil

Abre `https://USUARIO.github.io/teleprompter/` en el navegador del teléfono.
Debe ser **HTTPS**: GitHub Pages ya lo activa solo, y sin HTTPS el navegador no
permite usar la cámara.

### 5.4 Instalar como app

**Android (Chrome / Edge / Samsung Internet)**

1. Abre la URL.
2. Menú **⋮** → **Instalar app** (o **Añadir a pantalla de inicio**).
3. Confirma. Se abre a pantalla completa, con su propio icono y sin barra de
   direcciones. También aparece el botón **Instalar app** dentro de la app.

**iPhone / iPad (Safari)**

1. Abre la URL **en Safari** (no en Chrome: iOS solo instala webs desde Safari).
2. Botón **Compartir** (□↑) → **Añadir a pantalla de inicio**.
3. Confirma. Se abre como app y usa el `apple-touch-icon`.

> En iPhone, la cámara solo se activa a pantalla completa la primera vez que
> aceptas el permiso; si la app pasa a segundo plano, iOS detiene la cámara.

---

## 6. Probar en local

La cámara necesita un **contexto seguro**: `https://` o `http://localhost`.
Abre la carpeta y sirve los archivos con cualquier servidor estático:

```bash
# Python (ya instalado en macOS/Linux; en Windows: py -m http.server 8000)
python -m http.server 8000
# luego abre http://localhost:8000
```

Con `http://192.168.x.x:8000` desde el móvil **no** funcionará la cámara:
usa HTTPS (por ejemplo, la propia URL de GitHub Pages) o un túnel HTTPS.

---

## 7. Iconos: cómo se generan

Ya vienen incluidos (`icons/icon-180.png`, `192`, `512`, `maskable-192`, `maskable-512`).
Si quieres cambiarlos:

### Opción A — regenerarlos con el script incluido

Requisitos: Python 3 y Pillow.

```bash
pip install pillow
python tools/make-icons.py
```

El script dibuja el icono a 4× y lo reduce para que los bordes queden suaves.
Para cambiar colores o formas, edita las constantes del principio de
[`tools/make-icons.py`](tools/make-icons.py):

```python
BG_TOP    = (27, 39, 53)     # fondo (arriba)
BG_BOTTOM = (7, 10, 15)      # fondo (abajo)
SCREEN    = (244, 248, 253)  # pantalla
INK       = (16, 24, 34)     # renglones
ACCENT    = (255, 59, 48)    # renglón central (rojo)
```

### Opción B — a mano con cualquier editor

1. Crea un SVG cuadrado de 512 × 512 con el diseño (puedes partir de
   [`icons/icon.svg`](icons/icon.svg), que es el original de este proyecto).
2. Expórtalo a PNG en 192 × 192, 512 × 512 y 180 × 180 (apple-touch-icon).
3. Para el **maskable**, deja **todo el fondo opaco** y mantén el símbolo dentro
   del **círculo central del 80 %** (aproximadamente el 60–66 % del ancho total),
   porque Android recorta el icono con distintas formas.
4. Guarda los PNG en `icons/` con los mismos nombres.

### Opción C — generador online

<https://www.pwabuilder.com/imageGenerator> (sube un PNG de 512 × 512 y descarga
el paquete de iconos). Renombra los archivos a los nombres de la carpeta `icons/`.

---

## 8. Limitaciones conocidas por plataforma y cómo se resolvieron

| Plataforma | Limitación | Solución aplicada |
| --- | --- | --- |
| **iOS Safari** | `MediaRecorder` solo desde iOS 14.3 y graba **MP4/H.264**, no WebM | Se prueba `video/mp4` **primero** con `isTypeSupported`; el archivo sale `.mp4` y se guarda en Fotos/Archivos |
| **iOS Safari** | Antes de iOS 13, el atributo `download` con `blob:` no descarga | Se comprueba `'download' in a`; si no existe, se abre el blob en una pestaña. Además hay botón **Compartir** (`navigator.share` con `File`) |
| **iOS Safari** | `wakeLock` solo desde iOS 16.4 | `try/catch` y comprobación de existencia: si no está, la app funciona igual |
| **iOS Safari** | No hay `requestFullscreen` en iPhone | Botón de pantalla completa oculto automáticamente; la app ya ocupa el 100 % de la pantalla |
| **iOS Safari** | En modo *standalone* el vídeo requiere `playsinline` | `<video autoplay muted playsinline>` + `video.play()` con `catch` y toque de respaldo |
| **iOS / Android** | Algunos móviles no aceptan 1080p (sobre todo cámara frontal) | Cadena de *fallbacks*: 1080p → 720p → `facingMode` → `video: true`. El bitrate se ajusta a la resolución real |
| **Chrome Android** | Puede no soportar MP4 en versiones antiguas | Cadena MP4 → WebM VP9 → VP8 → WebM genérico → formato por defecto del navegador |
| **Android (galería)** | Algunos reproductores no abren WebM | Se prioriza siempre MP4 cuando el navegador lo soporta y el nombre del archivo lleva la extensión correcta |
| **Todos** | Si otra app usa el micrófono, `getUserMedia` falla | Se reintenta **sin audio**, se graba vídeo mudo y se avisa con un mensaje |
| **Todos** | Permiso denegado / cámara ocupada / sin cámara | Mensajes en español y específicos (`NotAllowedError`, `NotReadableError`, `NotFoundError`…) con botón **Reintentar** |
| **Todos** | `http://` no permite cámara | Aviso de contexto no seguro antes de pedir permisos (el service worker tampoco se registra) |
| **Service worker** | No puede interceptar el stream de la cámara | No hace falta: `MediaStream` no es una petición HTTP. Se ignoran `blob:`, `data:` y cualquier origen externo |
| **Service worker** | Caché antigua tras actualizar | Nombre de caché versionado (`teleprompter-1.3.0`) y borrado de versiones anteriores al activarse |

---

## 9. Actualizar la app publicada

### 9.1 Lo rápido: el script `deploy.ps1`

En Windows, desde la carpeta del proyecto:

```powershell
.\deploy.ps1
# o con un mensaje propio:
.\deploy.ps1 -Message "Arreglo la velocidad del scroll"
# solo commit, sin subir:
.\deploy.ps1 -NoPush
```

Qué hace [`deploy.ps1`](deploy.ps1):

1. Lista los cambios pendientes y comprueba que estás en un repo con remoto.
2. Si ha cambiado algo que el service worker precachea (`index.html`,
   `style.css`, `app.js`, `manifest.webmanifest` o `icons/`) **sube solo** el
   número de `VERSION` en [`sw.js`](sw.js) (1.3.0 → 1.3.1). Si solo tocas el
   README o el propio script, **no** toca la versión.
3. Hace `git add -A` + commit y `git push` a `origin`.
4. Te dice la URL de GitHub Pages y recuerda que tarda 1–2 minutos en reflejarse.

Si PowerShell no deja ejecutarlo:

```powershell
powershell -ExecutionPolicy Bypass -File .\deploy.ps1
```

> Si el `push` falla por credenciales, abre Git Bash o el *Git Credential
> Manager* una vez (`git push` a mano) y luego el script funcionará solo.

### 9.2 A mano

Cuando cambies `index.html`, `style.css`, `app.js` o los iconos:

1. Sube los archivos (`git add . && git commit -m "..." && git push`).
2. **Sube el número de versión** en [`sw.js`](sw.js):
   ```js
   const VERSION = '1.3.1';  // antes 1.3.0
   ```
3. Espera 1–2 minutos. La próxima vez que abras la app, el service worker nuevo
   se instala, borra la caché vieja y sirve la versión actualizada.
   Si no lo ves, cierra la app del todo y vuelve a abrirla (o desinstálala y
   reinstálala).

---

## 10. Cómo comprobar que todo funciona

- [ ] **El texto no se graba**: graba 5 s con el guion en pantalla y reproduce el
      vídeo → solo se ve la cámara, sin texto.
- [ ] **Velocidad**: mueve el slider mientras grabas → el texto acelera/frena en vivo
      (el vídeo no cambia).
- [ ] **Tamaño y fondo**: cambian al instante sin cortar la grabación.
- [ ] **Cuenta atrás**: 3, 2, 1 y empiezan a la vez el cronómetro y el scroll.
- [ ] **Temporizador** en `mm:ss` durante la grabación.
- [ ] **Descargar**: genera `teleprompter-AAAA-MM-DD-HHmm.mp4` (o `.webm`) y el
      archivo se reproduce bien, con audio.
- [ ] **Cámara**: el botón de cambiar de cámara alterna frontal/trasera y no se puede pulsar grabando.
- [ ] **Espejo**: el texto se voltea, el vídeo grabado **no**.
- [ ] **Offline**: instala la app, actívala sin datos y abre de nuevo → carga.
- [ ] **Rutas relativas**: la app funciona en `usuario.github.io/repo/`, no solo en `/`.
- [ ] **Rotación**: portrait y landscape sin cortar controles (safe-area respetada).

---

## 11. Créditos y licencia

Código original, sin dependencias ni librerías de terceros. Puedes usarlo,
modificarlo y publicarlo libremente citando el proyecto si te apetece.

Iconos y logo generados con [`tools/make-icons.py`](tools/make-icons.py).
