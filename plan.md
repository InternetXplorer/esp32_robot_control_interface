# Android BLE Motor Controller PWA


## Context
Context about the current ESP32 firmware:

The ESP32-C6 currently exposes a custom BLE peripheral named BiMotor Car.
BLE is already working reliably: Android can connect with nRF Connect and write motor commands.
There is one custom GATT service with UUID 12345678-1234-5678-9abc-def012345678.
It exposes 2 writable/readable/notifiable characteristics:
left motor speed: 12345678-1234-5678-9abc-def012345679
right motor speed: 12345678-1234-5678-9abc-def012345680
Each characteristic expects a signed i16 value encoded in little-endian on 2 bytes.
Intended command range is -100..100.
0 = stop
positive = one direction
negative = the other direction
The firmware clamps out-of-range values to -100..100.
The motor control loop applies the latest BLE values every 10 ms.
On BLE disconnect, the firmware explicitly forces both motors to 0 for safety.
The real 128-bit service UUID is advertised over BLE; the device name is exposed as scan response data.
Hardware side:
left motor is currently the only one physically wired for testing
code is already written for both left and right motors
Motor control uses MCPWM on the ESP32-C6:
left motor uses 2 PWM outputs
right motor uses 2 PWM outputs
The current mobile workflow is only for testing/prototyping; I want a simpler user-facing controller UI, ideally with sliders or a joystick-like interface, that connects over BLE and writes these characteristic values.

## Summary
Build a dedicated `React + TypeScript + Vite` Progressive Web App for Android Chrome that connects to the ESP32-C6 over Web Bluetooth and provides two control modes from v1:
- a joystick mode for normal driving
- direct left/right sliders for debugging and calibration

The app is `frontend-only`: no backend, no account system, no cloud dependency. It will be served over `HTTPS` as a static site so it works with Web Bluetooth on Android Chrome. The codebase should be structured for rapid iteration as new controls, telemetry, presets, and safety features are added later.

## Key Decisions
- Stack: `Vite + React + TypeScript`
- State management: `Zustand`
- Styling: `CSS Modules` plus global design tokens in CSS variables
- PWA: `vite-plugin-pwa`
- BLE transport: native `Web Bluetooth API`, wrapped behind a local typed service layer
- Hosting for v1: static HTTPS deployment
- Initial control surface: `joystick + sliders + emergency stop`
- Browser target: `Android Chrome only`
- Non-goal for v1: iOS Safari support

## Public Interfaces And App Contracts
The implementation should treat these as stable internal contracts from day one.

### BLE constants
- Peripheral name hint: `BiMotor Car`
- Service UUID: `12345678-1234-5678-9abc-def012345678`
- Left characteristic UUID: `12345678-1234-5678-9abc-def012345679`
- Right characteristic UUID: `12345678-1234-5678-9abc-def012345680`

### Motor command model
Define a shared TypeScript model for all control code:
```ts
type MotorValue = number // integer, clamped to -100..100
type DriveCommand = {
  left: MotorValue
  right: MotorValue
}
```

### BLE write encoding
Every write must:
- encode one signed `i16`
- use `little-endian`
- clamp app-side to `-100..100` before writing
- round to integer before encoding

### UI-to-command transforms
Joystick mode:
- input axes normalized to `x` and `y` in `-1..1`
- compute `speed = -y * 100`
- compute `turn = x * 100`
- mix as:
  - `left = clamp(speed + turn, -100, 100)`
  - `right = clamp(speed - turn, -100, 100)`

Slider mode:
- left slider maps directly to left motor command
- right slider maps directly to right motor command

### BLE client interface
Wrap Web Bluetooth in a single service interface so the UI never calls browser BLE APIs directly:
```ts
interface BleMotorClient {
  isSupported(): boolean
  getAvailability(): Promise<boolean>
  requestAndConnect(): Promise<void>
  reconnectKnownDevice(): Promise<boolean>
  disconnect(): Promise<void>
  writeCommand(command: DriveCommand): Promise<void>
  emergencyStop(): Promise<void>
  onDisconnected(listener: () => void): () => void
}
```

## Application Structure
Use a small but explicit architecture.

### App layers
- `ui`: visual components, touch handling, status display
- `state`: app state, mode selection, current command, connection status
- `domain`: motor math, clamping, serialization helpers, rate limiting rules
- `ble`: Web Bluetooth device/session management and characteristic writes

### Suggested project layout
```txt
src/
  app/
  ble/
  domain/
  state/
  components/
  styles/
```

### Core modules
- `ble/constants.ts`
  - UUIDs and Bluetooth filters
- `ble/client.ts`
  - Web Bluetooth implementation of `BleMotorClient`
- `domain/motor.ts`
  - clamp, round, mix joystick axes into motor commands
- `domain/encode.ts`
  - `i16` little-endian conversion
- `domain/rateLimiter.ts`
  - coalesces frequent UI updates into controlled BLE writes
