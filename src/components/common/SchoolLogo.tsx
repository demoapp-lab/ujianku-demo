import { useState } from "react";

export default function SchoolLogo({
  url,
  className = "h-10 w-10",
  alt = "Logo sekolah",
}: {
  url: string;
  className?: string;
  alt?: string;
}) {
  const src = url.trim();
  const [failed, setFailed] = useState(false);

  if (!src || failed) return null;

  return (
    <img
      key={src}
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="eager"
      decoding="async"
      className={`${className} shrink-0 object-contain`}
      onError={() => setFailed(true)}
      onLoad={() => setFailed(false)}
    />
  );
}
