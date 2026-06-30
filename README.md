# MyProfile

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
mongodb+srv://darmiesison:<db_password>@cluster0.g5hph2p.mongodb.net/Profiling?retryWrites=true&w=majority
```

Replace `<db_password>` with your actual password and keep the URI private.
