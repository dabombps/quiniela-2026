import React from 'react';
import ReactDOM from 'react-dom/client';
import App2026 from './App2026';

// Por defecto carga Familia, hash cambia entre quinielas
function getApp() {
  const hash = window.location.hash.replace('#', '');
  if (hash.startsWith('/amigos')) return { quinielaId: 'amigos' };
  return { quinielaId: 'familia' }; // default
}

function Router() {
  const [props, setProps] = React.useState(getApp);
  React.useEffect(() => {
    const onHash = () => setProps(getApp());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return <App2026 {...props} />;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<React.StrictMode><Router /></React.StrictMode>);
