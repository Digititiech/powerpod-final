import React, { createContext, useContext, useMemo } from 'react';
import { FeatureKey, Profile } from '../types';
import { resolveFeatureFlags } from './featureFlags';

type AccessControlContextValue = {
  profile: Profile | null;
  features: Record<FeatureKey, boolean> | null;
  hasFeature: (key: FeatureKey) => boolean;
};

const AccessControlContext = createContext<AccessControlContextValue | null>(null);

export const AccessControlProvider: React.FC<{ profile: Profile | null; children: React.ReactNode }> = ({
  profile,
  children,
}) => {
  const features = useMemo(() => {
    if (!profile) return null;
    return resolveFeatureFlags(profile.role, profile.feature_flags ?? null);
  }, [profile]);

  const value = useMemo<AccessControlContextValue>(() => {
    return {
      profile,
      features,
      hasFeature: (key: FeatureKey) => {
        if (!profile) return false;
        if (!features) return false;
        return !!features[key];
      },
    };
  }, [profile, features]);

  return <AccessControlContext.Provider value={value}>{children}</AccessControlContext.Provider>;
};

export const useAccessControl = () => {
  const ctx = useContext(AccessControlContext);
  if (!ctx) {
    return {
      profile: null,
      features: null,
      hasFeature: (_key: FeatureKey) => false,
    } satisfies AccessControlContextValue;
  }
  return ctx;
};

