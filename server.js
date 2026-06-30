const express = require('express');
const http = require('http');
const cors = require('cors');
const dns = require('dns');
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const mongoUri = process.env.MONGO_URI;
const useMongo = process.env.USE_MONGO
  ? String(process.env.USE_MONGO).toLowerCase() === 'true'
  : Boolean(mongoUri);

// Use public DNS servers for Atlas SRV resolution when local DNS is unreliable.
dns.setServers(['8.8.8.8', '8.8.4.4']);

const dataDir = path.join(__dirname, 'data');
const fallbackMessagesPath = path.join(dataDir, 'contact-messages.json');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const client = mongoUri
  ? new MongoClient(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 20000,
      tls: true,
    })
  : null;

let contacts;
let dbReady = false;

async function connectToDatabase() {
  if (!useMongo || !mongoUri || !client) {
    console.warn('MongoDB is disabled or not configured. Starting without database persistence.');
    return false;
  }

  try {
    await client.connect();
    const dbName = process.env.MONGO_DB_NAME || 'Profiling';
    const collectionName = process.env.MONGO_COLLECTION || 'contacts';
    const db = client.db(dbName);
    contacts = db.collection(collectionName);
    dbReady = true;
    console.log('Connected to MongoDB Atlas');
    return true;
  } catch (error) {
    console.warn('MongoDB connection failed. Starting without database persistence.', error);
    return false;
  }
}

function saveMessageFallback(contactDoc) {
  let messages = [];

  if (fs.existsSync(fallbackMessagesPath)) {
    try {
      messages = JSON.parse(fs.readFileSync(fallbackMessagesPath, 'utf8'));
    } catch (error) {
      console.warn('Unable to parse fallback message file. Starting fresh.', error.message);
    }
  }

  messages.push(contactDoc);
  fs.writeFileSync(fallbackMessagesPath, JSON.stringify(messages, null, 2));
  return messages.length;
}

async function startServer() {
  await connectToDatabase();

  app.post('/api/contact', async (req, res) => {
    try {
      const { name, email, contactNo, message } = req.body;
      if (!name || !email || !message) {
        return res.status(400).json({ success: false, message: 'Name, email, and message are required.' });
      }

      if (!email.includes('@')) {
        return res.status(400).json({ success: false, message: 'Please enter a valid email address containing @.' });
      }

      if (!contactNo || !/^\d{11}$/.test(contactNo)) {
        return res.status(400).json({ success: false, message: 'Contact number must be exactly 11 digits and contain only numbers.' });
      }

      const contactDoc = {
        name,
        email,
        contactNo,
        message,
        createdAt: new Date(),
      };

      if (dbReady && contacts) {
        await contacts.insertOne(contactDoc);
      } else {
        saveMessageFallback(contactDoc);
      }

      return res.json({ success: true, message: 'Message Sent Successfully' });
    } catch (error) {
      console.error('Contact save error:', error);
      return res.status(500).json({ success: false, message: 'Unable to send message.' });
    }
  });

  app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
  });

  app.get('/favicon.ico', (_req, res) => {
    res.sendFile(path.join(__dirname, 'assets', 'logo.png'));
  });

  app.get('/api/health', (_req, res) => {
    res.json({ success: true, status: 'ok', database: dbReady ? 'connected' : 'fallback' });
  });

  function listenOnPort(portToTry, attempt = 1) {
    const server = http.createServer(app);
    const maxAttempts = 20;

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE' && attempt < maxAttempts) {
        const fallbackPort = Number(portToTry) + 1;
        console.warn(`Port ${portToTry} is busy. Trying ${fallbackPort} instead.`);
        listenOnPort(fallbackPort, attempt + 1);
        return;
      }

      console.error('Failed to start server:', error);
      process.exit(1);
    });

    server.listen(portToTry, () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : portToTry;
      console.log(`Server running on http://localhost:${actualPort}`);
    });
  }

  listenOnPort(port);
}

startServer();
