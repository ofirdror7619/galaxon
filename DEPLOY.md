# Release / Upload Checklist

This project is set up to upload source cleanly (without npm/build artifacts).

## What is already excluded
- `node_modules/`
- `dist/`
- logs and editor temp files

These are ignored by `.gitignore`, so they are not included in source uploads.

## Upload source to GitHub
1. Make sure only source files are present in your upload.
2. Do **not** include `node_modules/` or `dist/`.
3. Build locally before uploading:
   ```bash
   npm install
   npm run build
   ```

## Deploy game to hosting
After source upload, deploy using your host build command:
- Install: `npm install`
- Build: `npm run build`
- Publish folder: `dist`

Works well for Netlify, Vercel, GitHub Pages, Cloudflare Pages, etc.
