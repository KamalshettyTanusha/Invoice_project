const express = require('express');
const router = express.Router();
const pool = require('../db');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

function authMiddleware(req, res, next){
  const auth = req.headers.authorization;
  if(!auth) return res.status(401).json({ error: 'No token' });
  const token = auth.split(' ')[1];
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch(e) { return res.status(401).json({ error: 'Invalid token' }); }
}

// create/get product (ensures HSN unique)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, default_bag_qty } = req.body;
    if(!name) return res.status(400).json({ error: 'name required' });
    const [exist] = await pool.query('SELECT * FROM products WHERE name = ?', [name]);
    if(exist.length) return res.json(exist[0]);
    // generate unique 8-digit HSN
    let hsn = () => String(Math.floor(10000000 + Math.random() * 90000000));
    let candidate = hsn();
    while(true){
      const [chk] = await pool.query('SELECT id FROM products WHERE hsn_sac = ?', [candidate]);
      if(chk.length === 0) break;
      candidate = hsn();
    }
    const [r] = await pool.query('INSERT INTO products (name, hsn_sac, default_bag_qty) VALUES (?, ?, ?)', [name, candidate, default_bag_qty || 50]);
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [r.insertId]);
    res.json(rows[0]);
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
