import { createRoot } from "react-dom/client";
import App from "./App";
import { applyTheme, readTheme } from "./lib/theme";
import "./styles.css";
import "./theme-dark.css";

// Apply the persisted theme before the first React paint.
applyTheme(readTheme());

const container = document.getElementById("root");
if (!container) throw new Error("Root element missing");
createRoot(container).render(<App />);
