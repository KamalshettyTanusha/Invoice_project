import axios from 'axios';

const API_BASE = process.env.REACT_APP_API || 'http://localhost:4000/api';

const instance = axios.create({
  baseURL: API_BASE
});

export function setAuthToken(token){
  if(token) instance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  else delete instance.defaults.headers.common['Authorization'];
}

export default instance;
