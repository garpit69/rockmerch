import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './migration.css';
import '../../assets/style.css';
import '../../assets/brand.css';
import '../../assets/record-room.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
