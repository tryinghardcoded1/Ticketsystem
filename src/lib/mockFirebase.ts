export class Timestamp {
  seconds: number;
  nanoseconds: number;

  constructor(seconds: number, nanoseconds: number) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }

  static now() {
    const ms = Date.now();
    return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1000000);
  }

  static fromDate(date: Date) {
    const ms = date.getTime();
    return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1000000);
  }

  static fromMillis(milliseconds: number) {
    return new Timestamp(Math.floor(milliseconds / 1000), (milliseconds % 1000) * 1000000);
  }

  toDate() {
    return new Date(this.seconds * 1000 + Math.floor(this.nanoseconds / 1000000));
  }

  toMillis() {
    return this.seconds * 1000 + Math.floor(this.nanoseconds / 1000000);
  }

  valueOf() {
    return this.toMillis();
  }

  toString() {
    return this.toDate().toISOString();
  }
}

export function serverTimestamp() {
  return { _type: 'serverTimestamp' };
}

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
}

// Mock Auth Class representation
class MockAuth {
  currentUser: any = null;
  private listeners: ((user: any) => void)[] = [];

  constructor() {
    const cachedUser = localStorage.getItem('mock_auth_user');
    if (cachedUser) {
      try {
        this.currentUser = JSON.parse(cachedUser);
      } catch (e) {
        this.currentUser = null;
      }
    }
  }

  onAuthStateChanged(callback: (user: any) => void) {
    this.listeners.push(callback);
    setTimeout(() => {
      callback(this.currentUser);
    }, 0);

    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  _updateUser(user: any) {
    this.currentUser = user;
    if (user) {
      localStorage.setItem('mock_auth_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('mock_auth_user');
    }
    this.listeners.forEach(l => l(user));
  }

  signOut() {
    this._updateUser(null);
    return Promise.resolve();
  }
}

export const auth = new MockAuth();

export function getAuth() {
  return auth;
}

export function onAuthStateChanged(authInstance: MockAuth, callback: (user: any) => void) {
  return authInstance.onAuthStateChanged(callback);
}

export function signOut(authInstance: MockAuth) {
  return authInstance.signOut();
}

export function signInWithEmailAndPassword(authInstance: MockAuth, email: string, pass: string) {
  const uid = 'mock_uid_' + btoa(email).replace(/=/g, '');
  const user = {
    uid,
    email,
    displayName: email.split('@')[0],
    emailVerified: true
  };
  authInstance._updateUser(user);

  // Synchronously seed the profile for this user in mock Firestore
  const docPath = `users/${uid}`;
  const store = getFirestoreStore();
  if (!store[docPath]) {
    store[docPath] = {
      id: uid,
      email,
      displayName: email.split('@')[0],
      role: 'SUPER_ADMIN',
      createdAt: Timestamp.now()
    };
    saveFirestoreStore(store);
  }

  return Promise.resolve({ user });
}

export function createUserWithEmailAndPassword(authInstance: MockAuth, email: string, pass: string) {
  return signInWithEmailAndPassword(authInstance, email, pass);
}

export class GoogleAuthProvider {
  static credentialFromResult(res: any) {
    return { accessToken: 'mock-google-token' };
  }
  addScope() {}
  setCustomParameters() {}
}

export function signInWithPopup(authInstance: MockAuth, provider: any) {
  const email = 'cerezvincent24@gmail.com';
  return signInWithEmailAndPassword(authInstance, email, 'any_password');
}

export function initializeApp(config?: any) {
  return { name: 'mock-app' };
}

export function initializeFirestore(app: any, settings?: any, dbId?: string) {
  return { isMockDb: true };
}

export function getStorage() {
  return { isMockStorage: true };
}

// Firestore Database Classes
class MockDocumentSnapshot {
  id: string;
  private _data: any;

  constructor(id: string, data: any) {
    this.id = id;
    this._data = data;
  }

  exists() {
    return this._data !== null && this._data !== undefined;
  }

  data() {
    if (!this._data) return undefined;
    // Walk the parsed data structure and restore Timestamp helper methods
    const restored = JSON.parse(JSON.stringify(this._data));
    const restoreTimestamps = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;
      for (const key of Object.keys(obj)) {
        if (obj[key] && typeof obj[key] === 'object') {
          if (obj[key].seconds !== undefined && obj[key].nanoseconds !== undefined) {
            obj[key] = new Timestamp(obj[key].seconds, obj[key].nanoseconds);
          } else {
            restoreTimestamps(obj[key]);
          }
        }
      }
    };
    restoreTimestamps(restored);
    return restored;
  }
}

class MockQuerySnapshot {
  docs: MockDocumentSnapshot[];

