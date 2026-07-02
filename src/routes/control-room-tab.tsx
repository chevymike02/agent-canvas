import type { LinksFunction } from "react-router";
import ControlRoomPage from "#/components/features/control-room/control-room-page";

// Control Room typefaces (Chakra Petch, IBM Plex Sans, IBM Plex Mono).
// Route-scoped so these external Google Fonts load only on /control-room.
export const links: LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@600;700&family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;500&display=swap",
  },
];

export default function ControlRoomTab() {
  return <ControlRoomPage />;
}
