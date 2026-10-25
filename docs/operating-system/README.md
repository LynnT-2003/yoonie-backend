# Yoonie Operating System document

`yoonie-operating-system.pdf` is the full write-up of the operating system across web and staff app: every flow with its sequence diagram, endpoints, request and response tables, statuses, errors, schemas, roles, decisions, open items and build status.

| File | What it is |
|---|---|
| `yoonie-operating-system.pdf` | The document to share |
| `yoonie-operating-system.html` | The same document as a web page |
| `build.py` | The source: edit this, then regenerate |
| `render-pdf.js` | Renders the HTML to PDF in headless Chrome |

## Regenerate

```bash
cd docs/operating-system
python3 build.py                          # writes yoonie-operating-system.html
npx -y -p playwright@1.48.2 node render-pdf.js \
  "$PWD/yoonie-operating-system.html" "$PWD/yoonie-operating-system.pdf"
```

First time only: `npx -y playwright@1.48.2 install chromium`. Diagrams are Mermaid, loaded from jsDelivr at render time, so rendering needs internet.

When an endpoint or rule changes, update `build.py` in the same PR. The rules themselves live in [`../OPERATING_RULES.md`](../OPERATING_RULES.md).
