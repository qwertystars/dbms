import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "~/client/auth";
import { AuthConfigProvider } from "~/client/session";
import { App } from "~/client/App";
import "~/client/styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthConfigProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </AuthConfigProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
