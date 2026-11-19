"use client";

import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query";
import { AuthProvider } from "@/components/app/AuthProvider";
import ClickBurstProvider from "@/components/ClickBurstProvider";

export function AppProviders({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}><AuthProvider>{children}<ClickBurstProvider /></AuthProvider></QueryClientProvider>;
}
