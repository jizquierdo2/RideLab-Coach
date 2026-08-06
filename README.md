# RideLab Coach

App Android para conversar con un coach de IA sobre tus métricas Garmin, pedirle
planes de entrenamiento y registrar lo que realmente hiciste.

Dos secciones, nada más: **Chat** y **Entrenamiento**.

---

## Qué funciona de verdad y qué está simulado

Esta es la parte importante. Nada aquí está marcado como terminado si todavía
usa datos simulados.

| Pieza | Estado | Detalle |
|---|---|---|
| App Android (Expo + Expo Router) | ✅ **Funciona** | Bundle Android generado y verificado. Flujo completo recorrido en navegador. |
| Chat con conclusión, chips, interpretación y recomendación | ✅ **Funciona** | Sobre el coach simulado y sobre OpenAI real. |
| Generación estructurada de planes (`propose_training_plan`) | ✅ **Funciona** | Validada con Zod; un plan inválido no se guarda. Probada también con OpenAI real. |
| Sección Entrenamiento, detalle de sesión, técnica y videos | ✅ **Funciona** | 22 videos verificados uno por uno. |
| Registro de sesiones y persistencia local | ✅ **Funciona** | AsyncStorage; sobrevive al cierre de la app. |
| Backend Node/TS con allowlist de lectura | ✅ **Funciona** | 48 tests. |
| **Métricas Garmin reales** | ✅ **Funciona** | Verificado el 2026-08-05 contra una cuenta real (Fenix 7 Pro Solar): login desde la app, `dataSource: "garmin-mcp"`, sueño/HRV/Body Battery/Training Readiness/Training Status/Estrés/Actividades todos con datos reales y `unavailableMetrics: []`. El backend reconecta solo al reiniciar, usando lo guardado en `.env`. |
| **Coach con OpenAI** | ✅ **Funciona** | Verificado el 2026-08-05 contra la API real (`gpt-4o`): respuesta de análisis con `report_metrics` sobre datos reales de Garmin, y generación de plan con `propose_training_plan` usando exclusivamente `catalogExerciseId` válidos del catálogo. Probado con dos prompts (recuperación y creación de plan); no es cobertura exhaustiva de todos los casos. |
| **Agente remoto (`AGENT_ENDPOINT`)** | ⚠️ **Sin probar** | `RemoteAgentGateway` implementado, sin endpoint contra el cual verificarlo. |

Mientras `MOCK_MODE=true`, la app declara en todas partes
**“Datos de demostración — Garmin aún no está conectado”**. No hay ningún camino
por el que un dato simulado se presente como real.

Puedes comprobar en cualquier momento qué está corriendo:

```bash
curl -s localhost:8787/api/health
```

Devuelve qué proveedor y qué agente están activos, y qué falta para usar datos
reales (`blockers`).

---

## Arranque rápido (modo demo, sin ninguna credencial)

Necesitas Node 20+ y un teléfono Android con **Expo Go**, o un emulador.

```bash
cd ~/Documents/GitHub/ridelab-coach && npm install && npm run build:shared
```

Terminal 1 — backend:

```bash
npm run server
```

Terminal 2 — app:

```bash
npm run android
```

Si no tienes emulador, corre `npm run mobile` y escanea el QR con Expo Go desde
tu teléfono. El teléfono y el computador deben estar en la misma red Wi-Fi.

### Versión de Expo

El proyecto está en **Expo SDK 56** a propósito. Expo publica un Expo Go
distinto por cada SDK, y Play Store va con retraso respecto del último SDK
publicado. Estar en 56 significa que el Expo Go que instalas desde la tienda
funciona sin sideload.

Si algún día subes el SDK, comprueba antes qué versión de Expo Go sirve la
tienda: un proyecto más nuevo que Expo Go da el error *"la versión de Expo Go no
es compatible"*, aunque la tengas al día.

### Si Expo Go dice "Something went wrong"

