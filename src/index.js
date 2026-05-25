import React from 'react';
import ReactDOM from 'react-dom/client';

// Router simple basado en pathname
const path = window.location.pathname;

let App;
if (path.startsWith('/familia')) {
  App = React.lazy(() => import('./App2026').then(m => ({ default: (props) => m.default({ ...props, quinielaId: 'familia' }) })));
} else if (path.startsWith('/amigos')) {
  App = React.lazy(() => import('./App2026').then(m => ({ default: (props) => m.default({ ...props, quinielaId: 'amigos' }) })));
} else if (path.startsWith('/test')) {
  App = React.lazy(() => import('./App2026Test'));
} else {
  App = React.lazy(() => import('./App2022'));
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <React.Suspense fallback={
      <div style={{minHeight:"100vh",background:"#060d1a",display:"flex",alignItems:"center",justifyContent:"center",color:"#f59e0b",fontFamily:"sans-serif",fontSize:18}}>
        ⚽ Cargando...
      </div>
    }>
      <App />
    </React.Suspense>
  </React.StrictMode>
);
