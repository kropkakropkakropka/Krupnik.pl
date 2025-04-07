const AUTH_TOKEN_KEY = 'auth_token';
const USER_DATA_KEY = 'user_data';
const API_URL = 'http://localhost:5000/api';

function setAuth(token, userData) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(USER_DATA_KEY, JSON.stringify(userData));
}

function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

function getUser() {
  const userData = localStorage.getItem(USER_DATA_KEY);
  return userData ? JSON.parse(userData) : null;
}

function isAuthenticated() {
  return !!getAuthToken();
}

function logout() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(USER_DATA_KEY);
}

async function login(email, password) {
  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Błąd logowania');
    }
    
    setAuth(data.token, data.user);
    return data;
  } catch (error) {
    console.error('Błąd logowania:', error);
    throw error;
  }
}

async function register(username, email, password) {
  try {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, email, password })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Błąd rejestracji');
    }
    
    setAuth(data.token, data.user);
    return data;
  } catch (error) {
    console.error('Błąd rejestracji:', error);
    throw error;
  }
}

async function verifyToken() {
  try {
    const token = getAuthToken();
    
    if (!token) {
      return false;
    }
    
    const response = await fetch(`${API_URL}/auth/verify`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    return response.ok;
  } catch (error) {
    console.error('Błąd weryfikacji tokenu:', error);
    return false;
  }
}

async function updateUserData() {
  try {
    const token = getAuthToken();
    
    if (!token) {
      return null;
    }
    
    const response = await fetch(`${API_URL}/auth/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Nie można pobrać danych użytkownika');
    }
    
    const data = await response.json();
    localStorage.setItem(USER_DATA_KEY, JSON.stringify(data.user));
    
    return data.user;
  } catch (error) {
    console.error('Błąd aktualizacji danych użytkownika:', error);
    return null;
  }
}

async function fetchWithAuth(url, options = {}) {
  const token = getAuthToken();
  
  if (!token) {
    throw new Error('Użytkownik nie jest zalogowany');
  }
  
  const headers = {
    ...options.headers || {},
    'Authorization': `Bearer ${token}`
  };
  
  const response = await fetch(url, {
    ...options,
    headers
  });
  
  if (response.status === 401) {
    logout();
    window.location.href = '/login.html';
    throw new Error('Sesja wygasła, zaloguj się ponownie');
  }
  
  return response;
}