import { useEffect } from "react";
import { getSchoolInfo } from "../services/settingsService";

const DEFAULT_FAVICON = "/favicon.svg";

function applyFavicon(href: string) {
  let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = href;
  if (href.toLowerCase().endsWith(".svg")) {
    link.type = "image/svg+xml";
  } else {
    link.removeAttribute("type");
  }
}

/** Pakai logo sekolah sebagai favicon bila URL-nya sudah ada di settings/school. */
export function useSchoolFavicon(): void {
  useEffect(() => {
    let cancelled = false;
    getSchoolInfo()
      .then((info) => {
        if (cancelled) return;
        const logo = info.logoUrl.trim();
        applyFavicon(logo || DEFAULT_FAVICON);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
}