Casi siempre es la IP. Tu router asigna la dirección por DHCP y cambia al
reconectar el Wi-Fi, dejando el QR anterior apuntando a la nada.

```bash
ipconfig getifaddr en0
```

Metro tiene que anunciar esa IP, no `127.0.0.1`. Por eso se levanta con
`--host lan`:

```bash
npx expo start --port 8081 --host lan
```

Para comprobar qué está anunciando:

```bash
curl -s -H "expo-platform: android" -H "Accept: multipart/mixed" http://TU.IP:8081/ | grep -o 'http://[0-9.]*:8081[^"]*bundle'
```

Si te cambia la IP seguido, `npx expo start --tunnel` no depende de la red local.

### Si la app no encuentra el backend

En un teléfono físico, `localhost` es el teléfono. Apunta a la IP de tu
computador:

```bash
EXPO_PUBLIC_API_URL=http://TU.IP.LOCAL:8787 npm run android
```

Tu IP la sacas con `ipconfig getifaddr en0`.

---

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run server` | Backend en `localhost:8787` con recarga en caliente |
| `npm run android` | Abre la app en un emulador/dispositivo Android |
| `npm run mobile` | Metro con QR para Expo Go |
| `npm test` | Tests de `shared` y `server` |
| `npm run typecheck` | TypeScript en los tres paquetes |
| `npm run build:shared` | Compila `@ridelab/shared` (necesario para el backend) |

Tests de la app: `npm test --workspace @ridelab/mobile`.

---

## Activar Garmin y el agente reales

### Garmin: se conecta desde la app, no a mano

1. Copia `.env.example` a `apps/server/.env`, deja `GARMIN_EMAIL`/`GARMIN_PASSWORD`
   en blanco, y pon `MOCK_MODE=false`.
2. Reinicia el backend y la app.
3. En el Chat, toca el estado de Garmin (arriba a la derecha) → se abre la
   pantalla de conexión → ingresa tu usuario y contraseña de Garmin Connect →
   **Conectar**.
4. Si funciona, el backend escribe `GARMIN_EMAIL`/`GARMIN_PASSWORD` en
   `apps/server/.env` solo, para que un reinicio del backend reconecte sin
   volver a pedir la contraseña. Tocar **Desconectar** en esa misma pantalla
   revierte a modo demo y borra esas dos variables de `.env`.

**Importante — verificación en dos pasos (MFA):** el paquete que usamos por
detrás (`@nicolasvegam/garmin-connect-mcp`) **no distingue contraseña
incorrecta de MFA** — ambos casos dan el mismo error genérico. Si tu cuenta de
Garmin tiene 2FA activado, este login **no puede completarse**; no es un bug
de esta integración, es una limitación real del paquete (verificado leyendo su
código fuente). La única salida es desactivar el MFA en Garmin Connect si
quieres usar esta vía.

La contraseña nunca la ve la app más allá del formulario: viaja una sola vez
al backend propio, nunca se guarda en el teléfono (ni AsyncStorage ni
SecureStore), y nunca se envía a Garmin directamente desde el celular.

| Variable | Para qué | Obligatoria |
|---|---|---|
| `MOCK_MODE` | `false` para intentar datos reales | Sí |
| `OPENAI_API_KEY` | Coach sobre OpenAI | Sí, salvo que uses `AGENT_ENDPOINT` |
| `OPENAI_MODEL` | Modelo a usar (por defecto `gpt-4o`) | No |
| `AGENT_ENDPOINT` | Agente ya desplegado; tiene prioridad sobre OpenAI | No |
| `GARMIN_EMAIL` / `GARMIN_PASSWORD` | Credenciales de Garmin Connect | No a mano — se llenan solas tras conectar desde la app |

Endpoints nuevos: `POST /api/garmin/connect` (`{email, password}`, responde
200 y persiste en `.env` si el login funciona; 401 con mensaje honesto si
falla; 409 si `MOCK_MODE=true`) y `POST /api/garmin/disconnect` (vuelve a
modo demo y borra las credenciales guardadas).

### Seguridad de la integración

El backend sólo puede invocar herramientas de **lectura**, declaradas como
allowlist explícita en `apps/server/src/garmin/provider.ts`. Toda llamada pasa
por `assertReadOnlyTool()`. Las herramientas de escritura del MCP de Garmin
(`delete_activity`, `add_weigh_in`, `set_activity_name`, `set_hydration`,
`create_manual_activity`, `set_blood_pressure`, `add_gear_to_activity`,
`remove_gear_from_activity`) están fuera de alcance y hay tests que lo
comprueban.

---

## Arquitectura

```
ridelab-coach/
├─ packages/shared/          Tipos + schemas Zod + catálogo + datos demo
│  ├─ types/plan.ts          TrainingPlan y su validación
│  ├─ types/garmin.ts        Métricas y estado de conexión
│  ├─ types/log.ts           Registro de sesiones
│  ├─ catalog/exercises.ts   22 ejercicios con videos verificados
│  └─ agent/instructions.ts  Instrucciones base del coach
├─ apps/server/              Backend Node/TS (único que ve secretos)
│  ├─ garmin/provider.ts     Interfaz GarminDataProvider + allowlist
│  ├─ garmin/mock.ts         MockGarminDataProvider
│  ├─ garmin/mcp.ts          McpGarminDataProvider (stdio, verificado contra cuenta real)
│  ├─ garmin/auth-routes.ts  POST /api/garmin/connect y /disconnect
│  ├─ env-file.ts            Lee/escribe GARMIN_EMAIL/PASSWORD en .env
│  ├─ agent/gateway.ts       Interfaz AgentGateway
│  ├─ agent/mock.ts          Coach simulado
│  ├─ agent/openai.ts        Coach real (verificado contra la API)
│  └─ agent/endpoint.ts      Agente remoto (sin verificar)
└─ apps/mobile/              App Expo
   ├─ app/(tabs)/            Chat y Entrenamiento
   ├─ app/session/[id].tsx   Detalle de sesión y registro
   ├─ app/exercise/[id].tsx  Ficha de técnica
   ├─ app/garmin-login.tsx   Conectar/desconectar Garmin
   └─ src/storage/           Repositorios sobre AsyncStorage