- `state/controllerStore.ts`
  - Zustand store for connection, mode, UI state, and latest command
- `components/JoystickPad.tsx`
  - touch-first control surface using Pointer Events
- `components/MotorSliders.tsx`
  - left/right slider mode
- `components/ConnectionPanel.tsx`
  - connect/disconnect/support/errors
- `components/StopButton.tsx`
  - large persistent emergency stop
- `components/StatusBar.tsx`
  - browser support, BLE state, active mode, command preview

## Feature Specification

### 1. Connection flow
The app starts disconnected and shows:
- connect button
- unsupported-browser warning if Web Bluetooth is unavailable
- short setup note: “Use Android Chrome over HTTPS”

Connect button behavior:
- triggered from a direct user gesture
- calls `navigator.bluetooth.requestDevice()`
- filter by service UUID
- optional name hint may be displayed in UI, but service filter is authoritative
- after selection, connect to GATT server
- fetch primary service
- fetch left and right characteristics
- register `gattserverdisconnected` listener
- transition app state to connected

Reconnect behavior:
- on load, call `navigator.bluetooth.getDevices()` if available
- if a previously granted device exists and is reachable, offer a `Reconnect` button
- if `getDevices()` is unavailable or empty, silently skip this path

Disconnect behavior:
- explicit disconnect button
- send stop command first if connected
- then disconnect GATT
- clear transient command state and return UI to neutral

Unexpected disconnect behavior:
- transition state to disconnected
- clear active pointer capture / active control session
- reset displayed command values to zero
- surface a non-blocking banner: “Device disconnected, motors forced to stop on firmware side”

### 2. Control modes
Ship both from v1 with a segmented toggle:
- `Drive` mode: joystick
- `Direct` mode: dual sliders

Mode switch rules:
- switching modes immediately sends `0/0`
- new mode starts in neutral state
- active touch/drag interaction is cancelled on mode change

### 3. Joystick control
Behavior:
- square control pad with circular visual thumb
- touch-first design using Pointer Events
- only one active pointer controls the joystick at a time
- pointer is captured on press and released on pointerup/pointercancel
- thumb returns to center on release
- app sends `0/0` immediately on release/cancel

Normalization:
- convert pointer position relative to pad center
- clamp to unit circle or bounded square with normalized output
- dead zone near center, default `5%`
- values outside dead zone scaled back to full range

Visual feedback:
- live left/right numeric output
- optional thin horizontal/vertical axes guides
- connection state indicator remains visible while driving

### 4. Slider control
Behavior:
- two large vertical sliders sized for thumb input
- labels: `Left`, `Right`
- value text shown above each slider
- center line clearly marked at `0`
- range `-100..100`, step `1`
- release behavior configurable in code, default:
  - if user stops dragging, value remains where placed
- stop button still overrides both to zero

Reason for this default:
- sliders are for direct debugging/testing, not normal driving
- joystick remains the safer spring-back control surface

### 5. Command send pipeline
The UI must not write directly on every movement event without control.

Pipeline:
- UI emits high-frequency desired command updates
- store keeps latest desired command
- rate limiter sends only latest command at fixed cadence
- default send interval: `50 ms` (`20 Hz`)
- if the desired command changes rapidly, intermediate states may be dropped and only latest command sent
- if the desired command becomes `0/0`, flush zero immediately instead of waiting for next tick

Write sequencing:
- write left and right characteristics sequentially in a consistent order
- default order: left then right
- if one write fails, surface connection error and transition to disconnected/recovery flow

Rationale:
- firmware updates every `10 ms`; `20 Hz` app writes are sufficient for manual control and reduce BLE spam
- implementation should keep the interval configurable for later tuning

### 6. Safety behavior
Mandatory safeguards:
- always render a prominent `STOP` button fixed near the bottom of the viewport
- pressing stop sends immediate `0` to both motors and resets active UI controls
- app sends `0/0` on:
  - joystick release
  - joystick cancel
  - mode switch
  - before explicit disconnect
  - page visibility loss
  - page unload or navigation away, best-effort only

Visibility behavior:
- on `document.visibilitychange`, if page becomes hidden and device is connected:
  - issue best-effort emergency stop
  - reset active interaction state

The firmware already stops motors on BLE disconnect; the web app should still stop proactively before relying on that safety net.

### 7. Browser and UX constraints
Support messaging:
- if `navigator.bluetooth` is missing, show a clear unsupported message
- if page is not in a secure context, show a clear HTTPS requirement message
- if Bluetooth is unavailable/disabled, show a retryable warning
- if user cancels device chooser, do not show a hard error; return to idle state

Installability:
- configure a manifest and service worker so the site can be installed to Android home screen
- offline support is optional for shell assets only; BLE functionality naturally still requires the live browser context and device proximity

## UI Specification
The design should optimize for use with one phone in hand and quick thumb interaction.

### Layout
Mobile-first only.
Main screen order:
- top status bar
- connection panel
- mode toggle
- main control area
- fixed bottom stop button

