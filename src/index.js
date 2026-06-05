import React from 'react';
import ReactDOM from 'react-dom/client';
import App2022 from './App2022';
import App2026 from './App2026';
import App2026Test from './App2026Test';

function getApp() {
  const hash = window.location.hash.replace('#', '');
  if (hash.startsWith('/test'))    return { Component: App2026Test, props: {} };
  if (hash.startsWith('/familia')) return { Component: App2026, props: { quinielaId: 'familia' } };
  if (hash.startsWith('/amigos'))  return { Component: App2026, props: { quinielaId: 'amigos' } };
  return { Component: App2022, props: {} };
}

function Router() {
  const [current, setCurrent] = React.useState(getApp);

  React.useEffect(() => {
    const onHash = () => setCurrent(getApp());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const { Component, props } = current;
  return <Component {...props} />;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><Router /></React.StrictMode>);
