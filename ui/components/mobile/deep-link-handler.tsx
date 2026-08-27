"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function DeepLinkHandler() {
  useEffect(() => {
    const handleDeepLink = () => {
      const hash = window.location.hash;
      if (hash === "#add" || window.location.protocol === "moneymind:") {
        window.location.href = "/add";
      }
    };
    handleDeepLink();
    window.addEventListener("hashchange", handleDeepLink);
    return () => window.removeEventListener("hashchange", handleDeepLink);
  }, []);

  return null;
}
