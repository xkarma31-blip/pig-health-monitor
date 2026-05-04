import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: 'studio-1248778633-99f62.firebaseapp.com',
  projectId: 'studio-1248778633-99f62',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

signInAnonymously(auth)
  .then((userCredential) => {
    console.log("Anonymous Auth SUCCESS:", userCredential.user.uid);
    process.exit(0);
  })
  .catch((error) => {
    console.error("Anonymous Auth FAILED:", error.code, error.message);
    process.exit(1);
  });
