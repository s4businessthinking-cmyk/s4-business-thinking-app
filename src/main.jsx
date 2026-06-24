import React from "react";
import ReactDOM from "react-dom/client";
import App from "./spare-parts-app.jsx";
import { startOfflineEngine } from "./offline/offlineBoot";

startOfflineEngine();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);