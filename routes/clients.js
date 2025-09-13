const express = require('express');
const router = express.Router();
const pool = require('../db');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

function authMiddleware(req, res, next){
  const auth = req.headers.authorization;
  if(!auth) return res.status(401).json({ error: 'No token' });
  const token = auth.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch(err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// create client
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, address, motor_vehicle_no, gst, phone } = req.body;
    const [r] = await pool.query('INSERT INTO clients (name, address, motor_vehicle_no, gst, phone) VALUES (?, ?, ?, ?, ?)', [name, address, motor_vehicle_no, gst, phone]);
    const [rows] = await pool.query('SELECT * FROM clients WHERE id = ?', [r.insertId]);
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// search clients for autocomplete
router.get('/search', authMiddleware, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);
    const like = `%${q}%`;
    const [rows] = await pool.query('SELECT id, name, address, motor_vehicle_no, gst, phone FROM clients WHERE name LIKE ? OR address LIKE ? LIMIT 10', [like, like]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
