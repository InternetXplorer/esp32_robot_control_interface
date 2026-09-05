# Wheeled Robot Control PWA

Mobile-first React + TypeScript + Vite PWA for controlling the `Wheeled Robot` ESP32-C6 over Web Bluetooth from Android Chrome.

## Stack

- React + TypeScript + Vite
- Zustand state store
- CSS Modules + global design tokens
- `vite-plugin-pwa`
- Vitest for unit tests

## BLE contract

- Device hint: `Wheeled Robot`
- Service UUID: `12345678-1234-5678-9abc-def012345700`
- Command characteristic UUID: `12345678-1234-5678-9abc-def012345701`
- Stop packet: `00`
- Drive packet: `01 + left_i16_le + right_i16_le`, clamped app-side to `-100..100`
- Return-to-origin packet: `02`

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
- The app sends `0/0` on joystick release, mode switch, disconnect, page hide, best-effort page exit, and Stop.
- Return to origin is a one-shot autonomy command with no frontend-visible completion signal yet.

## Deployment

Deploy the built `dist/` output to a static HTTPS host such as GitHub Pages, Netlify, Cloudflare Pages, or Vercel static hosting.
