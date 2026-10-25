# Yoonie business guide

`yoonie-business-guide.pdf` is the plain-language version of the operating system for the business team: what Yoonie does, a guest's day end to end, rooms, pickups, tours, money, what managers see, the rules, the AI concierge plan (n8n prototype, what must be fixed, roadmap), and the decisions we need.

The technical version, with endpoints and request/response tables, is in [`../operating-system/`](../operating-system/README.md).

## Regenerate

```bash
cd docs/business-guide
python3 build.py
npx -y -p playwright@1.48.2 node ../operating-system/render-pdf.js \
  "$PWD/yoonie-business-guide.html" "$PWD/yoonie-business-guide.pdf"
```

It reuses the page style from `../operating-system/build.py`, so the two documents always look the same.
