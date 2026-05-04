const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Path to your service account key
const serviceAccount = require('../firebase-adminsdk.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const uid = 'admin_mock_uid';
const additionalClaims = {
  admin: true,
  access_level: 'MASTER'
};

async function generateToken() {
  try {
    const customToken = await admin.auth().createCustomToken(uid, additionalClaims);
    console.log('--- SOVEREIGN ACCESS TOKEN GENERATED ---');
    console.log(customToken);
    console.log('---------------------------------------');
    
    // Save it to a file that the mobile app can potentially read or I can use to update the app code
    fs.writeFileSync(path.join(__dirname, 'admin_token.txt'), customToken);
    
    return customToken;
  } catch (error) {
    console.error('Error creating custom token:', error);
  }
}

generateToken();
