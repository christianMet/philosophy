# Philosophy Profiler 🏛️

Map your team's philosophical commitments and see where everyone stands.

## Quick Start (run locally)

```bash
cd philosophy-profiler
npm install
npm start
```

Then open **http://localhost:3000** in your browser.

## Share with your team

### Option A: Same WiFi network
When you run `npm start`, the terminal shows a **Network URL** like `http://192.168.1.42:3000`.
Share that URL — anyone on the same WiFi can open it on their phone or laptop.

### Option B: Free public URL with Render.com
1. Push this folder to a GitHub repo
2. Go to [render.com](https://render.com), sign up free
3. New → Web Service → connect your repo
4. Settings: Build Command = `npm install`, Start Command = `npm start`
5. You'll get a public URL like `https://philosophy-profiler.onrender.com`
6. Share that URL with anyone!

### Option C: Quick tunnel with ngrok (no deploy needed)
1. Install ngrok: `brew install ngrok` (Mac) or download from ngrok.com
2. Run the app: `npm start`
3. In another terminal: `ngrok http 3000`
4. Share the ngrok URL it gives you (works from anywhere!)

## How it works

1. **Create a Room** — name it after your team
2. **Share the link** — teammates open it on any device
3. **Everyone takes the quiz** — ~40 questions, ~15 min
4. **See results** — radar charts, position labels, philosophical distance matrix

## Data

All profiles are saved in `data/profiles.json`. Back this file up if you want to keep results.
