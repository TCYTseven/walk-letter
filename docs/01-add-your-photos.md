# Add your photos

Put your photos in [`drop/`](../drop/).

Accepted types are JPG, JPEG, PNG, HEIC, and WEBP. The folder README stays in place.

Run:

```bash
npm run photos
```

`npm run dev` and `npm run build` run that script first.

The script writes:

- `public/photos/*.jpg` — the images the walk displays
- `src/data/photos.json` — one record per image

Each record has `filename`, `date`, `width`, and `height`. The page loads an image from `/photos/<filename>`.

The script keeps the largest file when two originals share a name, skips identical bytes, and skips near-duplicate pictures. It leaves the files in `drop/` untouched.