  constructor(docsData: any[]) {
    this.docs = docsData.map(d => new MockDocumentSnapshot(d.id, d));
  }
}

class MockDocReference {
  path: string;
  id: string;

  constructor(path: string) {
    this.path = path;
    this.id = path.split('/').pop() || '';
  }
}

class MockCollectionReference {
  path: string;

  constructor(path: string) {
    this.path = path;
  }
}

export function collection(db: any, path: string, ...segments: string[]) {
  const fullPath = [path, ...segments].filter(Boolean).join('/');
  return new MockCollectionReference(fullPath);
}

export function doc(db: any, path: string, ...segments: string[]) {
  const fullPath = [path, ...segments].filter(Boolean).join('/');
  return new MockDocReference(fullPath);
}

export function query(ref: any, ...constraints: any[]) {
  return ref;
}

export function where(field: string, op: string, value: any) {
  return { type: 'where', field, op, value };
}

export function orderBy(field: string, direction: string = 'asc') {
  return { type: 'orderBy', field, direction };
}

function getDocsForCollection(path: string) {
  const store = getFirestoreStore();
  const docs: any[] = [];
  const targetSegmentsCount = path.split('/').length + 1;
  
  for (const key of Object.keys(store)) {
    if (key.startsWith(path + '/') && key.split('/').length === targetSegmentsCount) {
      docs.push({ id: key.split('/').pop(), ...store[key] });
    }
  }
  return docs;
}

export function getDocs(q: any) {
  const path = q.path;
  const docsData = getDocsForCollection(path);
  return Promise.resolve(new MockQuerySnapshot(docsData));
}

export function getDoc(docRef: any) {
  const path = docRef.path;
  const store = getFirestoreStore();
  const data = store[path] || null;
  return Promise.resolve(new MockDocumentSnapshot(docRef.id, data));
}

export function getDocFromServer(docRef: any) {
  return getDoc(docRef);
}

export function addDoc(collectionRef: any, data: any) {
  const path = collectionRef.path;
  const id = 'doc_' + Math.random().toString(36).substring(2, 11);
  const docPath = `${path}/${id}`;
  
  const store = getFirestoreStore();
  const cleanedData = JSON.parse(JSON.stringify(data));
  cleanedData.id = id;
  
  for (const key of Object.keys(cleanedData)) {
    if (cleanedData[key] && cleanedData[key]._type === 'serverTimestamp') {
      cleanedData[key] = Timestamp.now();
    }
  }
  
  store[docPath] = cleanedData;
  saveFirestoreStore(store);
  
  return Promise.resolve(new MockDocReference(docPath));
}

export function setDoc(docRef: any, data: any, options?: any) {
  const path = docRef.path;
  const store = getFirestoreStore();
  const cleanedData = JSON.parse(JSON.stringify(data));
  cleanedData.id = docRef.id;
  
  for (const key of Object.keys(cleanedData)) {
    if (cleanedData[key] && cleanedData[key]._type === 'serverTimestamp') {
      cleanedData[key] = Timestamp.now();
    }
  }

  if (options && options.merge && store[path]) {
    store[path] = { ...store[path], ...cleanedData };
  } else {
    store[path] = cleanedData;
  }
  
  saveFirestoreStore(store);
  return Promise.resolve();
}

export function updateDoc(docRef: any, data: any) {
  const path = docRef.path;
  const store = getFirestoreStore();
  if (store[path]) {
    const cleanedData = JSON.parse(JSON.stringify(data));
    store[path] = { ...store[path], ...cleanedData };
    saveFirestoreStore(store);
  }
  return Promise.resolve();
}

export function deleteDoc(docRef: any) {
  const path = docRef.path;
  const store = getFirestoreStore();
  
  // Delete the document itself and any sub-collection documents underneath it (e.g. notes)
  let changed = false;
  for (const key of Object.keys(store)) {
    if (key === path || key.startsWith(path + '/')) {
      delete store[key];
      changed = true;
    }
  }
  
  saveFirestoreStore(store);
  return Promise.resolve();
}

interface SnapshotSubscription {
  target: string;
  isQuery: boolean;
  callback: (snapshot: any) => void;
}

let snapshotsListeners: SnapshotSubscription[] = [];

function triggerFirestoreSnapshots() {
  snapshotsListeners.forEach(sub => {
    try {
      if (sub.isQuery) {
        const docs = getDocsForCollection(sub.target);
        sub.callback(new MockQuerySnapshot(docs));
      } else {
        const store = getFirestoreStore();
        const data = store[sub.target] || null;
        sub.callback(new MockDocumentSnapshot(sub.target.split('/').pop() || '', data));
      }
    } catch (e) {
      console.error("Firestore Mock Snapshot triggering issue:", sub.target, e);
    }
  });
}

export function onSnapshot(targetRef: any, callback: (snap: any) => void, errorCallback?: (err: any) => void) {
  const path = targetRef.path;
  const isQuery = targetRef instanceof MockCollectionReference;
  
  const sub = { target: path, isQuery, callback };
  snapshotsListeners.push(sub);
  
  setTimeout(() => {
    try {
      if (isQuery) {
        const docs = getDocsForCollection(path);
        callback(new MockQuerySnapshot(docs));
      } else {
        const store = getFirestoreStore();
        const data = store[path] || null;
        callback(new MockDocumentSnapshot(targetRef.id, data));
      }
    } catch (e) {
      if (errorCallback) errorCallback(e);
    }
  }, 0);
  
  return () => {
    snapshotsListeners = snapshotsListeners.filter(s => s !== sub);
  };
}

// Storage Helpers
export function ref(storage: any, path: string) {
  return { path };
}

export function uploadBytesResumable(storageRef: any, file: File) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const url = reader.result as string;
      const storageUrls = JSON.parse(localStorage.getItem('mock_storage_urls') || '{}');
      storageUrls[storageRef.path] = url;
      localStorage.setItem('mock_storage_urls', JSON.stringify(storageUrls));
      
