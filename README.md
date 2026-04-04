# Black Box 📦

Clean, minimal PWA for cataloguing household storage boxes. Installable on Android. Works offline. Syncs to Google Sheets so all household members share the same data.

## How sync works

| What | Where | Who sees it |
|------|-------|-------------|
| Box data (IDs, locations, items, tags) | Google Sheet (one shared) | Everyone — real-time |
| Photos | Google Drive folder (one shared) | Everyone — via shareable link |
| Each person signs in with | Their own Google account | — |

The app reads/writes a single JSON blob in cell A1 of your shared Sheet. Simple and free.

## Deploy to GitHub Pages

```bash
git init && git add . && git commit -m "Initial commit"
gh repo create black-box --public --source=. --push
```

Then: **GitHub repo → Settings → Pages → Source: GitHub Actions**

App live at: `https://YOUR-USERNAME.github.io/black-box/`

## Google Setup (one person does this, ~5 min)

### 1. Google Cloud project
- [console.cloud.google.com](https://console.cloud.google.com) → New project → **BlackBox**
- APIs & Services → Library → enable **Google Sheets API** + **Google Drive API**
- OAuth consent screen → External → App name: Black Box → add scopes `spreadsheets` and `drive.file`
- Credentials → Create → OAuth 2.0 Client ID → **Web application**
- Authorised JS origins: `https://YOUR-USERNAME.github.io` (and `http://localhost:8080` for testing)
- Copy the **Client ID**

### 2. Shared Google Sheet
- Create a new Google Sheet
- Share it as **Editor** with all household members (or "Anyone with link can edit")
- Copy the Sheet ID from the URL: `docs.google.com/spreadsheets/d/**SHEET_ID**/edit`

### 3. Shared Drive folder
- Create a Google Drive folder called **BlackBox Photos**
- Share as **Editor** with all household members
- Open it, copy the folder ID from the URL: `drive.google.com/drive/folders/**FOLDER_ID**`

### 4. Configure the app
- Open Black Box → **Settings**
- Paste Client ID, Sheet ID, and Folder ID
- Tap **Save & Sign In** → Google sign-in popup → approve
- Each household member does this on their own device with their own Google account

## Add Icons

Drop `icon-192.png` (192×192) and `icon-512.png` (512×512) in the `icons/` folder.
Use [maskable.app](https://maskable.app/editor) to make them maskable.

## Install on Android

1. Open your GitHub Pages URL in Chrome
2. Menu → **Add to Home Screen** → Install
3. Launches as a standalone app

## File structure

```
index.html          — Complete self-contained app (HTML + CSS + JS all inline)
sw.js               — Service Worker for offline support
manifest.json       — PWA manifest
.github/workflows/
  deploy.yml        — Auto-deploy to GitHub Pages
icons/
  icon-192.png      — Add this
  icon-512.png      — Add this
```
