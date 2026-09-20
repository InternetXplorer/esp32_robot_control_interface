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
- Diagnostics characteristic UUID: `12345678-1234-5678-9abc-def012345702`
- Stop packet: `00`
- Drive packet: `01 + left_i16_le + right_i16_le`, clamped app-side to `-100..100`
- Return-to-origin packet: `02`
- Reset-odometry-origin packet: `03`
- Firmware safety-control packets: `04` off / `05` on (not currently exposed by the app)
- Drive-until-obstacle packet: `06 + stop_distance_mm_u16_le` (the autonomy button uses 200 mm)
- Drive-until-obstacle-then-return packet: `07 + stop_distance_mm_u16_le` (the button uses 200 mm: `07 C8 00`)

The firmware accepts obstacle thresholds from 50 through 4000 mm. The shared
encoder checks u16 representability; domain/deployment acceptance belongs to the
firmware. Invalid lengths, unknown opcodes and out-of-range thresholds are rejected.
The return leg goes to the saved odometry origin and heading, not the position
where the composition was launched. The composition is one queued job.
Diagnostic request IDs remain the corresponding explicit opcode values 0..7.

Diagnostics versions 2 and later share a stable 24-byte prefix. Firmware may
assign reserved bytes or append fields in a newer version without breaking an
older app. Existing field offsets and meanings must not change; a breaking
format should use a new characteristic UUID or explicit framing rather than
reusing the current version sequence.

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
- Return to origin, drive until obstacle, and drive until obstacle then return are one-shot autonomy commands with no frontend-visible completion signal yet.
- Firmware BLE autonomy is detached: a connection loss alone does not cancel it.
  An explicit Stop/manual command does; the app's intentional disconnect path
  attempts a best-effort stop before disconnecting.

## Deployment

Deploy the built `dist/` output to a static HTTPS host such as GitHub Pages, Netlify, Cloudflare Pages, or Vercel static hosting.

## Adding an autonomy control

Core registration and UI exposure are separate. In the sibling firmware repo,
write the recipe/validation and one entry in `robot_control/src/recipes.rs`;
optional BLE exposure is one payload binding in
`wheeled_robot/src/robot/ble_commands.rs`. Follow its
[authoring guide](../esp32-rust-journey-code/docs/adding-autonomy-behaviors.md).
A core-only behavior needs no changes here.

For an exposed BLE behavior, deliberately add its encoder, client method,
diagnostic name and UI callback/button, with tests. Keep wire IDs explicit and
stable; do not infer them from the firmware's catalog order. The test-only
`TurnAndReturnHome` fixture has no BLE opcode or UI control. The original
[plan](plan.md) is historical and contains the obsolete two-characteristic
BiMotor Car protocol; use this README and `src/domain/encode.ts` for the current
command contract.
