import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, getDocs, addDoc, serverTimestamp, Timestamp, doc, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { auth, db, loginWithGoogle, logout, handleFirestoreError, OperationType } from './lib/firebase';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import RentalsPage from './components/RentalsPage';
import TicketsPage from './components/TicketsPage';
import VehiclesPage from './components/VehiclesPage';
import UsersPage from './components/UsersPage';
import FormPage from './components/FormPage';
import TicketUploadPage from './components/TicketUploadPage';
import Chatbot from './components/Chatbot';
import { Rental, Ticket, Vehicle } from './types';
import { Car, Loader2 } from 'lucide-react';

import LoginPage from './components/LoginPage';

export default function App() {
  const [user, setUser] = React.useState<User | null>(null);
  const [authLoading, setAuthLoading] = React.useState(true);
  const [userProfile, setUserProfile] = React.useState<any>(null);
  const [profileLoading, setProfileLoading] = React.useState(true);
  
  const [rentals, setRentals] = React.useState<Rental[]>([]);
  const [tickets, setTickets] = React.useState<Ticket[]>([]);
  const [vehicles, setVehicles] = React.useState<Vehicle[]>([]);
  const [dataLoading, setDataLoading] = React.useState(true);

  React.useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        setProfileLoading(true);
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);
          const isBootstrapAdmin = user.email === 'license4booking@gmail.com' || user.email === 'cerezvincent24@gmail.com';

          if (!userDoc.exists()) {
            const profile = {
              email: user.email,
              displayName: user.displayName || user.email?.split('@')[0],
              role: 'SUPER_ADMIN',
              createdAt: serverTimestamp()
            };
            await setDoc(userDocRef, profile);
            setUserProfile(profile);
          } else {
            const data = userDoc.data();
            if (data?.role !== 'SUPER_ADMIN') {
              await updateDoc(userDocRef, { role: 'SUPER_ADMIN' });
              setUserProfile({ ...data, role: 'SUPER_ADMIN' });
            } else {
              setUserProfile(data);
            }
          }
        } catch (err: any) {
          console.error("Error syncing user profile:", err);
        } finally {
          setProfileLoading(false);
        }
      } else {
        setUserProfile(null);
        setProfileLoading(false);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  React.useEffect(() => {
    if (!user) {
      setRentals([]);
      setTickets([]);
      setVehicles([]);
      setDataLoading(false);
      return;
    }

    setDataLoading(true);

    const unsubRentals = onSnapshot(collection(db, 'rentals'), (snapshot) => {
      const rData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Rental));
      setRentals(rData);
    }, (e) => {
      console.error("Error syncing rentals live:", e);
    });

    const unsubTickets = onSnapshot(collection(db, 'tickets'), (snapshot) => {
      const tData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Ticket));
      setTickets(tData);
    }, (e) => {
      console.error("Error syncing tickets live:", e);
    });

    const unsubVehicles = onSnapshot(collection(db, 'vehicles'), (snapshot) => {
      const vData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Vehicle));
      setVehicles(vData);
      setDataLoading(false);
    }, (e) => {
      console.error("Error syncing vehicles live:", e);
      setDataLoading(false);
    });

    return () => {
      unsubRentals();
      unsubTickets();
      unsubVehicles();
    };
  }, [user]);

  if (authLoading || (user && profileLoading)) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <Car size={48} className="text-indigo-600 animate-bounce" />
          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest animate-pulse">Initializing System...</p>
        </div>
      </div>
    );
  }

  const PublicRoutes = (
    <Routes>
      <Route path="/rental-form" element={<FormPage />} />
      <Route path="/ticket-upload" element={<TicketUploadPage />} />
      <Route path="*" element={<LoginPage />} />
    </Routes>
  );

  if (!user) {
    return PublicRoutes;
  }

  return (
    <Layout user={user} userProfile={userProfile} onLogout={logout}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard rentals={rentals} tickets={tickets} />} />
        <Route path="/rentals" element={<RentalsPage />} />
        <Route path="/tickets" element={<TicketsPage userProfile={userProfile} />} />
        <Route path="/vehicles" element={<VehiclesPage />} />
        
        <Route 
          path="/users" 
          element={
            userProfile?.role === 'SUPER_ADMIN' || userProfile?.role === 'ADMIN' 
              ? <UsersPage /> 
              : <Navigate to="/dashboard" replace />
          } 
        />

        <Route path="/rental-form" element={<FormPage />} />
        <Route path="/ticket-upload" element={<TicketUploadPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <Chatbot rentals={rentals} tickets={tickets} vehicles={vehicles} />
    </Layout>
  );
}
