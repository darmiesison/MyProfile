const { MongoClient } = require('mongodb');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

const uri = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB_NAME || 'Profiling';
const collectionName = process.env.MONGO_COLLECTION || 'contacts';

let cachedClient = null;
let cachedDb = null;

function maskMongoUri(uri) {
  if (!uri) return null;
  try {
    // Keep protocol and host(s), but remove credentials
    return uri.replace(/:\/\/(.*@)/, '://<user>:<pass>@');
  } catch (e) {
    return '<unavailable>';
  }
}
async function connectToDatabase() {
  if (cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  if (!uri) {
    throw new Error('MONGO_URI is not configured');
  }

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 20000,
    tls: true,
  });

  await client.connect();
  const db = client.db(dbName);

  // Ensure the connection is usable in serverless environment
  try {
    await db.command({ ping: 1 });
  } catch (pingErr) {
    // Close the client if ping fails to avoid leaving orphaned sockets
    try { await client.close(); } catch (e) {}
    throw new Error('MongoDB ping failed: ' + (pingErr && pingErr.message ? pingErr.message : String(pingErr)));
  }

  cachedClient = client;
  cachedDb = db;

  return { client, db };
}

async function saveMessageFallback(contactDoc) {
  try {
    // Use the system temp directory for serverless-friendly writable location
    const dataDir = path.join(os.tmpdir(), 'myprofile-data');
    const filePath = path.join(dataDir, 'contact-messages.json');
    await fs.mkdir(dataDir, { recursive: true });

    let arr = [];
    try {
      const existing = await fs.readFile(filePath, 'utf8');
      arr = JSON.parse(existing || '[]');
      if (!Array.isArray(arr)) arr = [];
    } catch (e) {
      // File may not exist or be invalid; start fresh
      arr = [];
    }

    arr.push(contactDoc);
    await fs.writeFile(filePath, JSON.stringify(arr, null, 2), 'utf8');
    console.log('Saved contact to fallback file:', filePath);
    return true;
  } catch (e) {
    console.error('Failed to save fallback message:', e && e.message ? e.message : e);
    return false;
  }
}

module.exports = async (req, res) => {
  // Allow only POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, message: 'Method not allowed.' });
  }

  const { name, email, contactNo, message } = req.body || {};

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

  try {
    // Helpful debug log for deployments (do not log secrets)
    console.log('contact function received payload:', { name, email, contactNo });
    console.log('env:', {
      dbName: dbName,
      collectionName: collectionName,
      useMongo: String(process.env.USE_MONGO || ''),
      debugContact: String(process.env.DEBUG_CONTACT || ''),
      mongoUriMasked: maskMongoUri(uri),
    });

    // If USE_MONGO is not explicitly enabled or MONGO_URI missing, use fallback
    if (String(process.env.USE_MONGO || '').toLowerCase() !== 'true' || !uri) {
      const saved = await saveMessageFallback(contactDoc);
      if (saved) {
        return res.status(200).json({ success: true, message: 'Message saved (fallback - no Mongo configured).' });
      } else {
        throw new Error('Mongo not enabled and fallback save failed');
      }
    }

    const { db } = await connectToDatabase();
    const contacts = db.collection(collectionName);
    await contacts.insertOne(contactDoc);
    return res.status(200).json({ success: true, message: 'Message Sent Successfully' });
  } catch (error) {
    console.error('Vercel contact function error:', {
      message: error && error.message ? error.message : String(error),
      name: error && error.name ? error.name : undefined,
      stack: error && error.stack ? error.stack.split('\n').slice(0,5).join('\n') : undefined,
    });

    // Try fallback save if Mongo failed at runtime
    try {
      const saved = await saveMessageFallback(contactDoc);
      if (saved) {
        return res.status(200).json({ success: true, message: 'Message saved (fallback after DB error).' });
      }
    } catch (e) {
      console.error('Fallback save also failed:', e && e.message ? e.message : e);
    }

    // If DEBUG_CONTACT=true in Vercel env, return detailed error (temporary for debugging only)
    if (String(process.env.DEBUG_CONTACT || '').toLowerCase() === 'true') {
      return res.status(500).json({
        success: false,
        message: 'Unable to send your message. Debug info included.',
        error: error && error.message ? error.message : String(error),
        name: error && error.name ? error.name : undefined,
        stack: error && error.stack ? error.stack : undefined,
      });
    }

    return res.status(500).json({ success: false, message: 'Unable to send your message. Please try again later.' });
  }
};