"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function UserNavbarClient() {
  return (
    <Button variant="ghost" size="sm" onClick={() => { window.location.href = "/api/auth/logout"; }} className="text-muted-foreground">
      <LogOut className="h-4 w-4 mr-1.5" />
      Log out
    </Button>
  );
}
