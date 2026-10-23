# Customize and share

Open `/customize` to make a letter without editing files.

## Photos

Drop photos on the page or click the box to pick them. You can select many at once, up to 20 per letter.

Each photo is decoded, turned upright, resized to 2048 px on its longest edge, and saved as a JPEG in your browser. The date comes from the photo's EXIF capture time, or the file's modified time when there is none. Edit any date in the box under its thumbnail.

Photos appear along the path in the order shown. Drag a tile, use the arrow buttons, or click **Sort by date**.

Chrome and Firefox cannot read HEIC files. Export those as JPG first, or use Safari.

## Letter

Leave a blank line between paragraphs. The link at the end of the walk is optional and must start with `https://` or `http://`.

## Share

**Create my link** uploads the photos, saves the letter, and shows a link like `https://your-site/k3T9pQx2Ab`. Copy it and send it. Whoever opens it gets the envelope, your letter, and the walk.

A link never changes after it is made. To fix something, edit the draft and create a new link. Links you made in this browser are listed under the button.

Each IP address can make one link per 24 hours. If an upload fails partway, **Create my link** retries with the same link id, so the retry does not count as a second letter.

## Where things are kept

| What | Where |
| --- | --- |
| Draft letter | `localStorage` in your browser |
| Draft photos | IndexedDB in your browser |
| Shared letters | Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set, otherwise `.data/` |
| Daily limit | `limits/<hashed IP>.json` in the same storage |

Each shared letter is one JSON file at `letters/<id>.json` plus its photos at `letters/<id>/<n>.jpg`. There is no database. The photos are served from `/api/files/letters/<id>/<n>.jpg`.
