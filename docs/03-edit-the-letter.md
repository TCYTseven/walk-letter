# Edit the letter

Open [`src/data/letter.json`](../src/data/letter.json).

```json
{
  "greeting": "Dear friend,",
  "paragraphs": [
    "First paragraph.",
    "Second paragraph."
  ],
  "signoff": "With care,",
  "signature": "a friend",
  "surpriseUrl": "https://example.com"
}
```

| Field | Where it appears |
| --- | --- |
| `greeting` | First line of the letter |
| `paragraphs` | Body, in order. Add, remove, or rewrite these strings. |
| `signoff` | Closing line |
| `signature` | Larger line under the closing |
| `surpriseUrl` | Button at the end of the walk. Use an `https` URL, or `""` to hide the button. |

Save the file and reload the page. The envelope, the letter card, and the ending note all read this file.
