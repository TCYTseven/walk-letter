# Edit the dates

Open [`src/data/photos.json`](../src/data/photos.json).

Each entry looks like this:

```json
{
  "filename": "lane.jpg",
  "date": "2024-06-14T18:12:00",
  "width": 1200,
  "height": 1600
}
```

`date` is a wall-clock time with no timezone: `YYYY-MM-DDTHH:mm:ss`. The walk prints that calendar day under the photo. `2024-06-14T18:12:00` reads as June 14, 2024.

`npm run photos` fills `date` from EXIF (`DateTimeOriginal`, then `CreateDate`, then `ModifyDate`) when the file has a capture time. When the file has no EXIF date, the script keeps a date already stored for that filename. Otherwise it uses the file's modified time.

Change the `date` strings after the script runs. A later `npm run photos` replaces your edit when that original still has an EXIF date. Files without EXIF keep the date you wrote.
