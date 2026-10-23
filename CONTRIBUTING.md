# Contributing

Thanks for helping improve Walk Letter.

## Set up

```bash
npm install
npm run dev
```

The sample opens in the browser. No password and no environment variables. Letters made at `/customize` are saved to `.data/` while you develop.

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

Do not commit `node_modules`, `.next`, `out`, or `.data`.

## Pull requests

Describe what you changed and how you checked it. Keep personal photos, names, and private notes out of the sample.
