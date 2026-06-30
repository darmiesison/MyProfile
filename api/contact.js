const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI;
const dbName = process.env.MONGO_DB_NAME || 'Profiling';
const collectionName = process.env.MONGO_COLLECTION || 'contacts';

let cachedClient = null;
let cachedDb = null;

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

  cachedClient = client;
  cachedDb = db;

  return { client, db };
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
    // Helpful debug log for deployments
    console.log('contact function received payload:', { name, email, contactNo });

    const { db } = await connectToDatabase();
    const contacts = db.collection(collectionName);
    await contacts.insertOne(contactDoc);
    return res.status(200).json({ success: true, message: 'Message Sent Successfully' });
  } catch (error) {
    console.error('Vercel contact function error:', error && error.message ? error.message : error);

    // If DEBUG_CONTACT=true in Vercel env, return detailed error (temporary for debugging only)
    if (String(process.env.DEBUG_CONTACT || '').toLowerCase() === 'true') {
      return res.status(500).json({
        success: false,
        message: 'Unable to send your message. Debug info included.',
        error: error && error.message ? error.message : String(error),
        stack: error && error.stack ? error.stack : undefined,
      });
    }

    return res.status(500).json({ success: false, message: 'Unable to send your message. Please try again later.' });
  }
};