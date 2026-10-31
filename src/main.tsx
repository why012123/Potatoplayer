import { createRoot } from "react-dom/client";
import App from "./App";
import { applyTheme, readTheme } from "./lib/theme";
import "./styles.css";
import "./theme-dark.css";
import "./editorial.css";
import "./classic.css";
import "./appearance.css";
import "./stats.css";
import "./home.css";
import "./immersion.css";
import "./redesign.css";
import "./dive.css";
import "./brief.css";
import "./listening-room.css";
import "./graphics.css";

// Apply the persisted theme before the first React paint.
applyTheme(readTheme());

const container = document.getElementById("root");
if (!container) throw new Error("Root element missing");
createRoot(container).render(<App />);
