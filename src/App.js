import React, { useState, useEffect } from 'react';
import Login from './auth/Login';
import Register from './auth/Register';
import InvoiceForm from './components/InvoiceForm';
import { setAuthToken } from './api';

function App(){
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'));

  useEffect(()=> { setAuthToken(token); }, [token]);

  function handleLoginSuccess({ token, user }){
    setToken(token);
    setUser(user);
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
  }

  function logout(){
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setAuthToken(null);
  }

  if(!token) return (
    <div className="container">
      <h1>Invoice App</h1>
      <div style={{display:'flex', gap:20}}>
        <Login onLogin={handleLoginSuccess} />
        <Register />
      </div>
    </div>
  );

  return (
    <div className="container">
      <header style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <h2>Invoice Dashboard</h2>
        <div>
          <span style={{marginRight:10}}>Hello, {user?.name || user?.email}</span>
          <button onClick={logout}>Logout</button>
        </div>
      </header>
      <main>
        <InvoiceForm token={token} />
      </main>
    </div>
  );
}

export default App;
