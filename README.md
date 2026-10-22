# Walk Letter

A small site for a photo walk and a letter. You open a sealed envelope, read the note, and walk a meadow path where each photo appears as a sticker with its date.

The sample is a fictional golden-hour walk. Replace the photos, the dates, and the letter with your own. The envelope opens immediately. There is no password and there are no environment variables.

## Quick start

```bash
npm install
npm run dev
```

Open the local URL that Next.js prints. `npm run dev` prepares the sample photos, then starts the app.

## Make it yours

1. Drop photos into [`drop/`](drop/). See [Add your photos](docs/01-add-your-photos.md).
2. Edit the dates in [`src/data/photos.json`](src/data/photos.json). See [Edit the dates](docs/02-edit-the-dates.md).
3. Edit the paragraphs in [`src/data/letter.json`](src/data/letter.json). See [Edit the letter](docs/03-edit-the-letter.md).

## Screenshots

The sealed envelope. Click or tap it to open the letter.

![Sealed envelope with a hint to click it](docs/images/01-hero.png)

The sample letter.

![Open letter with the sample paragraphs](docs/images/03-letter.png)

One photo on the meadow path, with its date.

![Meadow walk with a revealed photo sticker and date](docs/images/02-walk.png)

## Project structure

| Path | Purpose |
| --- | --- |
| `drop/` | Photos you add. The script does not change these files. |
| `public/photos/` | Generated JPGs the walk displays. |
| `src/data/photos.json` | `filename`, `date`, `width`, and `height` for each photo. |
| `src/data/letter.json` | Greeting, paragraphs, sign-off, and an optional ending URL. |
| `public/fonts/fredoka-600.woff` | Fredoka file used by the 3D date labels. |
| `out/` | Static site from `npm run build`. Do not commit this folder. |

## Fonts

The interface uses [Caveat](https://fonts.google.com/specimen/Caveat) and [Fredoka](https://fonts.google.com/specimen/Fredoka). Both are licensed under the [SIL Open Font License 1.1](https://openfontlicense.org/open-font-license-official-text/).

The 3D date labels load `public/fonts/fredoka-600.woff`. That file is Fredoka and stays under the same SIL Open Font License 1.1. A short notice sits beside it in [`public/fonts/OFL.txt`](public/fonts/OFL.txt).

## Deploy it yourself

This app is a static Next.js export. No password. No environment variables.

```bash
npm install
npm run build
```

Host the `out/` directory on any static file host. This repository does not deploy for you.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE).