### Visual behavior
- high contrast
- large touch targets
- avoid tiny labels or desktop-like spacing
- numeric command values always visible
- disconnected state visually disables control surfaces
- connected state enables control surfaces immediately

### Main screens/states
- `unsupported`
- `idle disconnected`
- `connecting`
- `connected drive mode`
- `connected direct mode`
- `recoverable error`

### Recommended labels
- `Connect`
- `Reconnect`
- `Disconnect`
- `STOP`
- `Drive`
- `Direct`
- `Left`
- `Right`

## Implementation Details

### React choices
- functional components only
- no class components
- keep BLE session object outside React render churn where practical
- use Zustand for app state instead of prop drilling or premature context abstraction
- avoid over-abstracting components in v1; optimize for readability and predictable iteration

### Pointer handling
Use Pointer Events, not separate touch/mouse codepaths.
Requirements:
- `touch-action: none` on interactive control surfaces
- `setPointerCapture` on joystick pointerdown
- handle `pointercancel` explicitly
- ignore secondary pointers while one pointer owns the joystick

### Serialization helper
Implement one reusable function:
```ts
function encodeMotorValue(value: number): ArrayBuffer
```
Rules:
- clamp
- round
- write with `DataView.setInt16(0, value, true)`

### Error handling
Normalize errors into a small set of UI-safe categories:
- unsupported
- insecure-context
- bluetooth-unavailable
- user-cancelled
- connection-failed
- gatt-disconnected
- write-failed

The UI should display short actionable messages, not raw exception dumps.

### Logging
For v1:
- developer-friendly `console.debug` logs behind a simple `DEV` guard
- no remote logging
- include connection lifecycle and write failures in logs

## Tooling And Repo Setup
Create the new repo with:
- `Node 20+`
- `npm` or `pnpm`; choose `pnpm` by default
- `Vite`
- `React`
- `TypeScript`
- `ESLint`
- `Prettier`
- `vite-plugin-pwa`

Initial scripts:
- `dev`
- `build`
- `preview`
- `lint`
- `typecheck`

Recommended repo files:
- `.nvmrc` or documented Node version
- `README.md`
- `.env.example` only if later needed; not required for v1
- `public/icons/*` for PWA assets

## Hosting Plan
Use a simple static HTTPS host for v1. Requirements:
- HTTPS mandatory
- no custom backend
- URL should be stable so Android Chrome permission persistence is usable
- acceptable options: GitHub Pages, Netlify, Cloudflare Pages, Vercel static output
- choose whichever is fastest for you operationally; implementation should not depend on provider-specific features

Important deployment note:
- test the actual BLE flow from the hosted HTTPS URL on the Android phone
- desktop localhost testing is not sufficient for final validation because the real target is Android Chrome + nearby BLE

## Test Plan

### Unit tests
Cover:
- `clampMotorValue`
- joystick-to-motor mixing
- dead zone behavior
- encoder output for representative values:
  - `-100`
  - `-1`
  - `0`
  - `1`
  - `100`
  - out-of-range values

### Manual browser tests on Android
Connection:
- connect to `BiMotor Car`
- cancel chooser and confirm graceful recovery
- disconnect and reconnect
- reconnect after page reload if permission is retained

Drive mode:
- drag joystick forward, backward, left, right, diagonal
- verify displayed left/right values follow expected mixing
- release finger and verify immediate zero command
- switch away from drive mode while dragging and verify immediate zero

Direct mode:
- set each slider independently
- confirm left-only motor updates work with current single-wired hardware
- confirm stop button zeros both outputs
- confirm mode switch zeros both outputs

Safety:
- press stop while command is non-zero
- turn screen off or background Chrome and verify best-effort stop is sent
- walk out of range / power off ESP32 and verify disconnect handling
- reload page while connected and confirm no stuck UI state remains

Performance:
- verify no visible lag while dragging joystick
- verify BLE writes remain stable at configured send cadence
- verify no runaway error loop on temporary write failure

### Acceptance criteria
v1 is complete when:
- Android Chrome can connect reliably over HTTPS
- joystick mode can drive both motor characteristics with visible live values
- slider mode can write both characteristics directly
- stop behavior is immediate and consistent
- unexpected disconnects recover cleanly in UI
- the codebase is structured so telemetry or additional controls can be added without replacing the BLE layer or state model

## Assumptions And Defaults
- Target users are only you and other developers/testers on Android Chrome.
- The ESP32 firmware contract is fixed as provided: one service, two writable/readable/notifiable characteristics, signed `i16` little-endian payloads.
- v1 does not consume notifications because current needs are command-only; the BLE layer should still be structured so notification support can be added later.
- No backend is required now or planned for v1.
- Slider mode is included from day one because it is useful for hardware bring-up, even though joystick mode is the primary UX.
- Static HTTPS hosting is the default deployment path.
- The app is intentionally optimized for portrait mobile usage, not desktop responsiveness.

