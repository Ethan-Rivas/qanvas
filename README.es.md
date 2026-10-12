# Qanvas

[![CI](https://github.com/Ethan-Rivas/qanvas/actions/workflows/ci.yml/badge.svg)](https://github.com/Ethan-Rivas/qanvas/actions/workflows/ci.yml)
[![Licencia: MIT](https://img.shields.io/badge/licencia-MIT-blue.svg)](LICENSE)
![Funciona sin internet](https://img.shields.io/badge/funciona-sin%20internet-lightgrey.svg)

**Un constructor visual de circuitos cuánticos, amigable, que corre en tu navegador.** Arrastra compuertas a los qubits, ve los resultados en vivo, recorre el circuito paso a paso con explicaciones sencillas y copia código de Qiskit, Cirq, pyQuil u OpenQASM que funciona.

[Read in English](README.md)

![Qanvas mostrando un estado GHZ en el paso 2: la columna de la CNOT está resaltada, una explicación dice que q0 y q1 ahora están entrelazados, el histograma muestra 000 y 110 con 50 % cada uno, y la línea de Qiskit correspondiente está resaltada en el panel de código.](docs/images/qanvas-es.png)

Las herramientas visuales que los estudiantes conocen primero suelen verse anticuadas, y las más pulidas piden una cuenta y conexión. Qanvas está pensado primero para estudiantes y después para investigadores: sin cuenta, sin instalar nada, funciona sin internet, en español y en inglés. Es el constructor de circuitos de [quantum-lab](https://github.com/Ethan-Rivas/quantum-lab), y también funciona por su cuenta.

## Pruébalo

Abre **https://ethan-rivas.github.io/qanvas/** en un navegador reciente. Después de la primera visita funciona sin internet, y tu navegador puede instalarlo como app (en Chrome: el ícono de instalar en la barra de direcciones; en iPhone: Compartir → Agregar a inicio).

No se sube nada: el circuito se simula en tu propia computadora, y un enlace para compartir lleva todo el circuito adentro.

## Qué puedes hacer

- **Armar circuitos** de hasta 12 qubits: H, X, Y, Z, S, S†, T, T†, Rx, Ry, Rz y P con cualquier ángulo, CNOT, CZ, SWAP, Toffoli y medición. Arrastra desde la paleta, mueve, copia, borra, deshaz y rehaz.
- **Ver los resultados en vivo:** la probabilidad de cada resultado, las amplitudes y una esfera de Bloch por qubit, cuya flecha se acorta cuando el qubit está entrelazado.
- **Recorrer el circuito paso a paso** con el control deslizante. En el modo aprendizaje, una explicación corta en cada paso dice qué hizo la compuerta, con el estado de antes y de después.
- **Copiar código** en Qiskit, Cirq, pyQuil u OpenQASM 2.0, con la línea del paso actual resaltada.
- **Empezar con un ejemplo:** estado de Bell, GHZ, codificación superdensa, teletransportación cuántica, Deutsch–Jozsa y búsqueda de Grover, cada uno con un reto "Inténtalo".
- **Compartir** un enlace o guardar un archivo, y **abrir** un archivo o código OpenQASM 2.0.

Todo funciona también con el teclado: enfoca una compuerta, presiona **Espacio** para tomarla, muévete con las **flechas** y presiona **Espacio** para soltarla. **Ctrl/⌘ + Z** deshace, **Ctrl/⌘ + C** y **V** copian y pegan, y **Suprimir** borra la compuerta seleccionada.

Qanvas escribe los kets con q0 primero (a la izquierda), como Cirq y Quirk. Qiskit escribe q0 al final, así que `|110⟩` en Qanvas es `011` en los resultados de Qiskit. El código de Qiskit que exporta Qanvas te lo recuerda.

## Úsalo en quantum-lab

En [quantum-lab](https://github.com/Ethan-Rivas/quantum-lab/blob/main/README.es.md), `docker compose up` abre Qanvas junto a JupyterLab en **http://127.0.0.1:8080**. Arma un circuito, copia el código y pégalo en un notebook. [docs/quantum-lab.md](docs/quantum-lab.md) explica cómo está configurado allá (en inglés).

Para correr solo Qanvas con Docker:

```bash
docker run --rm -p 127.0.0.1:8080:8080 ghcr.io/ethan-rivas/qanvas:latest
```

## Córrelo desde el código fuente

Necesitas [Node.js](https://nodejs.org/) 22 o más reciente.

```bash
git clone https://github.com/Ethan-Rivas/qanvas.git
cd qanvas
npm install
npm run dev
```

Luego abre **http://localhost:5173**. El modo sin internet solo funciona en una copia compilada: `npm run build && npx vite preview`.

## Cómo se asegura que sea correcto

Cada resultado que muestra Qanvas se compara con Qiskit, para que puedas confiar en él.

- **Simulador:** `reference/generate.py` arma circuitos de prueba en Qiskit (cada compuerta en cada posición de qubit, cada ejemplo y 200 circuitos aleatorios de 1 a 12 qubits) y guarda sus estados finales exactos. Qanvas debe coincidir en cada amplitud con un margen de 1e-9. El script corre en la imagen de quantum-lab (`npm run reference`); los archivos de referencia nunca se editan a mano.
- **Código exportado:** `npm run test:export` corre el código de Qiskit, Cirq, pyQuil y OpenQASM que genera Qanvas para cada circuito de prueba, e importa el OpenQASM que escribe Qiskit. Cada estado final debe coincidir con el de Qanvas. Así se detectan los errores de orden de bits.
- **Interfaz:** las pruebas en el navegador cubren arrastrar con el mouse y con el teclado, el recorrido paso a paso, compartir, importar, el uso sin internet, pantallas de celular y revisiones automáticas de accesibilidad.

## Desarrollo

```bash
npm test             # pruebas unitarias y de referencia con Qiskit
npm run test:e2e     # pruebas en el navegador (Playwright)
npm run test:export  # corre el código exportado en la imagen de quantum-lab (necesita Docker)
npm run typecheck
npm run icons        # genera public/icons a partir de los tokens de diseño
```

`PLAN.md` es el plan del proyecto, `CLAUDE.md` las reglas del proyecto y `RELEASE.md` la lista para cada versión (en inglés). Cada etiqueta de versión publica el sitio en GitHub Pages y la imagen del servidor en `ghcr.io/ethan-rivas/qanvas`.

## Próximamente

- [ ] **0.2:** editar el código OpenQASM directamente; importar enlaces de Quirk; descargar el circuito como notebook, script de Python u OpenQASM; "Abrir en notebook" para mandarlo a JupyterLab; correr circuitos más grandes con Qiskit Aer e importar código de Qiskit a través de quantum-lab.
- [ ] **0.3:** modelos de ruido (despolarización, error de lectura) con una vista ideal contra ruidosa; medición a mitad del circuito.
- [ ] **0.4:** compuertas personalizadas y subcircuitos; lecciones que encadenan varios ejemplos.
- [ ] **0.5:** importar notebooks reales de Qiskit y elegir uno de sus circuitos, incluso los largos, con cientos de pasos.
- [ ] **Más adelante:** correr en hardware real de IBM a través de quantum-lab; colaboración.

## Contribuir

Las ideas, los reportes de errores y los pull requests son bienvenidos, sobre todo ejemplos nuevos y correcciones a las explicaciones en cualquiera de los dos idiomas. Antes de abrir un pull request, revisa que pasen `npm test` y `npm run test:e2e`.

## Licencia

[MIT](LICENSE)
