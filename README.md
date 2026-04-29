# BiMotor Control PWA

Mobile-first React + TypeScript + Vite PWA for controlling the `BiMotor Car` ESP32-C6 over Web Bluetooth from Android Chrome.

## Stack

- React + TypeScript + Vite
- Zustand state store
- CSS Modules + global design tokens
- `vite-plugin-pwa`
- Vitest for unit tests

## BLE contract

- Device hint: `BiMotor Car`
- Service UUID: `12345678-1234-5678-9abc-def012345678`
- Left characteristic UUID: `12345678-1234-5678-9abc-def012345679`
- Right characteristic UUID: `12345678-1234-5678-9abc-def012345680`
- Each write is a signed `i16` in little-endian, clamped app-side to `-100..100`

## Scripts

- `pnpm dev`
- `pnpm build`
- `pnpm preview`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`

## Local development

1. Use Node `20+` and `pnpm`.
2. Install dependencies with `pnpm install`.
3. Start the dev server with `pnpm dev`.

## Android testing

- Web Bluetooth requires Android Chrome over HTTPS.
- Final BLE validation should be done from the hosted HTTPS URL on the phone, not only from desktop localhost.
- The app sends `0/0` on joystick release, mode switch, disconnect, page hide, and best-effort page exit.

## Deployment

Deploy the built `dist/` output to a static HTTPS host such as GitHub Pages, Netlify, Cloudflare Pages, or Vercel static hosting.
