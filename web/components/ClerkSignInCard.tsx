"use client";

import { SignIn } from "@clerk/nextjs";

export function ClerkSignInCard() {
  return (
    <div className="flex justify-center py-4">
      <SignIn
        routing="hash"
        forceRedirectUrl="/admin"
        appearance={{
          elements: {
            card: "bg-[var(--surface)] border border-[var(--border)] shadow-2xl",
          },
        }}
      />
    </div>
  );
}
