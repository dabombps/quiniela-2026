import React from 'react';
import ReactDOM from 'react-dom/client';
import App2022 from './App2022';
import App2026 from './App2026';
import App2026Test from './App2026Test';

// Router basado en hash (#/familia, #/amigos, #/test)
// Ventaja: no necesita configuración de servidor
const hash = window.location.hash; // ej: "#/familia"
const path = hash.replace('#', ''); // ej: "/familia"

let AppComponent;
let appProps = {};

if (path.startsWith('/test')) {
  AppComponent = App2026Test;
} else if (path.startsWith('/familia')) {
  AppComponent = App2026;
  appProps = { quinielaId: 'familia' };
} else if (path.startsWith('/amigos')) {
  AppComponent = App2026;
  appProps = { quinielaId: 'amigos' };
} else {
  AppComponent = App2022;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <AppComponent {...appProps} />
  </React.StrictMode>
);
