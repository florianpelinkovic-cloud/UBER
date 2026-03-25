import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, onSnapshot, updateDoc, doc, serverTimestamp, getDoc } from 'firebase/firestore';
import { UserProfile, Ride, Location } from '../types';
import Map from './Map';
import { motion, AnimatePresence } from 'motion/react';
import { Navigation, MapPin, User, CheckCircle2, X, Power, ArrowRight, Play, Check, Map as MapIcon } from 'lucide-react';

interface DriverViewProps {
  user: UserProfile;
}

const DriverView: React.FC<DriverViewProps> = ({ user }) => {
  const [currentLocation, setCurrentLocation] = useState<Location>({ lat: 48.8566, lng: 2.3522 });
  const [isOnline, setIsOnline] = useState(user.status === 'online');
  const [activeRide, setActiveRide] = useState<Ride | null>(null);
  const [incomingRides, setIncomingRides] = useState<Ride[]>([]);
  const [clientProfile, setClientProfile] = useState<UserProfile | null>(null);
  const [route, setRoute] = useState<{ lat: number; lng: number }[]>([]);

  // Fetch route from OSRM (Free)
  const fetchRoute = React.useCallback(async (start: Location, end: Location) => {
    try {
      const response = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`
      );
      const data = await response.json();
      if (data.routes && data.routes.length > 0) {
        const coordinates = data.routes[0].geometry.coordinates.map((coord: [number, number]) => ({
          lat: coord[1],
          lng: coord[0]
        }));
        setRoute(coordinates);
      }
    } catch (error) {
      console.error('Routing error:', error);
    }
  }, []);

  // Update route when active ride changes
  useEffect(() => {
    if (activeRide) {
      if (activeRide.status === 'accepted') {
        // Route to pickup
        fetchRoute(currentLocation, activeRide.pickup);
      } else if (activeRide.status === 'in_progress') {
        // Route to destination
        fetchRoute(currentLocation, activeRide.destination);
      }
    } else {
      setRoute([]);
    }
  }, [activeRide?.id, activeRide?.status, currentLocation.lat, currentLocation.lng, fetchRoute]);

  // Get current location
  useEffect(() => {
    if (navigator.geolocation) {
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          const loc = { lat: position.coords.latitude, lng: position.coords.longitude };
          setCurrentLocation(loc);
          if (isOnline) {
            updateDoc(doc(db, 'users', user.uid), { location: loc }).catch(e => handleFirestoreError(e, OperationType.UPDATE, 'users'));
          }
        },
        (error) => console.error('Geolocation error:', error),
        { enableHighAccuracy: true }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, [user.uid, isOnline]);

  // Listen for incoming ride requests
  useEffect(() => {
    if (!isOnline || activeRide) {
      setIncomingRides([]);
      return;
    }

    const q = query(
      collection(db, 'rides'),
      where('status', '==', 'requested')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const rides = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Ride));
      setIncomingRides(rides);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'rides'));

    return () => unsubscribe();
  }, [isOnline, activeRide]);

  // Listen for active ride
  useEffect(() => {
    const q = query(
      collection(db, 'rides'),
      where('driverId', '==', user.uid),
      where('status', 'in', ['accepted', 'arrived', 'in_progress'])
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      if (!snapshot.empty) {
        const rideData = snapshot.docs[0].data() as Ride;
        const ride = { ...rideData, id: snapshot.docs[0].id };
        setActiveRide(ride);

        // Fetch client profile
        const clientSnap = await getDoc(doc(db, 'users', ride.clientId));
        if (clientSnap.exists()) {
          setClientProfile(clientSnap.data() as UserProfile);
        }
      } else {
        setActiveRide(null);
        setClientProfile(null);
      }
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'rides'));

    return () => unsubscribe();
  }, [user.uid]);

  const toggleOnline = async () => {
    const newStatus = isOnline ? 'offline' : 'online';
    setIsOnline(!isOnline);
    try {
      await updateDoc(doc(db, 'users', user.uid), { status: newStatus });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users');
    }
  };

  const acceptRide = async (rideId: string) => {
    try {
      await updateDoc(doc(db, 'rides', rideId), {
        driverId: user.uid,
        status: 'accepted',
        acceptedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, 'users', user.uid), { status: 'busy' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'rides');
    }
  };

  const updateRideStatus = async (status: Ride['status']) => {
    if (!activeRide) return;
    try {
      await updateDoc(doc(db, 'rides', activeRide.id), { status });
      if (status === 'completed') {
        await updateDoc(doc(db, 'users', user.uid), { status: 'online' });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'rides');
    }
  };

  const markers = [
    { id: 'me', position: currentLocation, icon: 'https://maps.google.com/mapfiles/kml/shapes/cabs.png', title: 'Moi' },
    ...(activeRide ? [{ id: 'client', position: activeRide.pickup, icon: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png', title: 'Client' }] : [])
  ];

  return (
    <div className="relative h-screen w-full bg-black overflow-hidden font-sans">
      {/* Map Background */}
      <div className="absolute inset-0 z-0">
        <Map center={currentLocation} markers={markers} route={route} />
      </div>

      {/* Header Overlay */}
      <div className="absolute top-0 left-0 right-0 p-6 z-10 pointer-events-none">
        <div className="flex justify-between items-start">
          <div className="bg-black/80 backdrop-blur-xl p-4 rounded-2xl border border-white/10 pointer-events-auto">
            <p className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">Mode Chauffeur</p>
            <p className="text-sm font-medium text-white">{user.displayName}</p>
          </div>
          <button
            onClick={toggleOnline}
            className={`p-4 rounded-full backdrop-blur-xl border border-white/10 pointer-events-auto transition-all ${isOnline ? 'bg-green-500/20 text-green-500 border-green-500/20 shadow-[0_0_20px_rgba(34,197,94,0.3)]' : 'bg-neutral-900/80 text-neutral-500'}`}
          >
            <Power className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Bottom Interface */}
      <div className="absolute bottom-0 left-0 right-0 p-6 z-10">
        <AnimatePresence mode="wait">
          {!isOnline ? (
            <motion.div
              key="offline"
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="bg-black/90 backdrop-blur-2xl p-12 rounded-[40px] border border-white/10 text-center space-y-4"
            >
              <div className="w-16 h-16 rounded-full bg-neutral-800 flex items-center justify-center mx-auto">
                <Power className="w-8 h-8 text-neutral-500" />
              </div>
              <h2 className="text-2xl font-light text-white">Vous êtes hors ligne</h2>
              <p className="text-neutral-500 text-sm">Passez en ligne pour recevoir des courses</p>
              <button
                onClick={toggleOnline}
                className="w-full py-5 rounded-full bg-white text-black font-bold text-lg hover:bg-neutral-200 transition-all mt-4"
              >
                Passer en ligne
              </button>
            </motion.div>
          ) : activeRide ? (
            <motion.div
              key="active-ride"
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="bg-black/90 backdrop-blur-2xl p-8 rounded-[40px] border border-white/10 space-y-8 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-[10px] text-blue-500 uppercase tracking-widest font-bold">
                    {activeRide.status === 'accepted' ? 'En route vers le client' : activeRide.status === 'arrived' ? 'Client à bord' : 'Course en cours'}
                  </p>
                  <h2 className="text-2xl font-light tracking-tight text-white">
                    {activeRide.status === 'accepted' ? 'Récupération' : activeRide.status === 'arrived' ? 'Débuter la course' : 'Destination'}
                  </h2>
                </div>
                <div className="p-3 rounded-full bg-white/5 border border-white/5">
                  <Navigation className="w-5 h-5 text-white" />
                </div>
              </div>

              <div className="flex items-center space-x-4 p-6 rounded-3xl bg-white/5 border border-white/5">
                <div className="w-16 h-16 rounded-2xl bg-neutral-800 overflow-hidden">
                  <img src={clientProfile?.photoURL || "https://picsum.photos/seed/client/200"} alt="Client" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1">
                  <p className="text-lg font-medium text-white">{clientProfile?.displayName || 'Client'}</p>
                  <p className="text-sm text-neutral-500">{activeRide.pickup.address}</p>
                </div>
              </div>

              {activeRide.status === 'accepted' && (
                <button
                  onClick={() => updateRideStatus('arrived')}
                  className="w-full py-6 rounded-full bg-blue-500 text-white font-bold text-lg hover:bg-blue-600 transition-all flex items-center justify-center space-x-3"
                >
                  <CheckCircle2 className="w-6 h-6" />
                  <span>Je suis arrivé</span>
                </button>
              )}

              {activeRide.status === 'arrived' && (
                <button
                  onClick={() => updateRideStatus('in_progress')}
                  className="w-full py-6 rounded-full bg-green-500 text-white font-bold text-lg hover:bg-green-600 transition-all flex items-center justify-center space-x-3"
                >
                  <Play className="w-6 h-6" />
                  <span>Commencer la course</span>
                </button>
              )}

              {activeRide.status === 'in_progress' && (
                <button
                  onClick={() => updateRideStatus('completed')}
                  className="w-full py-6 rounded-full bg-white text-black font-bold text-lg hover:bg-neutral-200 transition-all flex items-center justify-center space-x-3"
                >
                  <Check className="w-6 h-6" />
                  <span>Terminer la course</span>
                </button>
              )}
            </motion.div>
          ) : incomingRides.length > 0 ? (
            <motion.div
              key="incoming"
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="bg-black/90 backdrop-blur-2xl p-8 rounded-[40px] border border-white/10 space-y-8 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-[10px] text-blue-500 uppercase tracking-widest font-bold animate-pulse">Nouvelle demande</p>
                  <h2 className="text-2xl font-light tracking-tight text-white">Course disponible</h2>
                </div>
                <div className="bg-blue-500/20 text-blue-500 px-4 py-2 rounded-full text-sm font-bold">
                  +12.50 €
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center space-x-4 p-4 rounded-2xl bg-white/5 border border-white/5">
                  <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-blue-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] text-neutral-500 uppercase tracking-wider">Récupération</p>
                    <p className="text-sm font-medium text-white truncate">{incomingRides[0].pickup.address}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4 p-4 rounded-2xl bg-white/5 border border-white/5">
                  <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center">
                    <ArrowRight className="w-5 h-5 text-neutral-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] text-neutral-500 uppercase tracking-wider">Destination</p>
                    <p className="text-sm font-medium text-white truncate">{incomingRides[0].destination.address}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setIncomingRides(prev => prev.slice(1))}
                  className="py-5 rounded-full bg-white/5 text-neutral-500 font-bold hover:bg-white/10 transition-all"
                >
                  Refuser
                </button>
                <button
                  onClick={() => acceptRide(incomingRides[0].id)}
                  className="py-5 rounded-full bg-white text-black font-bold hover:bg-neutral-200 transition-all"
                >
                  Accepter
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="waiting"
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="bg-black/90 backdrop-blur-2xl p-8 rounded-[40px] border border-white/10 flex items-center justify-between shadow-2xl"
            >
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <div className="w-3 h-3 bg-blue-500 rounded-full animate-ping" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">En attente de courses...</p>
                  <p className="text-xs text-neutral-500">Recherche dans votre zone</p>
                </div>
              </div>
              <div className="flex items-center space-x-2 text-neutral-500">
                <MapIcon className="w-4 h-4" />
                <span className="text-xs">Paris, FR</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default DriverView;
