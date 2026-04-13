# NAS Shipping Estimator (Electron + React)

Desktop load-planning application for North American Steel.

## Runtime Model

- Renderer: React + TypeScript + Vite
- Desktop shell: Electron
- Storage: Electron IPC file storage (browser mode falls back to localStorage)
- Core features: quote import, bundle planning, 3D visualization/editing, PDF/Excel export

## Commands

Run from this `app/` directory.

- `npm install` - install dependencies
- `npm run dev` - run Vite + Electron development workflow
- `npm run lint` - lint source files
- `npm run build` - type-check and build renderer/electron outputs
- `npm run build:electron` - build packaged Windows installer via electron-builder

## Build Outputs

- `dist/` - renderer build
- `dist-electron/` - Electron main/preload builds
- `release/` - packaged app output (`build:electron`)

## Notes

- Trailer and bundle logic is implemented in `src/algorithm.ts` and `src/data.ts`.
- If manufacturing bundle counts and dimensions are being re-measured, treat those rule values as provisional until updated.
- Use `documentation/update_plan.md` as the active remediation roadmap.
