import React, { Profiler } from 'react';
import ReactDOM from 'react-dom/client';
import { isTauri } from '@tauri-apps/api/core';
import App from './App';
import './style.css';

let application = <App />;
if (import.meta.env.DEV && !isTauri()) {
  await import('./preview');
  application = <Profiler id="timer" onRender={() => {
    const target = window as unknown as { timerRenderCount?: number };
    target.timerRenderCount = (target.timerRenderCount ?? 0) + 1;
  }}>{application}</Profiler>;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{application}</React.StrictMode>);
