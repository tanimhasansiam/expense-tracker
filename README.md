# Expense Tracker (offline PWA for iPhone)

A simple expense tracker that runs fully offline on your iPhone. No App Store, no Mac, no server.
Your data is stored on the phone itself (IndexedDB).

## Files

| File | What it does |
|---|---|
| `index.html` | App layout |
| `style.css` | Look and feel (supports dark mode) |
| `app.js` | All app logic: add/edit/delete, summary, budget, export/import |
| `sw.js` | Service worker: caches the app so it works with no internet |
| `manifest.json` | Makes it installable ("Add to Home Screen") |
| `icons/` | App icons |

---

## 1. Run it on your PC (VS Code)

1. Open this folder in VS Code (**File → Open Folder…**).
2. Install the **Live Server** extension (by Ritwick Dey) from the Extensions tab.
3. Right-click `index.html` → **Open with Live Server**. It opens at `http://127.0.0.1:5500`.
4. Press **F12 → toggle device toolbar (Ctrl+Shift+M)** and pick an iPhone to preview at phone size.

> Opening `index.html` by double-clicking will NOT work properly. Service workers need `http://localhost` or `https://`.

## 2. Put it online (free, one time) — GitHub Pages

An iPhone can only install a web app from an `https://` address. After it's installed, it works offline.

1. Create a free account at <https://github.com>.
2. Click **New repository** → name it `expense-tracker` → **Public** → **Create repository**.
3. On the new repo page click **uploading an existing file**, drag in **all files and the `icons` folder**, then **Commit changes**.
4. Go to **Settings → Pages** → under *Branch* choose `main` and `/ (root)` → **Save**.
5. Wait ~1 minute. Your app is live at: `https://YOUR-USERNAME.github.io/expense-tracker/`

*Alternative:* go to <https://app.netlify.com/drop> and drag this whole folder onto the page. You get an https link instantly.

## 3. Install on your iPhone

1. Open the link in **Safari** (must be Safari, not Chrome).
2. Tap the **Share** button → **Add to Home Screen** → **Add**.
3. Open the app from the Home Screen **once while online** so it saves itself.
4. Test: turn on **Airplane Mode** and open it again. It should work.

## 4. Updating the app later

1. Edit the files in VS Code.
2. Open `sw.js` and bump the version: `const CACHE_VERSION = 'v2';` (then v3, v4…).
3. Upload the changed files to GitHub again.
4. On the iPhone, open the app while online, close it fully, open again. It now runs the new version.

Your expenses are **not** lost when you update the app.

## 5. Keep your data safe

- Data lives only on your phone. **Deleting the Home Screen icon deletes the data.**
- Use **Settings → Export backup (JSON)** regularly and save it to Files / iCloud Drive.
- To restore, use **Settings → Import backup**.

## Customizing

- **Categories:** edit the `CATEGORIES` list at the top of `app.js` (id, name, emoji, color).
- **Currency:** change it in the app's Settings tab (default is ৳).
- **Colors:** change `--brand` and `--brand-2` at the top of `style.css`.
