import React, { useState } from 'react';
import api from '../api';

export default function Register(){
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  async function submit(e){
    e.preventDefault();
    try {
      const res = await api.post('/auth/register', { email, password, name });
      alert('Registered: ID ' + res.data.id + '. Now login.');
      setEmail(''); setPassword(''); setName('');
    } catch(err) {
      alert(err?.response?.data?.error || err.message);
    }
  }

  return (
    <div className="card">
      <h3>Register</h3>
      <form onSubmit={submit}>
        <input placeholder="Name" value={name} onChange={e=>setName(e.target.value)} />
        <input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
        <input placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
        <button type="submit">Register</button>
      </form>
    </div>
  );
}
