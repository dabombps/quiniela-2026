import React from 'react';
import ReactDOM from 'react-dom/client';
import App2022 from './App2022';
import App2026 from './App2026';
import App2026Test from './App2026Test';

// Router basado en pathname
const path = window.location.pathname;

let AppComponent;
let appProps = {};

if (path === '/test' || path.startsWith('/test/')) {
  AppComponent = App2026Test;
} else if (path === '/familia' || path.startsWith('/familia/')) {
  AppComponent = App2026;
  appProps = { quinielaId: 'familia' };
} else if (path === '/amigos' || path.startsWith('/amigos/')) {
  AppComponent = App2026;
  appProps = { quinielaId: 'amigos' };
} else {
  // Default: 2022
  AppComponent = App2022;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <AppComponent {...appProps} />
  </React.StrictMode>
);