      resolve({
        ref: storageRef,
        bytesTransferred: file.size,
        totalBytes: file.size,
        task: {
          on: (state: string, prog: any, err: any, complete: any) => {
            setTimeout(complete, 100);
          }
        }
      });
    };
    reader.readAsDataURL(file);
  });
}

export function getDownloadURL(storageRef: any) {
  const storageUrls = JSON.parse(localStorage.getItem('mock_storage_urls') || '{}');
  const cachedUrl = storageUrls[storageRef.path];
  return Promise.resolve(cachedUrl || 'https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&q=80&w=600');
}

// Seeding standard data
function getFirestoreStore() {
  const data = localStorage.getItem('mock_firestore_data');
  if (data) {
    try {
      return JSON.parse(data);
    } catch (e) {
      // recovery
    }
  }
  const seed = getSeedData();
  localStorage.setItem('mock_firestore_data', JSON.stringify(seed));
  return seed;
}

function saveFirestoreStore(store: any) {
  localStorage.setItem('mock_firestore_data', JSON.stringify(store));
  triggerFirestoreSnapshots();
}

function getSeedData() {
  const now = Timestamp.now();
  const past5d = Timestamp.fromMillis(Date.now() - 5 * 24 * 60 * 60 * 1000);
  const past3d = Timestamp.fromMillis(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const past10d = Timestamp.fromMillis(Date.now() - 10 * 24 * 60 * 60 * 1000);
  const future5d = Timestamp.fromMillis(Date.now() + 5 * 24 * 60 * 60 * 1000);

  return {
    // Users Collection
    'users/mock_uid_google_admin': {
      id: 'mock_uid_google_admin',
      email: 'license4booking@gmail.com',
      displayName: 'Super Admin',
      role: 'SUPER_ADMIN',
      createdAt: now
    },
    'users/mock_uid_user_admin': {
      id: 'mock_uid_user_admin',
      email: 'cerezvincent24@gmail.com',
      displayName: 'User Admin',
      role: 'SUPER_ADMIN',
      createdAt: now
    },

    // Vehicles Collection
    'vehicles/v1': {
      id: 'v1',
      plateNumber: 'KPT8942',
      make: 'Ford',
      model: 'Explorer',
      year: 2022,
      color: 'Magnetic Gray',
      status: 'rented',
      createdAt: now
    },
    'vehicles/v2': {
      id: 'v2',
      plateNumber: 'JNY3829',
      make: 'Chevrolet',
      model: 'Malibu',
      year: 2021,
      color: 'Silver Ice',
      status: 'available',
      createdAt: now
    },
    'vehicles/v3': {
      id: 'v3',
      plateNumber: 'ELEC099',
      make: 'Tesla',
      model: 'Model Y',
      year: 2023,
      color: 'Pearl White',
      status: 'available',
      createdAt: now
    },
    'vehicles/v4': {
      id: 'v4',
      plateNumber: 'PHL9921',
      make: 'Toyota',
      model: 'Camry',
      year: 2023,
      color: 'Midnight Black',
      status: 'maintenance',
      createdAt: now
    },

    // Rentals Collection
    'rentals/r1': {
      id: 'r1',
      firstName: 'James',
      lastName: 'Logan',
      customerName: 'James Logan',
      phone: '215-555-0199',
      email: 'james.logan@gmail.com',
      dob: '1988-04-12',
      streetAddress: '1200 S Broad St',
      city: 'Philadelphia',
      state: 'PA',
      postalCode: '19146',
      vehicle: '2022 Ford Explorer',
      plateNumber: 'KPT8942',
      startDate: past3d,
      endDate: future5d,
      status: 'active',
      agreements: { accidentNotification: true, killSwitch: true, underageFee: false, insuranceAck: true },
      createdAt: past3d
    },
    'rentals/r2': {
      id: 'r2',
      firstName: 'Sarah',
      lastName: 'Miller',
      customerName: 'Sarah Miller',
      phone: '267-555-0144',
      email: 'sarah.miller@example.com',
      dob: '1990-11-23',
      streetAddress: '245 Market St',
      city: 'Philadelphia',
      state: 'PA',
      postalCode: '19106',
      vehicle: '2021 Chevrolet Malibu',
      plateNumber: 'JNY3829',
      startDate: past10d,
      endDate: past3d,
      status: 'completed',
      agreements: { accidentNotification: true, killSwitch: true, underageFee: false, insuranceAck: true },
      createdAt: past10d
    },

    // Notes Subcollection
    'rentals/r1/notes/n1': {
      id: 'n1',
      text: 'Customer reported difficulty with GPS but otherwise liking the Ford Explorer.',
      author: 'Staff Member',
      timestamp: past3d
    },

    // Tickets Collection
    'tickets/t1': {
      id: 't1',
      plateNumber: 'KPT8942',
      violationDate: past3d,
      amount: 51.00,
      location: '1500 Arch St, Philadelphia',
      violationType: 'Overtime Parking',
      status: 'unpaid',
      matchedCustomer: 'James Logan',
      rentalId: 'r1',
      matchConfidence: 0.95,
      createdAt: past3d
    },
    'tickets/t2': {
      id: 't2',
      plateNumber: 'JNY3829',
      violationDate: past5d,
      amount: 76.00,
      location: '3401 Chestnut St, Philadelphia',
      violationType: 'Parking in Loading Zone',
      status: 'paid',
      matchedCustomer: 'Sarah Miller',
      rentalId: 'r2',
      matchConfidence: 0.92,
      createdAt: past5d
    },
    'tickets/t3': {
      id: 't3',
      plateNumber: 'XYZ777',
      violationDate: past3d,
      amount: 101.00,
      location: 'Broad & Chestnut Sts, Philadelphia',
      violationType: 'Red Light Camera Violation',
      status: 'unpaid',
      matchedCustomer: '',
      rentalId: '',
      matchConfidence: 0,
      suggestions: [],
      createdAt: past3d
    }
  };
}
