# Contributing

Thanks for helping improve Walk Letter.

## Set up

```bash
npm install
npm run dev
```

The sample opens in the browser. No password and no environment variables.

## Change the sample

1. Add or replace images in `drop/`.
2. Adjust dates in `src/data/photos.json`.
3. Rewrite the letter in `src/data/letter.json`.

See `docs/` for each step.

## Checks

```bash
npm run typecheck
npm run build
```

`npm run build` writes a static site to `out/`. Do not commit `node_modules`, `.next`, or `out`.

## Pull requests

Describe what you changed and how you checked it. Keep personal photos, names, and private notes out of the sample.
