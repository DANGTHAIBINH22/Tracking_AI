"use client";

import { useEffect, useRef } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { setAuthSession, clearAuthSession, getAuthToken, getStoredUser, UserPublic } from "@/lib/api";

export function ClerkAuthSync() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { user } = useUser();
  const lastSyncRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;

    if (isSignedIn && user) {
      const syncSession = async () => {
        try {
          // Get current Clerk session JWT token
          const token = await getToken();
          const username =
            user.primaryEmailAddress?.emailAddress ||
            user.username ||
            user.id;
          const fullName = user.fullName || user.username || "Quản trị viên (Clerk)";

          const syncKey = `${user.id}:${token?.slice(-10)}`;
          if (lastSyncRef.current === syncKey) return;
          lastSyncRef.current = syncKey;

          const adminUser: UserPublic = {
            id: 1,
            username: username,
            full_name: fullName,
            role: "admin",
          };

          if (token) {
            setAuthSession(token, adminUser);
          } else {
            // Fallback token if template is plain
            const existing = getAuthToken();
            if (!existing) {
              setAuthSession(`clerk_session_${user.id}`, adminUser);
            }
          }
        } catch (err) {
          console.error("Failed to sync Clerk token:", err);
        }
      };

      syncSession();
    }
  }, [isLoaded, isSignedIn, user, getToken]);

  return null;
}
