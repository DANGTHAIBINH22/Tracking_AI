"use client";

import React, { createContext, useContext } from "react";
import { ClerkProvider, Show, SignIn, UserButton, useUser } from "@clerk/nextjs";

import { ClerkAuthSync } from "./ClerkAuthSync";

export const IS_CLERK_ENABLED = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.trim().startsWith("pk_"),
);

interface SafeUserResult {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: {
    id: string;
    username?: string | null;
    fullName?: string | null;
    primaryEmailAddress?: { emailAddress: string } | null;
  } | null;
}

const DummyClerkContext = createContext<SafeUserResult>({
  isLoaded: true,
  isSignedIn: false,
  user: null,
});

export function ClerkAppProvider({ children }: { children: React.ReactNode }) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();

  if (IS_CLERK_ENABLED && publishableKey) {
    return (
      <ClerkProvider publishableKey={publishableKey}>
        <ClerkAuthSync />
        {children}
      </ClerkProvider>
    );
  }

  return (
    <DummyClerkContext.Provider value={{ isLoaded: true, isSignedIn: false, user: null }}>
      {children}
    </DummyClerkContext.Provider>
  );
}

export function useSafeUser(): SafeUserResult {
  const dummy = useContext(DummyClerkContext);
  const clerkResult = IS_CLERK_ENABLED ? useUser() : null;
  if (!IS_CLERK_ENABLED || !clerkResult) {
    return dummy;
  }
  return {
    isLoaded: clerkResult.isLoaded,
    isSignedIn: Boolean(clerkResult.isSignedIn),
    user: clerkResult.user ? {
      id: clerkResult.user.id,
      username: clerkResult.user.username,
      fullName: clerkResult.user.fullName,
      primaryEmailAddress: clerkResult.user.primaryEmailAddress ? { emailAddress: clerkResult.user.primaryEmailAddress.emailAddress } : null,
    } : null,
  };
}

export { Show, SignIn, UserButton, useUser };