```

Cambiar de demo a real es cambiar qué implementación se inyecta en
`apps/server/src/factory.ts`. Nada más se toca.

### Cómo se evita que el agente invente cosas

- **Videos**: sólo puede elegir ejercicios del catálogo, por `catalogExerciseId`.
  El schema rechaza URLs que no sean `http(s)` a un recurso concreto y prohíbe
  enlaces a búsquedas. Un ejercicio sin video muestra “Video por agregar”.
- **Métricas**: el snapshot lleva `unavailableMetrics`. Lo que no está, se
  declara ausente en vez de estimarse.
- **Planes**: llegan por la tool `propose_training_plan` y pasan por
  `validateTrainingPlan` antes de persistirse. Nunca se reconstruye un plan
  leyendo Markdown.
- **Procedencia**: toda respuesta sobre tus datos declara periodo y fecha de
  última sincronización.

---

## Videos del catálogo

Los 22 videos fueron verificados contra la API oEmbed de YouTube el 2026-08-04:
se comprobó que cada video existe y que su título corresponde al ejercicio.
Las fuentes incluyen NASM, Squat University, E3 Rehab, ScottHermanFitness,
Physique Development y Runna.

Para reverificarlos más adelante, el criterio es simple: un `GET` a
`https://www.youtube.com/oembed?url=<url>&format=json` debe devolver 200 y un
título coherente. Si un video desaparece, borra su `videoUrl` del catálogo y la
app mostrará “Video por agregar” en vez de un enlace roto.

---

## Fuera del alcance de este MVP

Sin feed social, competencias, nutrición, pagos, suscripciones, marketplace de
entrenadores, otros wearables, panel web, notificaciones, gamificación,
estadísticas complejas ni multiusuario.
