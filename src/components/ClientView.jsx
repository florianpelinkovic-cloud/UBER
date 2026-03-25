import React, { useState, useEffect, useCallback } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import Map from './Map';
import { motion, AnimatePresence } from 'motion/react';
import { Navigation, MapPin, Car, Star, X, CheckCircle2, Clock, Map as MapIcon } from 'lucide-react';

const ClientView = ({ user }) => {
  const [currentLocation, setCurrentLocation] = useState({ lat: 48.8566, lng: 2.3522 }); // Paris default
  const [activeRide, setActiveRide] = useState(null);
  const [nearbyDrivers, setNearbyDrivers] = useState([]);
  const [route, setRoute] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fetch route from OSRM (Free)
  const fetchRoute = useCallback(async (start, end) => {
    try {
      const response = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`
      );
      const data = await response.json();
      if (data.routes && data.routes.length > 0) {
        const coordinates = data.routes[0].geometry.coordinates.map((coord) => ({
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
      fetchRoute(activeRide.pickup, activeRide.destination);
    } else {
      setRoute([]);
    }
  }, [activeRide, fetchRoute]);

  // Get current location
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const loc = { lat: position.coords.latitude, lng: position.coords.longitude };
          setCurrentLocation(loc);
          // Update user location in DB
          updateDoc(doc(db, 'users', user.uid), { location: loc }).catch(e => handleFirestoreError(e, OperationType.UPDATE, 'users'));
        },
        (error) => console.error('Geolocation error:', error),
        { enableHighAccuracy: true }
      );
    }
  }, [user.uid]);

  // Listen for nearby drivers
  useEffect(() => {
    const q = query(
      collection(db, 'users'),
      where('role', '==', 'driver'),
      where('status', '==', 'online')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const drivers = snapshot.docs.map(doc => doc.data());
      setNearbyDrivers(drivers);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    return () => unsubscribe();
  }, []);

  // Listen for active ride
  useEffect(() => {
    const q = query(
      collection(db, 'rides'),
      where('clientId', '==', user.uid),
      where('status', 'in', ['requested', 'accepted', 'arrived', 'in_progress'])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const rideData = snapshot.docs[0].data();
        setActiveRide({ ...rideData, id: snapshot.docs[0].id });
      } else {
        setActiveRide(null);
      }
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'rides'));

    return () => unsubscribe();
  }, [user.uid]);

  const requestRide = async () => {
    if (!currentLocation) return;
    setLoading(true);
    try {
      // For simplicity, we'll pick a destination slightly offset from pickup
      const dest = {
        lat: currentLocation.lat + 0.01,
        lng: currentLocation.lng + 0.01,
        address: 'Destination'
      };

      await addDoc(collection(db, 'rides'), {
        clientId: user.uid,
        status: 'requested',
        pickup: { ...currentLocation, address: 'Ma position' },
        destination: dest,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'rides');
    } finally {
      setLoading(false);
    }
  };

  const cancelRide = async () => {
    if (!activeRide) return;
    try {
      await updateDoc(doc(db, 'rides', activeRide.id), { status: 'cancelled' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'rides');
    }
  };

  const markers = [
    { id: 'me', position: currentLocation, icon: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png', title: 'Moi' },
    ...nearbyDrivers.map(d => ({
      id: d.uid,
      position: d.location || { lat: 0, lng: 0 },
      icon: 'https://maps.google.com/mapfiles/kml/shapes/cabs.png',
      title: d.displayName
    }))
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
            <p className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold">VTC Premium</p>
            <p className="text-sm font-medium text-white">Bonjour, {(user.displayName || 'Client').split(' ')[0]}</p>
          </div>
          <div className="bg-black/80 backdrop-blur-xl p-4 rounded-full border border-white/10 pointer-events-auto">
            <Navigation className="w-5 h-5 text-white" />
          </div>
        </div>
      </div>

      {/* Bottom Interface */}
      <div className="absolute bottom-0 left-0 right-0 p-6 z-10">
        <AnimatePresence mode="wait">
          {!activeRide ? (
            <motion.div
              key="request"
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="bg-black/90 backdrop-blur-2xl p-8 rounded-[40px] border border-white/10 space-y-8 shadow-2xl"
            >
              <div className="space-y-6">
                <div className="flex items-center space-x-4 p-4 rounded-2xl bg-white/5 border border-white/5">
                  <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-blue-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] text-neutral-500 uppercase tracking-wider">Départ</p>
                    <p className="text-sm font-medium text-white">Ma position actuelle</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4 p-4 rounded-2xl bg-white/5 border border-white/5">
                  <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center">
                    <MapIcon className="w-5 h-5 text-neutral-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] text-neutral-500 uppercase tracking-wider">Destination</p>
                    <p className="text-sm font-medium text-neutral-400">Où allez-vous ?</p>
                  </div>
                </div>
              </div>

              <button
                onClick={requestRide}
                disabled={loading}
                className="w-full py-6 rounded-full bg-white text-black font-bold text-lg tracking-tight hover:bg-neutral-200 transition-all flex items-center justify-center space-x-3 disabled:opacity-50"
              >
                {loading ? (
                  <div className="w-6 h-6 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                ) : (
                  <>
                    <Car className="w-6 h-6" />
                    <span>Commander une course</span>
                  </>
                )}
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="active"
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="bg-black/90 backdrop-blur-2xl p-8 rounded-[40px] border border-white/10 space-y-8 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-[10px] text-blue-500 uppercase tracking-widest font-bold">
                    {activeRide.status === 'requested' ? 'Recherche de chauffeur...' : 'Chauffeur en route'}
                  </p>
                  <h2 className="text-2xl font-light tracking-tight text-white">
                    {activeRide.status === 'requested' ? 'Attente de confirmation' : 'Votre chauffeur arrive'}
                  </h2>
                </div>
                <button
                  onClick={cancelRide}
                  className="p-3 rounded-full bg-white/5 hover:bg-red-500/20 text-neutral-500 hover:text-red-500 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {activeRide.status !== 'requested' && (
                <div className="flex items-center space-x-4 p-6 rounded-3xl bg-white/5 border border-white/5">
                  <div className="w-16 h-16 rounded-2xl bg-neutral-800 overflow-hidden">
                    <img src="https://picsum.photos/seed/driver/200" alt="Driver" className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-lg font-medium text-white">Marc A.</p>
                      <div className="flex items-center space-x-1 text-yellow-500">
                        <Star className="w-4 h-4 fill-current" />
                        <span className="text-sm font-bold">4.9</span>
                      </div>
                    </div>
                    <p className="text-sm text-neutral-500">Tesla Model 3 • Noir • AB-123-CD</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex items-center space-x-3">
                  <Clock className="w-5 h-5 text-neutral-500" />
                  <div>
                    <p className="text-[10px] text-neutral-500 uppercase tracking-wider">Arrivée</p>
                    <p className="text-sm font-medium text-white">4 min</p>
                  </div>
                </div>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 flex items-center space-x-3">
                  <CheckCircle2 className="w-5 h-5 text-neutral-500" />
                  <div>
                    <p className="text-[10px] text-neutral-500 uppercase tracking-wider">Prix</p>
                    <p className="text-sm font-medium text-white">12.50 €</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default ClientView;
