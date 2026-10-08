import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { purgeLegacySession } from "./lib/session";

// Old versions kept the session in the shared localStorage; drop it.
purgeLegacySession();

createRoot(document.getElementById("root")!).render(<App />);
