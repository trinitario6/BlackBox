# Black Box 📦

An offline-first PWA to catalogue your household storage boxes — contents, photos, locations and tags. Installable on Android via Chrome.

---

## Deploy in 5 minutes

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Black Box v1"
gh repo create black-box --public --source=. --push
```

### 2. Enable GitHub Pages

1. Go to your repo → **Settings → Pages**
2. Under **Source**, choose **GitHub Actions**
3. The workflow runs automatically on every push to `main`
4. Your app URL: `https://<username>.github.io/black-box/`

> **Note:** If deploying to a subdirectory (not a `<username>.github.io` root repo), update `"start_url"` and `"scope"` in `manifest.json` to `/black-box/`, and the asset URLs in `sw.js` to use `/black-box/` prefix.

### 3. Add icons

Place two PNGs in the `icons/` folder:
- `icon-192.png` — 192×192 px
- `icon-512.png` — 512×512 px

Use [maskable.app/editor](https://maskable.app/editor) to ensure safe zone for Android rounded corners. A simple black square with a white box icon works great.

### 4. Install on Android

1. Open the GitHub Pages URL in **Chrome for Android**
2. Tap **⋮ → Add to Home Screen**
3. App opens standalone — no browser chrome

---

## Google Drive Photo Sharing

All household members share photos via a single Google Drive folder.

### Setup (one person does this once)

1. **Create a Google Cloud project:**
   - Go to [console.cloud.google.com](https://console.cloud.google.com)
   - Create a new project (e.g. "Black Box")
   - Enable the **Google Drive API**

2. **Create OAuth credentials:**
   - Go to **APIs & Services → Credentials → Create Credentials → OAuth Client ID**
   - Application type: **Web application**
   - Add your GitHub Pages URL to **Authorised JavaScript origins**
   - Copy the **Client ID**

3. **Create a shared Drive folder:**
   - Open Google Drive, create a folder (e.g. "Black Box Photos")
   - Right-click → Share → add all household members' Google accounts
   - Open the folder and copy the ID from the URL:
     `drive.google.com/drive/folders/`**`COPY_THIS_PART`**

4. **In the app (Settings tab):**
   - Tap **Sign in with Google** → enter your Client ID when prompted
   - Paste the shared folder ID → tap **Save Folder ID**
   - Each household member signs in with their own Google account and uses the same folder ID

### How it works

- Photos are uploaded to the shared folder when you save a box
- All household members see the same photos via Drive's public share link
- If offline or not signed in, photos are stored locally as fallback

---

## File Structure

```
index.html                    ← App shell + all views
styles.css                    ← All styles
app.js                        ← All logic (CRUD, Drive, search, UI)
sw.js                         ← Service Worker (offline cache)
manifest.json                 ← PWA manifest
icons/
  icon-192.png                ← Add this manually
  icon-512.png                ← Add this manually
.github/workflows/
  deploy.yml                  ← Auto-deploy to GitHub Pages
```

---

## Data

- **Box data** is stored in `localStorage` on each device
- **Photos** are uploaded to Google Drive and referenced by URL
- **Export JSON** (Settings) creates a full local backup
- There is no automatic sync of box data between devices — Drive handles photos only

---

## Licence

MIT
