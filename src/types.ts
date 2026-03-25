export type UserRole = 'client' | 'driver';
export type RideStatus = 'requested' | 'accepted' | 'arrived' | 'in_progress' | 'completed' | 'cancelled';

export interface Location {
  lat: number;
  lng: number;
  address?: string;
  heading?: number;
}

export interface Vehicle {
  model: string;
  plate: string;
  color: string;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  role: UserRole;
  status?: 'online' | 'offline' | 'busy';
  location?: Location;
  vehicle?: Vehicle;
  rating?: number;
}

export interface Ride {
  id: string;
  clientId: string;
  driverId?: string;
  status: RideStatus;
  pickup: Location;
  destination: Location;
  createdAt: any; // Firestore Timestamp
  acceptedAt?: any;
  completedAt?: any;
  eta?: number;
  distance?: number;
}
