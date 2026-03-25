import React, { useState } from 'react';
import { auth, googleProvider, db, handleFirestoreError, OperationType } from '../firebase';
import { signInWithPopup } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { UserRole, UserProfile } from '../types';
import { motion } from 'motion/react';
import { Car, User, LogIn } from 'lucide-react';

interface AuthProps {
  onAuthSuccess: (user: UserProfile) => void;
}

const Auth: React.FC<AuthProps> = ({ onAuthSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<UserRole | null>(null);

  const handleLogin = async () => {
    if (!role) return;
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        onAuthSuccess(userSnap.data() as UserProfile);
      } else {
        const newUser: UserProfile = {
          uid: user.uid,
          displayName: user.displayName || 'Anonymous',
          email: user.email || '',
          photoURL: user.photoURL || '',
          role: role,
          status: role === 'driver' ? 'offline' : undefined,
          rating: role === 'driver' ? 5.0 : undefined,
        };
        await setDoc(userRef, newUser);
        onAuthSuccess(newUser);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'users');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 font-sans">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-12 text-center"
      >
        <div className="space-y-4">
          <h1 className="text-5xl font-light tracking-tighter">VTC PREMIUM</h1>
          <p className="text-neutral-500 text-sm uppercase tracking-widest">Minimalist Mobility</p>
        </div>

        {!role ? (
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setRole('client')}
              className="group flex flex-col items-center justify-center p-8 rounded-3xl border border-neutral-800 hover:border-white transition-all space-y-4 bg-neutral-900/50"
            >
              <User className="w-8 h-8 text-neutral-400 group-hover:text-white transition-colors" />
              <span className="text-sm font-medium">Client</span>
            </button>
            <button
              onClick={() => setRole('driver')}
              className="group flex flex-col items-center justify-center p-8 rounded-3xl border border-neutral-800 hover:border-white transition-all space-y-4 bg-neutral-900/50"
            >
              <Car className="w-8 h-8 text-neutral-400 group-hover:text-white transition-colors" />
              <span className="text-sm font-medium">Chauffeur</span>
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="p-6 rounded-3xl bg-neutral-900 border border-neutral-800 flex items-center justify-between">
              <div className="flex items-center space-y-1 text-left">
                <p className="text-xs text-neutral-500 uppercase tracking-wider">Mode sélectionné</p>
                <p className="text-lg font-medium capitalize">{role === 'client' ? 'Client' : 'Chauffeur'}</p>
              </div>
              <button
                onClick={() => setRole(null)}
                className="text-xs text-neutral-500 hover:text-white underline underline-offset-4"
              >
                Changer
              </button>
            </div>

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full py-5 rounded-full bg-white text-black font-semibold flex items-center justify-center space-x-3 hover:bg-neutral-200 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  <span>Se connecter avec Google</span>
                </>
              )}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default Auth;
