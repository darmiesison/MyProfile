# MyProfile

🔗 **Live Demo:** https://myprofile-44do.onrender.com/
🚀 **Hosted on:** [Render](https://render.com)

## Setup

1. Copy `.env.example` to `.env`.
2. Set `MONGO_URI` to your MongoDB Atlas connection string.
3. Optionally update `MONGO_DB_NAME` and `MONGO_COLLECTION`.

## Install and run

```bash
npm install
npm start
```

## Contact form

The form sends a POST request to `http://localhost:3000/api/contact` and stores submissions in MongoDB Atlas using the `Profiling` database by default.

### Example Atlas URI

```text
mongodb+srv://<username>:<db_password>@cluster0.g5hph2p.mongodb.net/Profiling?retryWrites=true&w=majority
```

Replace `<username>` and `<db_password>` with your actual credentials and keep the URI private (never commit your real `.env` file).

## Verifying the database connection on Render

1. **Check Render logs** — Render dashboard → service → **Logs** tab. Look for a `MongoDB connected` message on startup (or an error if the connection failed).
2. **Confirm the environment variable** — Render dashboard → service → **Environment** tab. Make sure `MONGO_URI` is set to the real Atlas connection string (not blank or a placeholder).
3. **Whitelist Render's traffic in Atlas** — MongoDB Atlas → **Network Access** → ensure `0.0.0.0/0` (or Render's IPs) is allowed, since Render's server IP differs from your local machine.
4. **Test end-to-end** — Submit the live contact form, then check MongoDB Atlas → **Browse Collections** → `Profiling` database to confirm the new entry was saved.