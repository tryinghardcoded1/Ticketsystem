import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import admin from "firebase-admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import fs from "fs";

dotenv.config();

// Attempt to initialize firebase-admin
const firebaseConfigPath = path.join(process.cwd(), 'firebase-applet-config.json');
let firebaseConfig: any = {};
if (fs.existsSync(firebaseConfigPath)) {
  firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));
}

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: `https://${firebaseConfig.projectId}.firebaseio.com`
    });
    console.log("Firebase Admin initialized with service account.");
  } catch (err) {
    console.error("Failed to initialize Firebase Admin with service account:", err);
  }
} else {
  // Fallback for development if possible, but usually requires credentials
  try {
    admin.initializeApp({
      projectId: firebaseConfig.projectId
    });
    console.log("Firebase Admin initialized with project ID fallback.");
  } catch (err) {
    console.warn("Firebase Admin fallback initialization failed. Admin features may be limited.");
  }
}

const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API Route for one-time admin bootstrap
  app.get("/api/diag-rentals", async (req, res) => {
    try {
      const db = getFirestore(undefined, firebaseConfig.firestoreDatabaseId || '(default)');
      const snap = await db.collection('rentals').get();
      const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      res.json(docs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/bootstrap-admin", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (email !== 'license4booking@gmail.com' && email !== 'cerezvincent24@gmail.com') {
        res.status(403).json({ error: "Unauthorized bootstrap attempt." });
        return;
      }

      // We need to create the user in Auth and Firestore
      try {
        let userRecord;
        try {
          userRecord = await admin.auth().getUserByEmail(email);
          console.log("User already exists in Auth.");
        } catch (err: any) {
          if (err.code === 'auth/user-not-found') {
            userRecord = await admin.auth().createUser({
              email,
              password,
              displayName: 'Super Admin',
              emailVerified: true
            });
            console.log("Created new admin user in Auth.");
          } else {
            throw err;
          }
        }

        // Now ensure Firestore record exists
        const db = getFirestore(undefined, firebaseConfig.firestoreDatabaseId || '(default)');
        const userDocRef = db.collection('users').doc(userRecord.uid);
        
        await userDocRef.set({
          email: email,
          role: 'SUPER_ADMIN',
          displayName: 'Super Admin',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });

        res.json({ success: true, message: "Bootstrap successful. You can now login." });
      } catch (innerError: any) {
        console.error("Admin bootstrap inner error:", innerError);
        res.status(500).json({ error: "Failed to perform admin bootstrap via SDK: " + innerError.message });
      }
    } catch (error) {
      console.error("Bootstrap error:", error);
      res.status(500).json({ error: "Failed to bootstrap admin." });
    }
  });

  // API Route for AI Extraction
  app.post("/api/extract-ticket", async (req, res) => {
    try {
      const { images } = req.body; // Array of base64 strings

      if (!images || !images.length) {
        res.status(400).json({ error: "No images provided" });
        return;
      }

      // Process only the first image for now
      const base64Image = images[0].replace(/^data:image\/[a-z]+;base64,/, "");

      const prompt = `
        Analyze this document. It could be a vehicle violation ticket (parking, speeding, etc.) OR a police crash/accident report.
        Extract the following information in JSON format:
        {
          "document_type": "ticket" or "crash_report",
          "plate_number": "normalized string without spaces/dashes, if available",
          "violation_date": "YYYY-MM-DD (date of violation, or date of the accident report if a crash report)",
          "amount": number (fine value, e.g. 50.00; for crash/accident reports without fine values, set to 0),
          "violation_type": "short description e.g. Parking Ticket, or Accident/Crash Report if it is a crash report",
          "make": "vehicle brand, if available (e.g. Toyota, Honda)",
          "model": "vehicle model, if available (e.g. Camry, Civic)",
          "state": "2 letter state code, if available",
          "driver_name": "Full name of the active driver, if specified in the report (e.g. Donell Fogle)",
          "passenger_name": "Full name of passenger(s), if specified (e.g. Jane Doe)",
          "injury_type": "Injury description or code, if specified in report (e.g. '0 - No Injury')",
          "active_restraint": "Active restraint description or code, if specified in report (e.g. '3 - Combination Shoulder & Lap')"
        }
        Return ONLY valid JSON.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: [
          { role: 'user', parts: [
              {text: prompt},
              {inlineData: { mimeType: 'image/jpeg', data: base64Image }}
          ] }
        ],
        config: {
          responseMimeType: "application/json",
        }
      });

      const jsonText = response.text || "{}";
      res.json(JSON.parse(jsonText));

    } catch (error) {
      console.error("AI extraction error:", error);
      res.status(500).json({ error: "Failed to extract data." });
    }
  });

  app.post("/api/map-columns", async (req, res) => {
    try {
      const { headers, type } = req.body;

      if (!headers || !headers.length) {
        res.status(400).json({ error: "No headers provided" });
        return;
      }

      let targetFields = "";
      if (type === 'rentals') {
        targetFields = `
          - firstName
          - lastName
          - customerName (fullName)
          - phone
          - email
          - dob
          - vehicle
          - plateNumber
          - startDate
          - endDate
          - status (one of: active, completed, pending, cancelled)
        `;
      } else if (type === 'tickets') {
        targetFields = `
          - plateNumber
          - violationDate
          - amount
          - violationType
          - location
          - status (one of: pending, paid, contested)
        `;
      } else if (type === 'vehicles') {
        targetFields = `
          - make
          - model
          - year
          - plateNumber
          - color
          - status (one of: available, rented, maintenance)
        `;
      }

      const prompt = `
        I have a CSV with the following headers: [${headers.join(', ')}].
        I need to map these to my internal database schema for ${type}:
        ${targetFields}

        Please return ONLY a JSON object where keys are my internal field names and values are the corresponding CSV header names from the provided list.
        If a field cannot be mapped, omit it.
        Return ONLY valid JSON.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });

      const jsonText = response.text || "{}";
      res.json(JSON.parse(jsonText));
    } catch (error) {
      console.error("AI mapping error:", error);
      res.status(500).json({ error: "Failed to map columns." });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
